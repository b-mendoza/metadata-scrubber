package storage

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
	"unicode"
)

// validateSourceUploadInput checks a source upload in the order file ID, size,
// expiry, and returns the source object key.
func validateSourceUploadInput(fileID string, sizeBytes int64, expiry time.Duration) (string, error) {
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return "", err
	}
	if err := validateSourceUploadSize(sizeBytes); err != nil {
		return "", err
	}
	if err := validatePresignExpiry(expiry); err != nil {
		return "", err
	}

	return objectKey, nil
}

// validateSanitizedDownloadInput checks a sanitized download in the order file
// ID, ETag, expiry, and returns the sanitized revision key.
func validateSanitizedDownloadInput(
	fileID string,
	sourceETag string,
	expiry time.Duration,
) (string, error) {
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return "", err
	}
	if err := validatePresignExpiry(expiry); err != nil {
		return "", err
	}

	return objectKey, nil
}

// validateSourceReadInput checks a source read in the order file ID then
// optional expected ETag, and returns the source object key.
func validateSourceReadInput(fileID string, expectedETag string) (string, error) {
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return "", err
	}
	if expectedETag != "" {
		if err := validateCanonicalETag(expectedETag); err != nil {
			return "", err
		}
	}

	return objectKey, nil
}

// SourceObjectKey derives the private source-object key for a logical file ID.
func SourceObjectKey(fileID string) (string, error) {
	if err := validateFileID(fileID); err != nil {
		return "", err
	}

	return "source/" + fileID, nil
}

// SanitizedObjectPrefix derives the private prefix for every sanitized revision of one file.
func SanitizedObjectPrefix(fileID string) (string, error) {
	if err := validateFileID(fileID); err != nil {
		return "", err
	}

	return "sanitized/" + fileID + "/", nil
}

// SanitizedObjectKey derives an immutable key whose final segment reversibly encodes the source ETag.
func SanitizedObjectKey(fileID string, sourceETag string) (string, error) {
	prefix, err := SanitizedObjectPrefix(fileID)
	if err != nil {
		return "", err
	}
	if err := validateCanonicalETag(sourceETag); err != nil {
		return "", err
	}

	encodedETag := base64.RawURLEncoding.EncodeToString([]byte(sourceETag))
	return prefix + encodedETag, nil
}

// NormalizeProviderETag converts one quoted strong provider ETag into canonical domain form.
func NormalizeProviderETag(providerETag string) (string, error) {
	if len(providerETag) < 3 || providerETag[0] != '"' || providerETag[len(providerETag)-1] != '"' {
		return "", ErrInvalidETag
	}

	normalizedETag := providerETag[1 : len(providerETag)-1]
	if err := validateCanonicalETag(normalizedETag); err != nil {
		return "", err
	}

	return normalizedETag, nil
}

func validateFileID(fileID string) error {
	if fileID == "" || fileID == "." || fileID == ".." || strings.Contains(fileID, "/") {
		return ErrInvalidFileID
	}
	if strings.TrimSpace(fileID) != fileID || strings.ContainsFunc(fileID, unicode.IsControl) {
		return ErrInvalidFileID
	}

	return nil
}

func validateCanonicalETag(sourceETag string) error {
	if len(sourceETag) != canonicalETagLength {
		return ErrInvalidETag
	}
	for _, character := range sourceETag {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return ErrInvalidETag
		}
	}

	return nil
}

func validateSourceUploadSize(sizeBytes int64) error {
	if sizeBytes <= 0 {
		return ErrInvalidSourceSize
	}
	if sizeBytes > MaxSourceObjectBytes {
		return ErrSourceObjectTooLarge
	}

	return nil
}

func validatePresignExpiry(expiry time.Duration) error {
	if expiry < minimumPresignExpiry || expiry > maximumPresignExpiry || expiry%time.Second != 0 {
		return ErrInvalidPresignExpiry
	}

	return nil
}

func contextError(ctx context.Context, operation string) error {
	if err := ctx.Err(); err != nil {
		return operationError(operation, err)
	}

	return nil
}

func operationError(operation string, err error) error {
	return fmt.Errorf("%s: %w", operation, err)
}
