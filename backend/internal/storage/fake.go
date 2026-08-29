package storage

import (
	"context"
	"maps"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

// FakeOperation identifies one independently injectable fake failure or recorded call.
type FakeOperation string

const (
	// FakePresignSourceUpload identifies source upload grant creation.
	FakePresignSourceUpload FakeOperation = "presign source upload"
	// FakePresignSanitizedDownload identifies sanitized download grant creation.
	FakePresignSanitizedDownload FakeOperation = "presign sanitized download"
	// FakeDownloadSource identifies source-object reads.
	FakeDownloadSource FakeOperation = "download source"
	// FakeSanitizedExists identifies exact sanitized-object lookups.
	FakeSanitizedExists FakeOperation = "check sanitized object"
	// FakeUploadSanitized identifies sanitized PDF writes.
	FakeUploadSanitized FakeOperation = "upload sanitized object"
)

var fakeOperations = map[FakeOperation]string{
	FakePresignSourceUpload:      operationPresignSourceUpload,
	FakePresignSanitizedDownload: operationPresignSanitizedDownload,
	FakeDownloadSource:           operationDownloadSource,
	FakeSanitizedExists:          operationCheckSanitizedObject,
	FakeUploadSanitized:          operationUploadSanitized,
}

// FakeCall records the logical and derived inputs observed by a Fake operation.
type FakeCall struct {
	Operation  FakeOperation
	FileID     string
	SourceETag string
	ObjectKey  string
	SizeBytes  int64
	Expiry     time.Duration
}

// Fake is a synchronized in-memory implementation of Storage for application tests.
type Fake struct {
	mu sync.Mutex

	sources          map[string]SourceObject
	sanitizedObjects map[string][]byte
	failures         map[FakeOperation]error
	calls            []FakeCall
	grantSequence    uint64
}

// NewFake returns an empty in-memory storage implementation.
func NewFake() *Fake {
	return &Fake{
		sources:          make(map[string]SourceObject),
		sanitizedObjects: make(map[string][]byte),
		failures:         make(map[FakeOperation]error),
	}
}

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

// SetFailure configures an ordinary failure for one operation. Passing nil clears it.
func (fake *Fake) SetFailure(operation FakeOperation, err error) {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	if err == nil {
		delete(fake.failures, operation)
		return
	}
	fake.failures[operation] = err
}

// Calls returns a snapshot of all successfully validated operation attempts.
func (fake *Fake) Calls() []FakeCall {
	fake.mu.Lock()
	defer fake.mu.Unlock()

	return append([]FakeCall(nil), fake.calls...)
}

// recordAttemptLocked appends the call and only then applies any injected
// failure: Calls reports every validated attempt, including attempts that fail
// through injection, while input-validation failures never reach this method
// and are therefore never recorded.
func (fake *Fake) recordAttemptLocked(ctx context.Context, call FakeCall) error {
	operation := fakeOperations[call.Operation]
	if err := contextError(ctx, operation); err != nil {
		return err
	}

	fake.calls = append(fake.calls, call)
	if injectedErr := fake.failures[call.Operation]; injectedErr != nil {
		return operationError(operation, injectedErr)
	}

	return nil
}

// PresignSourceUpload returns a private PDF PUT grant scoped to the source key.
func (fake *Fake) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (PresignedRequest, error) {
	if err := contextError(ctx, operationPresignSourceUpload); err != nil {
		return PresignedRequest{}, err
	}
	objectKey, err := validateSourceUploadInput(fileID, sizeBytes, expiry)
	if err != nil {
		return PresignedRequest{}, err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation: FakePresignSourceUpload,
		FileID:    fileID,
		ObjectKey: objectKey,
		SizeBytes: sizeBytes,
		Expiry:    expiry,
	}); err != nil {
		return PresignedRequest{}, err
	}

	fake.grantSequence++
	return PresignedRequest{
		URL: fakeGrantURL(objectKey, fake.grantSequence),
		RequiredHeaders: http.Header{
			"Content-Type":   []string{PDFContentType},
			"Content-Length": []string{strconv.FormatInt(sizeBytes, 10)},
		},
	}, nil
}

// PresignSanitizedDownload returns a private GET grant for one exact source revision.
func (fake *Fake) PresignSanitizedDownload(
	ctx context.Context,
	fileID string,
	sourceETag string,
	expiry time.Duration,
) (PresignedRequest, error) {
	if err := contextError(ctx, operationPresignSanitizedDownload); err != nil {
		return PresignedRequest{}, err
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

// DownloadSource reads the current source revision and optionally enforces an expected ETag.
func (fake *Fake) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (SourceObject, error) {
	if err := contextError(ctx, operationDownloadSource); err != nil {
		return SourceObject{}, err
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
		return SourceObject{}, operationError(operationDownloadSource, ErrSourceNotFound)
	}
	if expectedETag != "" && source.ETag != expectedETag {
		return SourceObject{}, operationError(operationDownloadSource, ErrSourceRevisionConflict)
	}
	if len(source.PDFBytes) > MaxSourceObjectBytes {
		return SourceObject{}, operationError(operationDownloadSource, ErrSourceObjectTooLarge)
	}

	return copySourceObject(source), nil
}

// SanitizedExists reports whether the exact immutable sanitized revision exists.
func (fake *Fake) SanitizedExists(
	ctx context.Context,
	fileID string,
	sourceETag string,
) (bool, error) {
	if err := contextError(ctx, operationCheckSanitizedObject); err != nil {
		return false, err
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
	if err := contextError(ctx, operationUploadSanitized); err != nil {
		return err
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

func fakeGrantURL(objectKey string, sequence uint64) string {
	grantURL := url.URL{
		Scheme:   "https",
		Host:     "storage.invalid",
		Path:     "/" + objectKey,
		RawQuery: "grant=" + strconv.FormatUint(sequence, 10),
	}
	return grantURL.String()
}
