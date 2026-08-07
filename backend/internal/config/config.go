// Package config parses and validates environment variables into typed backend configuration.
package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
	"github.com/go-playground/validator/v10"
	"github.com/go-playground/validator/v10/non-standard/validators"
)

// configValidator is shared across calls; the validator caches per-struct
// reflection metadata, so it and its custom validations are initialized once.
var configValidator = newConfigValidator()

// Config is the validated environment configuration. Every field is guaranteed
// to satisfy its validation tags once Load returns without error.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port int `env:"PORT" envDefault:"8080" validate:"gte=1,lte=65535"`
	// R2AccountID is the Cloudflare account whose R2 storage the backend uses.
	R2AccountID string `env:"R2_ACCOUNT_ID" validate:"notblank"`
	// R2AccessKeyID identifies the R2 credential pair.
	R2AccessKeyID string `env:"R2_ACCESS_KEY_ID" validate:"notblank"`
	// R2SecretAccessKey is the secret paired with R2AccessKeyID.
	R2SecretAccessKey string `env:"R2_SECRET_ACCESS_KEY" validate:"notblank"`
	// R2Bucket is the Cloudflare R2 bucket used by the backend.
	R2Bucket string `env:"R2_BUCKET" validate:"notblank"`
}

// R2Endpoint is the Cloudflare R2 endpoint for the configured account, built
// from the scheme and host suffix fixed here in code. The account ID is
// trusted as configured: it is validated only as non-blank, on the grounds
// that anyone able to set it could also read the R2 credentials.
func (c Config) R2Endpoint() string {
	return "https://" + c.R2AccountID + ".r2.cloudflarestorage.com"
}

// Load parses and validates the environment into Config.
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

func newConfigValidator() *validator.Validate {
	configValidator := validator.New(validator.WithRequiredStructEnabled())
	if err := configValidator.RegisterValidation("notblank", validators.NotBlank); err != nil {
		panic(fmt.Sprintf("registering notblank configuration validation: %v", err))
	}

	return configValidator
}
