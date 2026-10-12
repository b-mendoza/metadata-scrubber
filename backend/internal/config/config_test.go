package config_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

const (
	portEnvKey                = "PORT"
	r2AccountIDEnvKey         = "R2_ACCOUNT_ID"
	r2AccessKeyIDEnvKey       = "R2_ACCESS_KEY_ID"
	r2SecretAccessKeyEnvKey   = "R2_SECRET_ACCESS_KEY"
	r2BucketEnvKey            = "R2_BUCKET"
	postHogProjectTokenEnvKey = "POSTHOG_PROJECT_TOKEN" //nolint:gosec // This constant names an environment variable, not a credential.

	validR2AccountID         = "0123456789abcdef0123456789abcdef"
	validR2AccessKeyID       = " synthetic-access-key-id "
	validR2SecretAccessKey   = " synthetic-secret-access-key "
	validR2Bucket            = "metadata-scrubber-test"
	validPostHogProjectToken = "phc_synthetic_project_token" //nolint:gosec // This token is synthetic test input, not a credential.
)

func setValidEnvironment(t *testing.T) {
	t.Helper()

	t.Setenv(portEnvKey, "8080")
	t.Setenv(r2AccountIDEnvKey, validR2AccountID)
	t.Setenv(r2AccessKeyIDEnvKey, validR2AccessKeyID)
	t.Setenv(r2SecretAccessKeyEnvKey, validR2SecretAccessKey)
	t.Setenv(r2BucketEnvKey, validR2Bucket)
	t.Setenv(postHogProjectTokenEnvKey, validPostHogProjectToken)
}

func TestLoadDefaultsPortWhenUnset(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv(portEnvKey, "")
	require.NoError(t, os.Unsetenv(portEnvKey))

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 8080, cfg.Port)
}

func TestLoadValidatesPortBounds(t *testing.T) {
	for _, testCase := range []struct {
		name string
		port string
		want int
	}{
		{name: "rejects zero", port: "0"},
		{name: "accepts minimum", port: "1", want: 1},
		{name: "accepts maximum", port: "65535", want: 65535},
		{name: "rejects above maximum", port: "65536"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidEnvironment(t)
			t.Setenv(portEnvKey, testCase.port)

			cfg, err := config.Load()

			if testCase.want == 0 {
				require.Equal(t, config.Config{}, cfg)
				require.ErrorContains(t, err, "invalid configuration")
				require.ErrorContains(t, err, "Port")
				return
			}
			require.NoError(t, err)
			require.Equal(t, testCase.want, cfg.Port)
		})
	}
}

func TestLoadRejectsAbsentOrBlankRequiredValues(t *testing.T) {
	for _, setting := range []struct {
		environmentKey string
		fieldName      string
	}{
		{environmentKey: r2AccountIDEnvKey, fieldName: "R2AccountID"},
		{environmentKey: r2AccessKeyIDEnvKey, fieldName: "R2AccessKeyID"},
		{environmentKey: r2SecretAccessKeyEnvKey, fieldName: "R2SecretAccessKey"},
		{environmentKey: r2BucketEnvKey, fieldName: "R2Bucket"},
		{environmentKey: postHogProjectTokenEnvKey, fieldName: "PostHogProjectToken"},
	} {
		t.Run(setting.fieldName, func(t *testing.T) {
			setValidEnvironment(t)
			t.Setenv(setting.environmentKey, " \t\n")

			cfg, err := config.Load()

			require.Equal(t, config.Config{}, cfg)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, setting.fieldName)
		})
	}
}

func TestLoadDoesNotDiscloseConfigurationValuesInErrors(t *testing.T) {
	const (
		accountIDSentinel       = "account-id-sentinel-4387"
		accessKeyIDSentinel     = "access-key-id-sentinel-9261"
		secretAccessKeySentinel = "secret-access-key-sentinel-5704"
		bucketSentinel          = "bucket-sentinel-1832"
	)

	for _, testCase := range []struct {
		name          string
		port          string
		projectKey    string
		errorCategory string
	}{
		{name: "validation failure", port: "8080", projectKey: "phx_project_sentinel_6023", errorCategory: "invalid configuration"},
		{name: "parse failure", port: "not-a-port", projectKey: "phc_project_sentinel_6023", errorCategory: "reading environment"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidEnvironment(t)
			t.Setenv(r2AccountIDEnvKey, accountIDSentinel)
			t.Setenv(r2AccessKeyIDEnvKey, accessKeyIDSentinel)
			t.Setenv(r2SecretAccessKeyEnvKey, secretAccessKeySentinel)
			t.Setenv(r2BucketEnvKey, bucketSentinel)
			t.Setenv(postHogProjectTokenEnvKey, testCase.projectKey)
			t.Setenv(portEnvKey, testCase.port)

			_, err := config.Load()

			require.ErrorContains(t, err, testCase.errorCategory)
			require.NotContains(t, err.Error(), accountIDSentinel)
			require.NotContains(t, err.Error(), accessKeyIDSentinel)
			require.NotContains(t, err.Error(), secretAccessKeySentinel)
			require.NotContains(t, err.Error(), bucketSentinel)
			require.NotContains(t, err.Error(), testCase.projectKey)
		})
	}
}

func TestLoadMapsEnvironmentAndTrimsPostHogToken(t *testing.T) {
	setValidEnvironment(t)
	t.Setenv(postHogProjectTokenEnvKey, " \t"+validPostHogProjectToken+" \r\n")
	t.Setenv(portEnvKey, "3000")

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, config.Config{
		Port:                3000,
		R2AccountID:         validR2AccountID,
		R2AccessKeyID:       validR2AccessKeyID,
		R2SecretAccessKey:   validR2SecretAccessKey,
		R2Bucket:            validR2Bucket,
		PostHogProjectToken: validPostHogProjectToken,
	}, cfg)
}
