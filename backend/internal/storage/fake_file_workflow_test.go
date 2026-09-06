package storage_test

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/storage"
)

func TestFakeReadsCopiedSourceStateAndEnforcesReviewedRevision(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	seedBytes := []byte("source revision one")
	seedMetadata := map[string]string{"author": "synthetic-author"}
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: seedBytes,
		Metadata: seedMetadata,
		ETag:     canonicalETagOne,
	}))
	seedBytes[0] = 'X'
	seedMetadata["author"] = "mutated"

	source, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, []byte("source revision one"), source.PDFBytes)
	require.Equal(t, map[string]string{"author": "synthetic-author"}, source.Metadata)
	require.Equal(t, canonicalETagOne, source.ETag)

	source.PDFBytes[0] = 'Y'
	source.Metadata["author"] = "returned mutation"
	matchedSource, err := fake.DownloadSource(context.Background(), "file-1", source.ETag)
	require.NoError(t, err)
	require.Equal(t, []byte("source revision one"), matchedSource.PDFBytes)
	require.Equal(t, map[string]string{"author": "synthetic-author"}, matchedSource.Metadata)

	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: []byte("source revision two"),
		Metadata: map[string]string{"author": "second-author"},
		ETag:     canonicalETagTwo,
	}))

	_, err = fake.DownloadSource(context.Background(), "file-1", canonicalETagOne)
	require.ErrorIs(t, err, storage.ErrSourceRevisionConflict)
	require.NotErrorIs(t, err, storage.ErrDependency)

	currentSource, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, canonicalETagTwo, currentSource.ETag)
}

func TestFakeEnforcesTheSourceObjectMemoryBoundary(t *testing.T) {
	fake := storage.NewFake()
	exactLimit := make([]byte, storage.MaxSourceObjectBytes)
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: exactLimit,
		Metadata: map[string]string{"classification": "metadata-value-sentinel"},
		ETag:     canonicalETagOne,
	}))

	source, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Len(t, source.PDFBytes, storage.MaxSourceObjectBytes)

	require.NoError(t, fake.SetSource("file-identifier-sentinel", storage.SourceObject{
		PDFBytes: make([]byte, storage.MaxSourceObjectBytes+1),
		Metadata: map[string]string{"classification": "metadata-value-sentinel"},
		ETag:     "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}))

	_, err = fake.DownloadSource(context.Background(), "file-identifier-sentinel", "")
	require.ErrorIs(t, err, storage.ErrSourceObjectTooLarge)
	require.NotErrorIs(t, err, storage.ErrDependency)
	require.NotErrorIs(t, err, storage.ErrSourceRevisionConflict)
	for _, sensitiveValue := range []string{
		"file-identifier-sentinel",
		"metadata-value-sentinel",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	} {
		require.NotContains(t, err.Error(), sensitiveValue)
	}
}

func TestFakeReportsAMissingSourceAsSourceNotFound(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()

	_, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.ErrorIs(t, err, storage.ErrSourceNotFound)
	require.NotErrorIs(t, err, storage.ErrDependency)

	_, err = fake.DownloadSource(context.Background(), "file-1", canonicalETagOne)
	require.ErrorIs(t, err, storage.ErrSourceNotFound)
	require.NotErrorIs(t, err, storage.ErrSourceRevisionConflict)
}

func TestFakeKeepsSanitizedRevisionsIsolatedAndCopiesBytes(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	require.NoError(t, fake.SetSanitized("file-1", canonicalETagOne, []byte("one")))

	revisionTwoBytes := []byte("two")
	require.NoError(t, fake.UploadSanitized(context.Background(), "file-1", canonicalETagTwo, revisionTwoBytes))
	revisionTwoBytes[0] = 'x'

	storedRevisionTwo, exists, err := fake.SanitizedBytes("file-1", canonicalETagTwo)
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("two"), storedRevisionTwo)
	storedRevisionTwo[0] = 'x'

	storedRevisionTwo, exists, err = fake.SanitizedBytes("file-1", canonicalETagTwo)
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("two"), storedRevisionTwo)

	storedRevisionOne, exists, err := fake.SanitizedBytes("file-1", canonicalETagOne)
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("one"), storedRevisionOne)
}

func TestFakeSupportsConcurrentExactRevisionOperations(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: []byte("source"),
		Metadata: map[string]string{"key": "value"},
		ETag:     canonicalETagOne,
	}))

	operationErrors := make(chan error, 60)
	var waitGroup sync.WaitGroup
	for index := range 20 {
		waitGroup.Go(func() {
			_, readErr := fake.DownloadSource(context.Background(), "file-1", canonicalETagOne)
			operationErrors <- readErr
			operationErrors <- fake.UploadSanitized(
				context.Background(),
				"file-1",
				canonicalETagOne,
				[]byte(strings.Repeat("x", index+1)),
			)
			_, lookupErr := fake.SanitizedExists(context.Background(), "file-1", canonicalETagOne)
			operationErrors <- lookupErr
		})
	}
	waitGroup.Wait()
	close(operationErrors)
	for operationErr := range operationErrors {
		require.NoError(t, operationErr)
	}

	_, exists, err := fake.SanitizedBytes("file-1", canonicalETagOne)
	require.NoError(t, err)
	require.True(t, exists)
}
