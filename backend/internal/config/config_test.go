package config_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

const portEnvKey = "PORT"

func TestLoadDefaultsPortWhenUnset(t *testing.T) {
	t.Run("defaults when unset", func(t *testing.T) {
		cfg, err := loadConfigWithoutPort(t)

		require.NoError(t, err)
		require.Equal(t, 8080, cfg.Port)
	})
}

func TestLoadDefaultsPortWhenEmpty(t *testing.T) {
	cfg, err := loadConfigWithPort(t, "")

	require.NoError(t, err)
	require.Equal(t, 8080, cfg.Port)
}

func TestLoadParsesExplicitPorts(t *testing.T) {
	for _, tt := range []struct {
		name string
		port string
		want int
	}{
		{name: "parses valid port", port: "3000", want: 3000},
		{name: "accepts minimum port", port: "1", want: 1},
		{name: "accepts maximum port", port: "65535", want: 65535},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := loadConfigWithPort(t, tt.port)

			require.NoError(t, err)
			require.Equal(t, tt.want, cfg.Port)
		})
	}
}

func TestLoadRejectsUnparseablePort(t *testing.T) {
	for _, tt := range []struct {
		name string
		port string
	}{
		{name: "rejects non-numeric port", port: "abc"},
		{name: "rejects whitespace-padded port", port: "  8080  "},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := loadConfigWithPort(t, tt.port)

			require.Error(t, err)
			require.ErrorContains(t, err, "reading environment")
			require.ErrorContains(t, err, "Port")
		})
	}
}

func TestLoadRejectsOutOfRangePort(t *testing.T) {
	for _, tt := range []struct {
		name string
		port string
	}{
		{name: "rejects zero port", port: "0"},
		{name: "rejects negative port", port: "-1"},
		{name: "rejects port above maximum", port: "70000"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := loadConfigWithPort(t, tt.port)

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, "Port")
		})
	}
}

func loadConfigWithPort(t *testing.T, port string) (config.Config, error) {
	t.Helper()

	t.Setenv(portEnvKey, port)

	return config.Load()
}

func loadConfigWithoutPort(t *testing.T) (config.Config, error) {
	t.Helper()

	unsetenv(t, portEnvKey)

	return config.Load()
}

func unsetenv(t *testing.T, key string) {
	t.Helper()

	value, ok := os.LookupEnv(key)
	require.NoError(t, os.Unsetenv(key))
	t.Cleanup(func() {
		if ok {
			require.NoError(t, os.Setenv(key, value))
			return
		}

		require.NoError(t, os.Unsetenv(key))
	})
}
