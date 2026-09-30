package storage

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"time"
)

// SetSource replaces the current source revision for fileID using copied state.
func (fake *Fake) SetSource(fileID string, source SourceObject) error {
	if err := validateFileID(fileID); err != nil {
		return err
	}
	if err := validateCanonicalETag(source.ETag); err != nil {
		return err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()

	fake.sources[fileID] = copySourceObject(source)
	return nil
}

// SetSanitized seeds copied sanitized bytes for one exact source revision.
func (fake *Fake) SetSanitized(fileID string, sourceETag string, pdfBytes []byte) error {
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()

	fake.sanitizedObjects[objectKey] = copyBytes(pdfBytes)
	return nil
}

// SanitizedBytes returns a copy of the bytes stored for one exact source revision.
func (fake *Fake) SanitizedBytes(fileID string, sourceETag string) (pdfBytes []byte, exists bool, err error) {
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return nil, false, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()

	pdfBytes, exists = fake.sanitizedObjects[objectKey]
	return copyBytes(pdfBytes), exists, nil
}

// PresignSanitizedDownload returns a private GET grant for one exact source revision.
func (fake *Fake) PresignSanitizedDownload(
	ctx context.Context,
	fileID string,
	sourceETag string,
	expiry time.Duration,
) (PresignedRequest, error) {
	if err := ctx.Err(); err != nil {
		return PresignedRequest{}, fmt.Errorf("%s: %w", operationPresignSanitizedDownload, err)
	}
	objectKey, err := validateSanitizedDownloadInput(fileID, sourceETag, expiry)
	if err != nil {
		return PresignedRequest{}, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation:  FakePresignSanitizedDownload,
		FileID:     fileID,
		SourceETag: sourceETag,
		ObjectKey:  objectKey,
		Expiry:     expiry,
	}); err != nil {
		return PresignedRequest{}, err
	}

	fake.grantSequence++
	return PresignedRequest{
		URL:             fakeGrantURL(objectKey, fake.grantSequence),
		RequiredHeaders: make(http.Header),
	}, nil
}

// SourceExists reports whether the exact source object exists.
func (fake *Fake) SourceExists(ctx context.Context, fileID string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("%s: %w", operationCheckSourceObject, err)
	}
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return false, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation: FakeSourceExists,
		FileID:    fileID,
		ObjectKey: objectKey,
	}); err != nil {
		return false, err
	}

	_, exists := fake.sources[fileID]
	return exists, nil
}

// DownloadSource reads the current source revision and optionally enforces an expected ETag.
func (fake *Fake) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (SourceObject, error) {
	if err := ctx.Err(); err != nil {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, err)
	}
	objectKey, err := validateSourceReadInput(fileID, expectedETag)
	if err != nil {
		return SourceObject{}, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation:  FakeDownloadSource,
		FileID:     fileID,
		SourceETag: expectedETag,
		ObjectKey:  objectKey,
	}); err != nil {
		return SourceObject{}, err
	}

	source, exists := fake.sources[fileID]
	if !exists {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceNotFound)
	}
	if expectedETag != "" && source.ETag != expectedETag {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceRevisionConflict)
	}
	if len(source.PDFBytes) > MaxSourceObjectBytes {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceObjectTooLarge)
	}

	return copySourceObject(source), nil
}

// SanitizedExists reports whether the exact immutable sanitized revision exists.
func (fake *Fake) SanitizedExists(
	ctx context.Context,
	fileID string,
	sourceETag string,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("%s: %w", operationCheckSanitizedObject, err)
	}
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return false, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation:  FakeSanitizedExists,
		FileID:     fileID,
		SourceETag: sourceETag,
		ObjectKey:  objectKey,
	}); err != nil {
		return false, err
	}

	_, exists := fake.sanitizedObjects[objectKey]
	return exists, nil
}

// UploadSanitized copies PDF bytes into the exact immutable revision key.
func (fake *Fake) UploadSanitized(
	ctx context.Context,
	fileID string,
	sourceETag string,
	pdfBytes []byte,
) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s: %w", operationUploadSanitized, err)
	}
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation:  FakeUploadSanitized,
		FileID:     fileID,
		SourceETag: sourceETag,
		ObjectKey:  objectKey,
	}); err != nil {
		return err
	}

	fake.sanitizedObjects[objectKey] = copyBytes(pdfBytes)
	return nil
}

func copySourceObject(source SourceObject) SourceObject {
	return SourceObject{
		PDFBytes: copyBytes(source.PDFBytes),
		Metadata: maps.Clone(source.Metadata),
		ETag:     source.ETag,
	}
}
