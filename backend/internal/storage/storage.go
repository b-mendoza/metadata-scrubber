// Package storage provides private object storage operations for source and sanitized PDFs.
package storage

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode"
)

const (
	// PDFContentType is the media type required for PDF uploads.
	PDFContentType = "application/pdf"
	// MaxSourceObjectBytes is the maximum source PDF size read into backend memory.
	MaxSourceObjectBytes = 10_000_000

	minimumPresignExpiry = time.Second
	maximumPresignExpiry = 7 * 24 * time.Hour
)

var (
	// ErrSourceRevisionConflict means the source no longer has the reviewed ETag.
	ErrSourceRevisionConflict = errors.New("source revision changed")
	// ErrSourceObjectTooLarge means the source exceeds the backend memory boundary.
	ErrSourceObjectTooLarge = errors.New("source object exceeds 10 MB limit")
	// ErrSourceNotFound means no source object exists for the logical file ID.
	ErrSourceNotFound = errors.New("source object not found")
	// ErrInvalidSourceSize means an expected upload size is not a positive byte count.
	ErrInvalidSourceSize = errors.New("invalid source upload size")
	// ErrInvalidFileID means a logical file identifier cannot form one safe key segment.
	ErrInvalidFileID = errors.New("invalid file ID")
	// ErrInvalidETag means an ETag is not in the canonical unquoted strong form.
	ErrInvalidETag = errors.New("invalid ETag")
	// ErrInvalidPresignExpiry means a grant lifetime is outside the supported range.
	ErrInvalidPresignExpiry = errors.New("invalid presign expiry")
	// ErrDependency means the private object store could not complete an operation.
	ErrDependency = errors.New("storage dependency failed")
)

// Storage is the provider-neutral private PDF storage boundary.
//
// PresignSourceUpload binds the validated expected size into the grant, so the
// store rejects uploads whose byte count differs. DownloadSource reports a
// missing source as ErrSourceNotFound. UploadSanitized is create-only: the
// sanitized key is immutable, and writing an existing revision is an
// idempotent success that leaves the stored object unchanged.
type Storage interface {
	PresignSourceUpload(
		ctx context.Context,
		fileID string,
		sizeBytes int64,
		expiry time.Duration,
	) (PresignedRequest, error)
	PresignSanitizedDownload(
		ctx context.Context,
		fileID string,
		sourceETag string,
		expiry time.Duration,
	) (PresignedRequest, error)
	DownloadSource(ctx context.Context, fileID string, expectedETag string) (SourceObject, error)
	SanitizedExists(ctx context.Context, fileID string, sourceETag string) (bool, error)
	UploadSanitized(ctx context.Context, fileID string, sourceETag string, pdfBytes []byte) error
}

// PresignedRequest is a short-lived object operation grant and its required headers.
type PresignedRequest struct {
	URL             string
	RequiredHeaders http.Header
}

// SourceObject is a copied source PDF plus its user metadata and canonical ETag.
type SourceObject struct {
	PDFBytes []byte
	Metadata map[string]string
	ETag     string
}

// SourceObjectKey derives the private source-object key for a logical file ID.
func SourceObjectKey(fileID string) (string, error) {
	if err := validateFileID(fileID); err != nil {
		return "", err
	}

	return "source/" + fileID, nil
}

// SanitizedObjectKey derives an immutable key whose final segment reversibly encodes the source ETag.
func SanitizedObjectKey(fileID string, sourceETag string) (string, error) {
	if err := validateFileID(fileID); err != nil {
		return "", err
	}
	if err := validateCanonicalETag(sourceETag); err != nil {
		return "", err
	}

	encodedETag := base64.RawURLEncoding.EncodeToString([]byte(sourceETag))
	return "sanitized/" + fileID + "/" + encodedETag, nil
}

// NormalizeProviderETag converts one quoted strong provider ETag into canonical domain form.
func NormalizeProviderETag(providerETag string) (string, error) {
	if strings.TrimSpace(providerETag) != providerETag || strings.HasPrefix(providerETag, "W/") {
		return "", ErrInvalidETag
	}
	if len(providerETag) < 3 || providerETag[0] != '"' || providerETag[len(providerETag)-1] != '"' {
		return "", ErrInvalidETag
	}

	normalizedETag := providerETag[1 : len(providerETag)-1]
	if strings.HasPrefix(normalizedETag, "\"") && strings.HasSuffix(normalizedETag, "\"") {
		return "", ErrInvalidETag
	}
	if err := validateCanonicalETag(normalizedETag); err != nil {
		return "", err
	}

	return normalizedETag, nil
}

func validateFileID(fileID string) error {
	if fileID == "" || fileID == "." || fileID == ".." || strings.Contains(fileID, "/") {
		return ErrInvalidFileID
	}
	if strings.TrimSpace(fileID) != fileID || strings.IndexFunc(fileID, unicode.IsControl) >= 0 {
		return ErrInvalidFileID
	}

	return nil
}

func validateCanonicalETag(sourceETag string) error {
	if sourceETag == "" || strings.HasPrefix(sourceETag, "W/") {
		return ErrInvalidETag
	}
	if strings.TrimSpace(sourceETag) != sourceETag || strings.IndexFunc(sourceETag, unicode.IsControl) >= 0 {
		return ErrInvalidETag
	}
	if strings.HasPrefix(sourceETag, "\"") && strings.HasSuffix(sourceETag, "\"") {
		return ErrInvalidETag
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

func copyBytes(input []byte) []byte {
	return append([]byte(nil), input...)
}
