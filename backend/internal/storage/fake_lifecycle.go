package storage

import (
	"context"
	"fmt"
	"strings"
)

// DeleteFlow removes the source and every sanitized revision for one file ID.
func (fake *Fake) DeleteFlow(ctx context.Context, fileID string) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s: %w", operationDeleteFlow, err)
	}
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return err
	}
	objectPrefix, err := SanitizedObjectPrefix(fileID)
	if err != nil {
		return err
	}

	fake.mu.Lock()
	defer fake.mu.Unlock()
	if err := fake.recordAttemptLocked(ctx, FakeCall{
		Operation:    FakeDeleteFlow,
		FileID:       fileID,
		ObjectKey:    objectKey,
		ObjectPrefix: objectPrefix,
	}); err != nil {
		return err
	}

	delete(fake.sources, fileID)
	for sanitizedKey := range fake.sanitizedObjects {
		if strings.HasPrefix(sanitizedKey, objectPrefix) {
			delete(fake.sanitizedObjects, sanitizedKey)
		}
	}
	return nil
}
