package config_test

import (
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

const (
	portEnvKey              = "PORT"
	r2AccountIDEnvKey       = "R2_ACCOUNT_ID"
	r2AccessKeyIDEnvKey     = "R2_ACCESS_KEY_ID"
	r2SecretAccessKeyEnvKey = "R2_SECRET_ACCESS_KEY"
	r2BucketEnvKey          = "R2_BUCKET"

	validR2AccountID       = "0123456789abcdef0123456789abcdef"
	validR2AccessKeyID     = " synthetic-access-key-id "
	validR2SecretAccessKey = " synthetic-secret-access-key "
	validR2Bucket          = "metadata-scrubber-test"
)

func TestLoadDefaultsPortWhenUnset(t *testing.T) {
	setValidR2Environment(t)
	unsetEnvironmentValue(t, portEnvKey)

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 8080, cfg.Port)
}

func TestLoadDefaultsPortWhenEmpty(t *testing.T) {
	setValidR2Environment(t)
	t.Setenv(portEnvKey, "")

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 8080, cfg.Port)
}

func TestLoadParsesExplicitPorts(t *testing.T) {
	for _, testCase := range []struct {
		name string
		port string
		want int
	}{
		{name: "parses valid port", port: "3000", want: 3000},
		{name: "accepts minimum port", port: "1", want: 1},
		{name: "accepts maximum port", port: "65535", want: 65535},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(portEnvKey, testCase.port)

			cfg, err := config.Load()

			require.NoError(t, err)
			require.Equal(t, testCase.want, cfg.Port)
		})
	}
}

func TestLoadRejectsUnparseablePort(t *testing.T) {
	for _, testCase := range []struct {
		name string
		port string
	}{
		{name: "rejects non-numeric port", port: "abc"},
		{name: "rejects whitespace-padded port", port: "  8080  "},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(portEnvKey, testCase.port)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, "reading environment")
			require.ErrorContains(t, err, "Port")
		})
	}
}

func TestLoadRejectsOutOfRangePort(t *testing.T) {
	for _, testCase := range []struct {
		name string
		port string
	}{
		{name: "rejects zero port", port: "0"},
		{name: "rejects negative port", port: "-1"},
		{name: "rejects port above maximum", port: "70000"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(portEnvKey, testCase.port)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, "Port")
		})
	}
}

func TestLoadReturnsCompleteR2ConfigurationUnchanged(t *testing.T) {
	setValidR2Environment(t)
	t.Setenv(portEnvKey, "3000")

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 3000, cfg.Port)
	require.Equal(t, validR2AccountID, cfg.R2AccountID)
	require.Equal(t, validR2AccessKeyID, cfg.R2AccessKeyID)
	require.Equal(t, validR2SecretAccessKey, cfg.R2SecretAccessKey)
	require.Equal(t, validR2Bucket, cfg.R2Bucket)
}

func TestR2EndpointFixesSchemeAndHostAroundAccountID(t *testing.T) {
	cfg := config.Config{R2AccountID: validR2AccountID}

	require.Equal(
		t,
		"https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
		cfg.R2Endpoint(),
	)
}

func TestR2EndpointPreventsAccountIDFromChangingURLStructure(t *testing.T) {
	const hostSuffix = ".r2.cloudflarestorage.com"

	for _, testCase := range []struct {
		name      string
		accountID string
	}{
		{name: "prevents user info", accountID: "attacker@example.com"},
		{name: "prevents path", accountID: "example.com/path"},
		{name: "prevents query", accountID: "example.com?host=attacker.example"},
		{name: "prevents fragment", accountID: "example.com#attacker.example"},
		{name: "prevents port", accountID: "example.com:443"},
		{name: "prevents alternate host suffix", accountID: "example.com.attacker.example"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			cfg := config.Config{R2AccountID: testCase.accountID}

			endpoint, err := url.Parse(cfg.R2Endpoint())
			if err != nil {
				return
			}

			require.Equal(t, "https", endpoint.Scheme)
			require.Nil(t, endpoint.User)
			require.Empty(t, endpoint.Path)
			require.Empty(t, endpoint.RawQuery)
			require.Empty(t, endpoint.Fragment)
			require.True(t, strings.HasSuffix(endpoint.Host, hostSuffix))
		})
	}
}

func TestLoadAcceptsAnyNonblankBucketName(t *testing.T) {
	for _, bucket := range []string{"my_bucket", "My.Bucket", "ab"} {
		t.Run(bucket, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(r2BucketEnvKey, bucket)

			_, err := config.Load()

			require.NoError(t, err)
		})
	}
}

func TestLoadRejectsAbsentOrBlankR2Values(t *testing.T) {
	for _, setting := range []struct {
		environmentKey string
		fieldName      string
	}{
		{environmentKey: r2AccountIDEnvKey, fieldName: "R2AccountID"},
		{environmentKey: r2AccessKeyIDEnvKey, fieldName: "R2AccessKeyID"},
		{environmentKey: r2SecretAccessKeyEnvKey, fieldName: "R2SecretAccessKey"},
		{environmentKey: r2BucketEnvKey, fieldName: "R2Bucket"},
	} {
		for _, input := range []struct {
			name  string
			value string
			unset bool
		}{
			{name: "unset", unset: true},
			{name: "empty", value: ""},
			{name: "ASCII whitespace only", value: " \t\n"},
			{name: "Unicode whitespace only", value: "  "},
		} {
			t.Run(setting.fieldName+"/"+input.name, func(t *testing.T) {
				setValidR2Environment(t)
				if input.unset {
					unsetEnvironmentValue(t, setting.environmentKey)
				} else {
					t.Setenv(setting.environmentKey, input.value)
				}

				cfg, err := config.Load()

				require.Equal(t, config.Config{}, cfg)
				require.Error(t, err)
				require.ErrorContains(t, err, "invalid configuration")
				require.ErrorContains(t, err, setting.fieldName)
			})
		}
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
		name                     string
		port                     string
		errorCategory            string
		portStaysAbsentFromError bool
	}{
		{name: "validation failure", port: "70000", errorCategory: "invalid configuration", portStaysAbsentFromError: true},
		// The env library repeats an unparsable value inside its parse error.
		{name: "parse failure", port: "not-a-port", errorCategory: "reading environment"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv(r2AccountIDEnvKey, accountIDSentinel)
			t.Setenv(r2AccessKeyIDEnvKey, accessKeyIDSentinel)
			t.Setenv(r2SecretAccessKeyEnvKey, secretAccessKeySentinel)
			t.Setenv(r2BucketEnvKey, bucketSentinel)
			t.Setenv(portEnvKey, testCase.port)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, testCase.errorCategory)
			if testCase.portStaysAbsentFromError {
				require.NotContains(t, err.Error(), testCase.port)
			}
			require.NotContains(t, err.Error(), accountIDSentinel)
			require.NotContains(t, err.Error(), accessKeyIDSentinel)
			require.NotContains(t, err.Error(), secretAccessKeySentinel)
			require.NotContains(t, err.Error(), bucketSentinel)
		})
	}
}

func setValidR2Environment(t *testing.T) {
	t.Helper()

	t.Setenv(r2AccountIDEnvKey, validR2AccountID)
	t.Setenv(r2AccessKeyIDEnvKey, validR2AccessKeyID)
	t.Setenv(r2SecretAccessKeyEnvKey, validR2SecretAccessKey)
	t.Setenv(r2BucketEnvKey, validR2Bucket)
}

func unsetEnvironmentValue(t *testing.T, key string) {
	t.Helper()

	// t.Setenv first so the testing package registers the restore of the
	// original value; os.Unsetenv then removes the variable for this test.
	t.Setenv(key, "")
	require.NoError(t, os.Unsetenv(key))
}
