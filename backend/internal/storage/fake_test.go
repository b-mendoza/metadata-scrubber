package storage

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFakeRecordAttemptRejectsUnknownOperation(t *testing.T) {
	t.Parallel()

	fake := NewFake()
	fake.mu.Lock()
	defer fake.mu.Unlock()

	err := fake.recordAttemptLocked(context.Background(), FakeCall{Operation: FakeOperation("unknown")})

	require.EqualError(t, err, `unsupported fake operation "unknown"`)
	require.Empty(t, fake.calls)
}
