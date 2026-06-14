package config_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

func TestLoadDefaultsPortWhenUnsetOrBlank(t *testing.T) {
	for name, value := range map[string]string{
		"unset": "",
		"blank": "   ",
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("PORT", value)

			cfg, err := config.Load()

			require.NoError(t, err)
			require.Equal(t, 8080, cfg.Port)
		})
	}
}

func TestLoadParsesValidPort(t *testing.T) {
	t.Setenv("PORT", " 3000 ")

	cfg, err := config.Load()

	require.NoError(t, err)
	require.Equal(t, 3000, cfg.Port)
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	for name, value := range map[string]string{
		"non-numeric":  "abc",
		"zero":         "0",
		"negative":     "-1",
		"out-of-range": "70000",
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("PORT", value)

			_, err := config.Load()

			require.Error(t, err)
		})
	}
}
