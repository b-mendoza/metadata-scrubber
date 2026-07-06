package config_test

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

func TestLoadPortValues(t *testing.T) {
	for _, tt := range []struct {
		name  string
		port  string
		unset bool
		want  int
	}{
		{name: "defaults when unset", unset: true, want: 8080},
		{name: "defaults when empty", want: 8080},
		{name: "parses valid port", port: "3000", want: 3000},
		{name: "accepts minimum port", port: "1", want: 1},
		{name: "accepts maximum port", port: "65535", want: 65535},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := loadConfig(t, tt.port, tt.unset)

			require.NoError(t, err)
			require.Equal(t, tt.want, cfg.Port)
		})
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	for _, tt := range []struct {
		name    string
		port    string
		message string
	}{
		{name: "non-numeric", port: "abc", message: "reading environment"},
		{name: "zero", port: "0", message: "invalid configuration"},
		{name: "negative", port: "-1", message: "invalid configuration"},
		{name: "out-of-range", port: "70000", message: "invalid configuration"},
		{name: "whitespace", port: "  8080  ", message: "reading environment"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := loadConfig(t, tt.port, false)

			require.Error(t, err)
			require.ErrorContains(t, err, tt.message)
		})
	}
}

func loadConfig(t *testing.T, port string, unset bool) (config.Config, error) {
	t.Helper()

	if unset {
		unsetenv(t, "PORT")
	} else {
		t.Setenv("PORT", port)
	}

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
