package storage

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

// PresignSourceUpload returns a private PDF PUT grant scoped to the source key.
func (fake *Fake) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (PresignedRequest, error) {
	if err := ctx.Err(); err != nil {
		return PresignedRequest{}, fmt.Errorf("%s: %w", operationPresignSourceUpload, err)
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
