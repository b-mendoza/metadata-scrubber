// Package config parses and validates environment variables into typed backend configuration.
package config

import (
	"fmt"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/go-playground/validator/v10"
)

const r2EndpointHostSuffix = ".r2.cloudflarestorage.com"

// configValidator is shared across calls; the validator caches per-struct
// reflection metadata, so it and its custom validations are initialized once.
var configValidator = newConfigValidator()

// Config is the validated environment configuration. Every field is guaranteed
// to satisfy its validation tags once Load returns without error.
type Config struct {
	// Port is the TCP port the HTTP server listens on.
	Port int `env:"PORT" envDefault:"8080" validate:"gte=1,lte=65535"`
	// R2Endpoint is the canonical Cloudflare R2 production endpoint.
	R2Endpoint string `env:"R2_ENDPOINT" validate:"r2_endpoint"`
	// R2AccessKeyID identifies the R2 credential pair.
	R2AccessKeyID string `env:"R2_ACCESS_KEY_ID" validate:"nonblank"`
	// R2SecretAccessKey is the secret paired with R2AccessKeyID.
	R2SecretAccessKey string `env:"R2_SECRET_ACCESS_KEY" validate:"nonblank"`
	// R2Bucket is the Cloudflare R2 bucket used by the backend.
	R2Bucket string `env:"R2_BUCKET" validate:"r2_bucket"`
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
	for tag, validation := range map[string]validator.Func{
		"nonblank":    validateNonblank,
		"r2_bucket":   validateR2Bucket,
		"r2_endpoint": validateR2Endpoint,
	} {
		if err := configValidator.RegisterValidation(tag, validation); err != nil {
			panic(fmt.Sprintf("registering %s configuration validation: %v", tag, err))
		}
	}

	return configValidator
}

func validateNonblank(field validator.FieldLevel) bool {
	return strings.TrimSpace(field.Field().String()) != ""
}

func validateR2Endpoint(field validator.FieldLevel) bool {
	accountLabel, found := strings.CutPrefix(field.Field().String(), "https://")
	if !found {
		return false
	}

	accountLabel, found = strings.CutSuffix(accountLabel, r2EndpointHostSuffix)
	return found && isLowercaseAlphanumericHyphenToken(accountLabel)
}

func validateR2Bucket(field validator.FieldLevel) bool {
	bucketName := field.Field().String()
	return len(bucketName) >= 3 && len(bucketName) <= 63 && isLowercaseAlphanumericHyphenToken(bucketName)
}

func isLowercaseAlphanumericHyphenToken(label string) bool {
	if label == "" || !isLowercaseAlphanumeric(label[0]) || !isLowercaseAlphanumeric(label[len(label)-1]) {
		return false
	}

	for index := 1; index < len(label)-1; index++ {
		character := label[index]
		if !isLowercaseAlphanumeric(character) && character != '-' {
			return false
		}
	}

	return true
}

func isLowercaseAlphanumeric(character byte) bool {
	return character >= 'a' && character <= 'z' || character >= '0' && character <= '9'
}
