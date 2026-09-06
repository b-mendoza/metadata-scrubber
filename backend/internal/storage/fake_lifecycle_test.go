package storage_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/storage"
)

func TestFakeDeleteFlowRemovesOnlyTheSelectedFileAndIsIdempotent(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	for _, fileID := range []string{"file-1", "file-2"} {
		require.NoError(t, fake.SetSource(fileID, storage.SourceObject{
			PDFBytes: []byte("source"),
			ETag:     canonicalETagOne,
		}))
		require.NoError(t, fake.SetSanitized(fileID, canonicalETagOne, []byte("sanitized one")))
		require.NoError(t, fake.SetSanitized(fileID, canonicalETagTwo, []byte("sanitized two")))
	}

	require.NoError(t, fake.DeleteFlow(context.Background(), "file-1"))
	require.Equal(t, []storage.FakeCall{{
		Operation:    storage.FakeDeleteFlow,
		FileID:       "file-1",
		ObjectKey:    "source/file-1",
		ObjectPrefix: "sanitized/file-1/",
	}}, fake.Calls())

	exists, err := fake.SourceExists(context.Background(), "file-1")
	require.NoError(t, err)
	require.False(t, exists)
	for _, sourceETag := range []string{canonicalETagOne, canonicalETagTwo} {
		_, exists, err = fake.SanitizedBytes("file-1", sourceETag)
		require.NoError(t, err)
		require.False(t, exists)
	}

	exists, err = fake.SourceExists(context.Background(), "file-2")
	require.NoError(t, err)
	require.True(t, exists)
	for _, sourceETag := range []string{canonicalETagOne, canonicalETagTwo} {
		_, exists, err = fake.SanitizedBytes("file-2", sourceETag)
		require.NoError(t, err)
		require.True(t, exists)
	}

	require.NoError(t, fake.DeleteFlow(context.Background(), "file-1"))
}

func TestFakeSupportsConcurrentIdempotentFlowDeletion(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: []byte("source"),
		ETag:     canonicalETagOne,
	}))
	require.NoError(t, fake.SetSanitized("file-1", canonicalETagOne, []byte("sanitized")))

	operationErrors := make(chan error, 20)
	var waitGroup sync.WaitGroup
	for range 20 {
		waitGroup.Go(func() {
			operationErrors <- fake.DeleteFlow(context.Background(), "file-1")
		})
	}
	waitGroup.Wait()
	close(operationErrors)
	for operationErr := range operationErrors {
		require.NoError(t, operationErr)
	}

	exists, err := fake.SourceExists(context.Background(), "file-1")
	require.NoError(t, err)
	require.False(t, exists)
	_, exists, err = fake.SanitizedBytes("file-1", canonicalETagOne)
	require.NoError(t, err)
	require.False(t, exists)
}
