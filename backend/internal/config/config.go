// Package config reads, parses, and validates the OS environment once at
// startup, exposing a sanitized, typed view the rest of the backend can trust
// instead of calling os.Getenv directly. It mirrors the frontend's centralized
// env module (frontend/src/shared/config/env/env.mod.server.ts), using
// go-playground/validator for constraint checks the way the frontend uses zod.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
)

const defaultPort = "8080"

// validate is shared across calls; the validator caches per-struct reflection
// metadata, so it is created once rather than per Load.
var validate = validator.New(validator.WithRequiredStructEnabled())

// Config is the validated environment configuration. Every field is guaranteed
// to satisfy its `validate` tag once Load returns without error.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port int `validate:"gte=1,lte=65535"`
}

// Load reads configuration from the OS environment, applies defaults for unset
// values, coerces it into Config, and validates the result. It returns a
// descriptive error when a variable is present but invalid, so the server can
// fail fast at startup rather than passing bad input downstream.
func Load() (Config, error) {
	raw := strings.TrimSpace(os.Getenv("PORT"))
	if raw == "" {
		raw = defaultPort
	}

	port, err := strconv.Atoi(raw)
	if err != nil {
		return Config{}, fmt.Errorf("invalid PORT %q: must be an integer", raw)
	}

	cfg := Config{Port: port}

	if err := validate.Struct(cfg); err != nil {
		return Config{}, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}
