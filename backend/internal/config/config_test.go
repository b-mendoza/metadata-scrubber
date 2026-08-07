package config_test

import (
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

const (
	portEnvKey              = "PORT"
	r2EndpointEnvKey        = "R2_ENDPOINT"
	r2AccessKeyIDEnvKey     = "R2_ACCESS_KEY_ID"
	r2SecretAccessKeyEnvKey = "R2_SECRET_ACCESS_KEY"
	r2BucketEnvKey          = "R2_BUCKET"

	validR2Endpoint        = "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"
	validR2AccessKeyID     = " synthetic-access-key-id "
	validR2SecretAccessKey = " synthetic-secret-access-key "
	validR2Bucket          = "metadata-scrubber-test"
)

func TestLoadDefaultsPortWhenUnset(t *testing.T) {
	cfg, err := loadConfigWithoutPort(t)

	require.NoError(t, err)
	require.Equal(t, 8080, cfg.Port)
}

func TestLoadDefaultsPortWhenEmpty(t *testing.T) {
	cfg, err := loadConfigWithPort(t, "")

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
			cfg, err := loadConfigWithPort(t, testCase.port)

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
			_, err := loadConfigWithPort(t, testCase.port)

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
			_, err := loadConfigWithPort(t, testCase.port)

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
	require.Equal(t, validR2Endpoint, cfg.R2Endpoint)
	require.Equal(t, validR2AccessKeyID, cfg.R2AccessKeyID)
	require.Equal(t, validR2SecretAccessKey, cfg.R2SecretAccessKey)
	require.Equal(t, validR2Bucket, cfg.R2Bucket)
}

func TestLoadRejectsAbsentOrBlankR2Values(t *testing.T) {
	for _, setting := range []struct {
		environmentKey string
		fieldName      string
	}{
		{environmentKey: r2EndpointEnvKey, fieldName: "R2Endpoint"},
		{environmentKey: r2AccessKeyIDEnvKey, fieldName: "R2AccessKeyID"},
		{environmentKey: r2SecretAccessKeyEnvKey, fieldName: "R2SecretAccessKey"},
		{environmentKey: r2BucketEnvKey, fieldName: "R2Bucket"},
	} {
		for _, input := range []struct {
			name  string
			value *string
		}{
			{name: "unset"},
			{name: "empty", value: stringPointer("")},
			{name: "ASCII whitespace only", value: stringPointer(" \t\n")},
			{name: "Unicode whitespace only", value: stringPointer("  ")},
		} {
			t.Run(setting.fieldName+"/"+input.name, func(t *testing.T) {
				setValidR2Environment(t)
				setOptionalEnvironmentValue(t, setting.environmentKey, input.value)

				cfg, err := config.Load()

				require.Equal(t, config.Config{}, cfg)
				require.Error(t, err)
				require.ErrorContains(t, err, "invalid configuration")
				require.ErrorContains(t, err, setting.fieldName)
			})
		}
	}
}

func TestLoadAcceptsCanonicalCloudflareR2Endpoint(t *testing.T) {
	setValidR2Environment(t)

	_, err := config.Load()

	require.NoError(t, err)
}

func TestLoadRejectsNonCanonicalR2Endpoints(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		endpoint string
	}{
		{name: "generic HTTPS URL", endpoint: "https://example.com"},
		{name: "generic R2-looking URL", endpoint: "https://r2.example.test"},
		{name: "bare hostname", endpoint: "account.r2.cloudflarestorage.com"},
		{name: "relative path", endpoint: "/account.r2.cloudflarestorage.com"},
		{name: "URL without host", endpoint: "https:account.r2.cloudflarestorage.com"},
		{name: "HTTP scheme", endpoint: "http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"},
		{name: "localhost", endpoint: "https://localhost"},
		{name: "loopback emulator", endpoint: "https://127.0.0.1:9000"},
		{name: "MinIO emulator", endpoint: "https://minio.example.test"},
		{name: "Amazon S3", endpoint: "https://s3.amazonaws.com"},
		{name: "Google Cloud Storage", endpoint: "https://storage.googleapis.com"},
		{name: "empty account label", endpoint: "https://r2.cloudflarestorage.com"},
		{name: "extra account label", endpoint: "https://team.account.r2.cloudflarestorage.com"},
		{name: "attacker-controlled suffix", endpoint: "https://account.r2.cloudflarestorage.com.example.com"},
		{name: "misspelled suffix", endpoint: "https://account.r2.cloudflare-storage.com"},
		{name: "uppercase scheme", endpoint: "HTTPS://account.r2.cloudflarestorage.com"},
		{name: "uppercase host", endpoint: "https://ACCOUNT.r2.cloudflarestorage.com"},
		{name: "trailing DNS dot", endpoint: "https://account.r2.cloudflarestorage.com."},
		{name: "username", endpoint: "https://user@account.r2.cloudflarestorage.com"},
		{name: "username and password", endpoint: "https://user:password@account.r2.cloudflarestorage.com"},
		{name: "explicit default port", endpoint: "https://account.r2.cloudflarestorage.com:443"},
		{name: "trailing slash", endpoint: "https://account.r2.cloudflarestorage.com/"},
		{name: "bucket path", endpoint: "https://account.r2.cloudflarestorage.com/bucket"},
		{name: "query string", endpoint: "https://account.r2.cloudflarestorage.com?bucket=test"},
		{name: "fragment", endpoint: "https://account.r2.cloudflarestorage.com#bucket"},
		{name: "surrounding whitespace", endpoint: " https://account.r2.cloudflarestorage.com "},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(r2EndpointEnvKey, testCase.endpoint)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, "R2Endpoint")
			require.NotContains(t, err.Error(), testCase.endpoint)
		})
	}
}

func TestLoadAcceptsCloudflareCompatibleBucketNames(t *testing.T) {
	for _, bucket := range []string{
		"abc",
		strings.Repeat("a", 63),
		"letters",
		"1bucket9",
		"metadata--scrubber",
		"metadata-scrubber-2",
	} {
		t.Run(bucket, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(r2BucketEnvKey, bucket)

			_, err := config.Load()

			require.NoError(t, err)
		})
	}
}

func TestLoadRejectsInvalidBucketNames(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		bucket string
	}{
		{name: "too short", bucket: "ab"},
		{name: "too long", bucket: strings.Repeat("a", 64)},
		{name: "leading hyphen", bucket: "-bucket"},
		{name: "trailing hyphen", bucket: "bucket-"},
		{name: "uppercase letter", bucket: "Bucket"},
		{name: "leading whitespace", bucket: " bucket"},
		{name: "trailing whitespace", bucket: "bucket "},
		{name: "internal whitespace", bucket: "buck et"},
		{name: "underscore", bucket: "my_bucket"},
		{name: "period", bucket: "my.bucket"},
		{name: "slash", bucket: "my/bucket"},
		{name: "colon", bucket: "my:bucket"},
		{name: "non-ASCII letter", bucket: "bücket"},
		{name: "non-ASCII symbol", bucket: "buck€t"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			t.Setenv(r2BucketEnvKey, testCase.bucket)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, "R2Bucket")
		})
	}
}

func TestLoadDoesNotDiscloseConfigurationValuesInErrors(t *testing.T) {
	for _, testCase := range []struct {
		name                   string
		configureFail          func(t *testing.T)
		errorCategory          string
		configuredFailureValue string
	}{
		{
			name: "validation failure",
			configureFail: func(t *testing.T) {
				t.Helper()
				t.Setenv(r2BucketEnvKey, "invalid.bucket")
			},
			errorCategory:          "invalid configuration",
			configuredFailureValue: "invalid.bucket",
		},
		{
			name: "parse failure",
			configureFail: func(t *testing.T) {
				t.Helper()
				t.Setenv(portEnvKey, "not-a-port")
			},
			errorCategory: "reading environment",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setValidR2Environment(t)
			testCase.configureFail(t)

			_, err := config.Load()

			require.Error(t, err)
			require.ErrorContains(t, err, testCase.errorCategory)
			require.NotContains(t, err.Error(), validR2Endpoint)
			require.NotContains(t, err.Error(), validR2AccessKeyID)
			require.NotContains(t, err.Error(), validR2SecretAccessKey)
			require.NotContains(t, err.Error(), validR2Bucket)
			if testCase.configuredFailureValue != "" {
				require.NotContains(t, err.Error(), testCase.configuredFailureValue)
			}
		})
	}
}

func loadConfigWithPort(t *testing.T, port string) (config.Config, error) {
	t.Helper()

	setValidR2Environment(t)
	t.Setenv(portEnvKey, port)

	return config.Load()
}

func loadConfigWithoutPort(t *testing.T) (config.Config, error) {
	t.Helper()

	setValidR2Environment(t)
	unsetEnvironmentValue(t, portEnvKey)

	return config.Load()
}

func setValidR2Environment(t *testing.T) {
	t.Helper()

	t.Setenv(r2EndpointEnvKey, validR2Endpoint)
	t.Setenv(r2AccessKeyIDEnvKey, validR2AccessKeyID)
	t.Setenv(r2SecretAccessKeyEnvKey, validR2SecretAccessKey)
	t.Setenv(r2BucketEnvKey, validR2Bucket)
}

func setOptionalEnvironmentValue(t *testing.T, key string, value *string) {
	t.Helper()

	if value == nil {
		unsetEnvironmentValue(t, key)
		return
	}

	t.Setenv(key, *value)
}

func unsetEnvironmentValue(t *testing.T, key string) {
	t.Helper()

	// t.Setenv first so the testing package registers the restore of the
	// original value; os.Unsetenv then removes the variable for this test.
	t.Setenv(key, "")
	require.NoError(t, os.Unsetenv(key))
}

func stringPointer(value string) *string {
	return &value
}
