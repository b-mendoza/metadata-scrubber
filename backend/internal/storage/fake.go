package storage

import (
	"context"
	"fmt"
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
	// FakeSourceExists identifies exact source-object lookups.
	FakeSourceExists FakeOperation = "check source object"
	// FakeDownloadSource identifies source-object reads.
	FakeDownloadSource FakeOperation = "download source"
	// FakeSanitizedExists identifies exact sanitized-object lookups.
	FakeSanitizedExists FakeOperation = "check sanitized object"
	// FakeUploadSanitized identifies sanitized PDF writes.
	FakeUploadSanitized FakeOperation = "upload sanitized object"
	// FakeDeleteFlow identifies full file-flow deletion.
	FakeDeleteFlow FakeOperation = "delete file flow"
)

var fakeOperations = map[FakeOperation]string{
	FakePresignSourceUpload:      operationPresignSourceUpload,
	FakePresignSanitizedDownload: operationPresignSanitizedDownload,
	FakeSourceExists:             operationCheckSourceObject,
	FakeDownloadSource:           operationDownloadSource,
	FakeSanitizedExists:          operationCheckSanitizedObject,
	FakeUploadSanitized:          operationUploadSanitized,
	FakeDeleteFlow:               operationDeleteFlow,
}

// FakeCall records the logical and derived inputs observed by a Fake operation.
type FakeCall struct {
	Operation    FakeOperation
	FileID       string
	SourceETag   string
	ObjectKey    string
	ObjectPrefix string
	SizeBytes    int64
	Expiry       time.Duration
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
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}

	fake.calls = append(fake.calls, call)
	if injectedErr := fake.failures[call.Operation]; injectedErr != nil {
		return fmt.Errorf("%s: %w", operation, injectedErr)
	}

	return nil
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
