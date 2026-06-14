// Package config reads, parses, and validates the OS environment once at
// startup, exposing a sanitized, typed view the rest of the backend can trust
// instead of calling os.Getenv directly. It mirrors the frontend's centralized
// env module (frontend/src/shared/config/env/env.mod.server.ts).
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	defaultPort = 8080
	minPort     = 1
	maxPort     = 65535
)

// Config is the validated environment configuration. Every field is guaranteed
// usable once Load returns without error.
type Config struct {
	// Port is the TCP port the HTTP server listens on, in [minPort, maxPort].
	Port int
}

// Load reads configuration from the OS environment, applies defaults for unset
// values, and validates the result. It returns a descriptive error when a
// variable is present but invalid, so the server can fail fast at startup
// rather than passing bad input downstream.
func Load() (Config, error) {
	port, err := loadPort()
	if err != nil {
		return Config{}, err
	}

	return Config{Port: port}, nil
}

// loadPort resolves PORT to a valid TCP port, defaulting to defaultPort when the
// variable is unset or blank.
func loadPort() (int, error) {
	raw := strings.TrimSpace(os.Getenv("PORT"))
	if raw == "" {
		return defaultPort, nil
	}

	port, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid PORT %q: must be an integer", raw)
	}

	if port < minPort || port > maxPort {
		return 0, fmt.Errorf("invalid PORT %d: must be between %d and %d", port, minPort, maxPort)
	}

	return port, nil
}
