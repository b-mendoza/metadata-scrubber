package config_test

import (
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

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
