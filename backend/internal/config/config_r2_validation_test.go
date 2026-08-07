package config_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

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
