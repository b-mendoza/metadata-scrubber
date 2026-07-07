// Package config reads, parses, and validates the OS environment once at
// startup, exposing a sanitized, typed view the rest of the backend can trust
// instead of calling os.Getenv directly. It mirrors the frontend's centralized
// env module (frontend/src/shared/config/env/env.mod.server.ts), using
// go-playground/validator for constraint checks the way the frontend uses zod.
package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
	"github.com/go-playground/validator/v10"
)

// configValidator is shared across calls; the validator caches per-struct reflection
// metadata, so it is created once rather than per Load.
var configValidator = validator.New(validator.WithRequiredStructEnabled())

// Config is the validated environment configuration. The `env` tags read and
// coerce values (with defaults) the way zod parses input; the `validate` tags
// enforce constraints the way zod refines it. Every field is guaranteed to
// satisfy its tags once Load returns without error.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port int `env:"PORT" envDefault:"8080" validate:"gte=1,lte=65535"`
}

// Load reads configuration from the OS environment, applies defaults for unset
// values, coerces it into Config, and validates the result. It returns a
// descriptive error when a variable is missing or invalid, so the server can
// fail fast at startup rather than passing bad input downstream.
func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return Config{}, fmt.Errorf("reading environment: %w", err)
	}

	if err := configValidator.Struct(cfg); err != nil {
		return Config{}, fmt.Errorf("invalid configuration: %w", err)
	}

	return cfg, nil
}
