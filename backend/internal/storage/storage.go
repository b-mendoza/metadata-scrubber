// Package storage provides private object storage operations for source and sanitized PDFs.
package storage

import (
	"context"
	"errors"
	"net/http"
	"time"
)

const (
	// PDFContentType is the media type required for PDF uploads.
	PDFContentType = "application/pdf"
	// MaxSourceObjectBytes is the maximum source PDF size read into backend memory.
	MaxSourceObjectBytes = 10_485_760

	canonicalETagLength  = 32
	minimumPresignExpiry = time.Second
	maximumPresignExpiry = 7 * 24 * time.Hour
)

// Operation labels appear inside wrapped error text, so both implementations
// must name one operation with one exact string.
const (
	operationPresignSourceUpload      = "presigning source upload"
	operationPresignSanitizedDownload = "presigning sanitized download"
	operationCheckSourceObject        = "checking source object"
	operationDownloadSource           = "downloading source object"
	operationCheckSanitizedObject     = "checking sanitized object"
	operationUploadSanitized          = "uploading sanitized object"
	operationDeleteFlow               = "deleting file flow"
)

var (
	// ErrSourceRevisionConflict means the source no longer has the reviewed ETag.
	ErrSourceRevisionConflict = errors.New("source revision changed")
	// ErrSourceObjectTooLarge means the source exceeds the backend memory boundary.
	ErrSourceObjectTooLarge = errors.New("source object exceeds 10 MiB limit")
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
	// ErrFlowObjectsRemain means deletion could not prove that the file flow is empty.
	ErrFlowObjectsRemain = errors.New("file flow objects remain")
	// ErrDependency means the private object store could not complete an operation.
	ErrDependency = errors.New("storage dependency failed")
)

// UploadStorage grants one direct source upload.
type UploadStorage interface {
	PresignSourceUpload(
		ctx context.Context,
		fileID string,
		sizeBytes int64,
		expiry time.Duration,
	) (PresignedRequest, error)
}

// FileWorkflowStorage reads sources and manages exact sanitized revisions.
//
// DownloadSource reports a missing source as ErrSourceNotFound.
// UploadSanitized may overwrite because the revision key identifies one exact
// source ETag. Every implementation returns state that the caller owns.
type FileWorkflowStorage interface {
	PresignSanitizedDownload(
		ctx context.Context,
		fileID string,
		sourceETag string,
		expiry time.Duration,
	) (PresignedRequest, error)
	SourceExists(ctx context.Context, fileID string) (bool, error)
	DownloadSource(ctx context.Context, fileID string, expectedETag string) (SourceObject, error)
	SanitizedExists(ctx context.Context, fileID string, sourceETag string) (bool, error)
	UploadSanitized(ctx context.Context, fileID string, sourceETag string, pdfBytes []byte) error
}

// LifecycleStorage removes all objects for one logical file flow.
type LifecycleStorage interface {
	DeleteFlow(ctx context.Context, fileID string) error
}

// Storage is the provider-neutral private PDF storage boundary.
type Storage interface {
	UploadStorage
	FileWorkflowStorage
	LifecycleStorage
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

// copyBytes is not a synonym for bytes.Clone: for an empty non-nil input it
// returns nil, and bytes.Clone returns an empty non-nil slice. Fake.SanitizedBytes
// returns this value to callers, so the difference is observable.
func copyBytes(input []byte) []byte {
	return append([]byte(nil), input...)
}
