package storage_test

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

var _ storage.Storage = (*storage.Fake)(nil)

func TestNormalizeProviderETagAcceptsOneQuotedStrongETag(t *testing.T) {
	t.Parallel()

	normalized, err := storage.NormalizeProviderETag(`"revision-1"`)

	require.NoError(t, err)
	require.Equal(t, "revision-1", normalized)
}

func TestNormalizeProviderETagRejectsMalformedValues(t *testing.T) {
	t.Parallel()

	for _, providerETag := range []string{
		"",
		"revision-1",
		`W/"revision-1"`,
		`""`,
		`""revision-1""`,
		` "revision-1"`,
		`"revision-1" `,
		"\"revision\n1\"",
	} {
		t.Run(providerETag, func(t *testing.T) {
			_, err := storage.NormalizeProviderETag(providerETag)

			require.ErrorIs(t, err, storage.ErrInvalidETag)
		})
	}
}

func TestObjectKeysBindSanitizedStateToExactRevision(t *testing.T) {
	t.Parallel()

	sourceKey, err := storage.SourceObjectKey("file-1")
	require.NoError(t, err)
	require.Equal(t, "source/file-1", sourceKey)

	for _, testCase := range []struct {
		name       string
		fileID     string
		sourceETag string
		want       string
	}{
		{
			name:       "canonical revision",
			fileID:     "file-1",
			sourceETag: "revision-1",
			want:       "sanitized/file-1/cmV2aXNpb24tMQ",
		},
		{
			name:       "opaque path-unsafe revision",
			fileID:     "file-1",
			sourceETag: `a/b+=%"..`,
			want:       "sanitized/file-1/YS9iKz0lIi4u",
		},
		{
			name:       "case-sensitive revision",
			fileID:     "file-1",
			sourceETag: "Case",
			want:       "sanitized/file-1/Q2FzZQ",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			objectKey, keyErr := storage.SanitizedObjectKey(testCase.fileID, testCase.sourceETag)

			require.NoError(t, keyErr)
			require.Equal(t, testCase.want, objectKey)
			require.NotContains(t, strings.TrimPrefix(objectKey, "sanitized/"+testCase.fileID+"/"), "/")
		})
	}

	revisionOneKey, err := storage.SanitizedObjectKey("file-1", "revision-1")
	require.NoError(t, err)
	revisionTwoKey, err := storage.SanitizedObjectKey("file-1", "revision-2")
	require.NoError(t, err)
	otherFileKey, err := storage.SanitizedObjectKey("file-2", "revision-1")
	require.NoError(t, err)
	lowerCaseKey, err := storage.SanitizedObjectKey("file-1", "case")
	require.NoError(t, err)

	require.NotEqual(t, revisionOneKey, revisionTwoKey)
	require.NotEqual(t, revisionOneKey, otherFileKey)
	require.NotEqual(t, "sanitized/file-1/Q2FzZQ", lowerCaseKey)
	require.NotEqual(t, "sanitized/file-1", revisionOneKey)
}

func TestObjectKeysRejectInvalidLogicalIdentifiers(t *testing.T) {
	t.Parallel()

	for _, fileID := range []string{"", ".", "..", "folder/file", " file", "file\n"} {
		t.Run("file ID "+fileID, func(t *testing.T) {
			_, sourceErr := storage.SourceObjectKey(fileID)
			_, sanitizedErr := storage.SanitizedObjectKey(fileID, "revision-1")

			require.ErrorIs(t, sourceErr, storage.ErrInvalidFileID)
			require.ErrorIs(t, sanitizedErr, storage.ErrInvalidFileID)
		})
	}

	for _, sourceETag := range []string{"", `"revision-1"`, `W/"revision-1"`, " revision-1", "revision\n1"} {
		t.Run("ETag "+sourceETag, func(t *testing.T) {
			_, err := storage.SanitizedObjectKey("file-1", sourceETag)

			require.ErrorIs(t, err, storage.ErrInvalidETag)
		})
	}
}

func TestFakeReadsCopiedSourceStateAndEnforcesReviewedRevision(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	seedBytes := []byte("source revision one")
	seedMetadata := map[string]string{"author": "synthetic-author"}
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: seedBytes,
		Metadata: seedMetadata,
		ETag:     "revision-1",
	}))
	seedBytes[0] = 'X'
	seedMetadata["author"] = "mutated"

	source, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, []byte("source revision one"), source.PDFBytes)
	require.Equal(t, map[string]string{"author": "synthetic-author"}, source.Metadata)
	require.Equal(t, "revision-1", source.ETag)

	source.PDFBytes[0] = 'Y'
	source.Metadata["author"] = "returned mutation"
	matchedSource, err := fake.DownloadSource(context.Background(), "file-1", source.ETag)
	require.NoError(t, err)
	require.Equal(t, []byte("source revision one"), matchedSource.PDFBytes)
	require.Equal(t, map[string]string{"author": "synthetic-author"}, matchedSource.Metadata)

	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: []byte("source revision two"),
		Metadata: map[string]string{"author": "second-author"},
		ETag:     "revision-2",
	}))

	_, err = fake.DownloadSource(context.Background(), "file-1", "revision-1")
	require.ErrorIs(t, err, storage.ErrSourceRevisionConflict)
	require.NotErrorIs(t, err, storage.ErrDependency)

	currentSource, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, "revision-2", currentSource.ETag)
}

func TestFakeEnforcesTheSourceObjectMemoryBoundary(t *testing.T) {
	fake := storage.NewFake()
	exactLimit := make([]byte, storage.MaxSourceObjectBytes)
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: exactLimit,
		Metadata: map[string]string{"classification": "metadata-value-sentinel"},
		ETag:     "revision-1",
	}))

	source, err := fake.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Len(t, source.PDFBytes, storage.MaxSourceObjectBytes)

	require.NoError(t, fake.SetSource("file-identifier-sentinel", storage.SourceObject{
		PDFBytes: make([]byte, storage.MaxSourceObjectBytes+1),
		Metadata: map[string]string{"classification": "metadata-value-sentinel"},
		ETag:     "revision-sensitive-sentinel",
	}))

	_, err = fake.DownloadSource(context.Background(), "file-identifier-sentinel", "")
	require.ErrorIs(t, err, storage.ErrSourceObjectTooLarge)
	require.NotErrorIs(t, err, storage.ErrDependency)
	require.NotErrorIs(t, err, storage.ErrSourceRevisionConflict)
	for _, sensitiveValue := range []string{
		"file-identifier-sentinel",
		"metadata-value-sentinel",
		"revision-sensitive-sentinel",
	} {
		require.NotContains(t, err.Error(), sensitiveValue)
	}
}

func TestFakeUsesExactSanitizedRevisionForExistenceGrantsAndUploads(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	require.NoError(t, fake.SetSanitized("file-1", "revision-1", []byte("sanitized one")))

	exists, err := fake.SanitizedExists(context.Background(), "file-1", "revision-1")
	require.NoError(t, err)
	require.True(t, exists)

	exists, err = fake.SanitizedExists(context.Background(), "file-1", "revision-2")
	require.NoError(t, err)
	require.False(t, exists)

	firstGrant, err := fake.PresignSanitizedDownload(context.Background(), "file-1", "revision-1", time.Minute)
	require.NoError(t, err)
	secondGrant, err := fake.PresignSanitizedDownload(context.Background(), "file-1", "revision-1", time.Minute)
	require.NoError(t, err)
	require.NotEqual(t, firstGrant.URL, secondGrant.URL)
	require.Empty(t, firstGrant.RequiredHeaders)

	parsedGrant, err := url.Parse(firstGrant.URL)
	require.NoError(t, err)
	revisionOneKey, err := storage.SanitizedObjectKey("file-1", "revision-1")
	require.NoError(t, err)
	require.Equal(t, "/"+revisionOneKey, parsedGrant.Path)

	oversizedPDF := make([]byte, scrub.MaxInputBytes+1)
	require.NoError(t, fake.UploadSanitized(context.Background(), "file-1", "revision-2", oversizedPDF))
	storedBytes, exists, err := fake.SanitizedBytes("file-1", "revision-2")
	require.NoError(t, err)
	require.True(t, exists)
	require.Len(t, storedBytes, scrub.MaxInputBytes+1)
	storedBytes[0] = 1
	again, exists, err := fake.SanitizedBytes("file-1", "revision-2")
	require.NoError(t, err)
	require.True(t, exists)
	require.Zero(t, again[0])

	revisionOneBytes, exists, err := fake.SanitizedBytes("file-1", "revision-1")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("sanitized one"), revisionOneBytes)

	for _, call := range fake.Calls() {
		if call.Operation == storage.FakeUploadSanitized {
			require.NotEqual(t, "revision-1", call.SourceETag, "reuse sequence must not rewrite revision one")
		}
		if call.Operation == storage.FakePresignSanitizedDownload {
			require.Equal(t, revisionOneKey, call.ObjectKey)
		}
	}
}

func TestFakePresignedUploadPinsPDFContentTypeAndRecordsExpiry(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	grant, err := fake.PresignSourceUpload(context.Background(), "file-1", 2*time.Minute)

	require.NoError(t, err)
	require.Equal(t, storage.PDFContentType, grant.RequiredHeaders.Get("Content-Type"))
	grant.RequiredHeaders.Set("Content-Type", "text/plain")

	secondGrant, err := fake.PresignSourceUpload(context.Background(), "file-1", 3*time.Minute)
	require.NoError(t, err)
	require.Equal(t, storage.PDFContentType, secondGrant.RequiredHeaders.Get("Content-Type"))

	calls := fake.Calls()
	require.Equal(t, 2*time.Minute, calls[0].Expiry)
	require.Equal(t, 3*time.Minute, calls[1].Expiry)
	require.Equal(t, "source/file-1", calls[0].ObjectKey)
}

func TestFakeRejectsInvalidExpiryBeforeRecordingCalls(t *testing.T) {
	t.Parallel()

	for _, expiry := range []time.Duration{0, -time.Second, time.Millisecond, 7*24*time.Hour + time.Second} {
		fake := storage.NewFake()

		_, err := fake.PresignSourceUpload(context.Background(), "file-1", expiry)

		require.ErrorIs(t, err, storage.ErrInvalidPresignExpiry)
		require.Empty(t, fake.Calls())
	}
}

func TestFakePropagatesContextAndInjectedFailuresWithoutMutation(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := fake.PresignSourceUpload(ctx, "file-1", time.Minute)
	require.ErrorIs(t, err, context.Canceled)
	err = fake.UploadSanitized(ctx, "file-1", "revision-1", []byte("not stored"))
	require.ErrorIs(t, err, context.Canceled)
	_, exists, stateErr := fake.SanitizedBytes("file-1", "revision-1")
	require.NoError(t, stateErr)
	require.False(t, exists)

	injectedErr := errors.New("synthetic dependency failure")
	fake.SetFailure(storage.FakeUploadSanitized, injectedErr)
	err = fake.UploadSanitized(context.Background(), "file-1", "revision-1", []byte("not stored"))
	require.ErrorIs(t, err, injectedErr)
	_, exists, stateErr = fake.SanitizedBytes("file-1", "revision-1")
	require.NoError(t, stateErr)
	require.False(t, exists)
}

func TestFakeInjectsIndependentOrdinaryFailuresForEveryOperation(t *testing.T) {
	t.Parallel()

	injectedErr := errors.New("synthetic dependency failure")
	for _, operation := range []storage.FakeOperation{
		storage.FakePresignSourceUpload,
		storage.FakePresignSanitizedDownload,
		storage.FakeDownloadSource,
		storage.FakeSanitizedExists,
		storage.FakeUploadSanitized,
	} {
		t.Run(string(operation), func(t *testing.T) {
			fake := storage.NewFake()
			fake.SetFailure(operation, injectedErr)

			var err error
			switch operation {
			case storage.FakePresignSourceUpload:
				_, err = fake.PresignSourceUpload(context.Background(), "file-1", time.Minute)
			case storage.FakePresignSanitizedDownload:
				_, err = fake.PresignSanitizedDownload(
					context.Background(),
					"file-1",
					"revision-1",
					time.Minute,
				)
			case storage.FakeDownloadSource:
				_, err = fake.DownloadSource(context.Background(), "file-1", "")
			case storage.FakeSanitizedExists:
				_, err = fake.SanitizedExists(context.Background(), "file-1", "revision-1")
			case storage.FakeUploadSanitized:
				err = fake.UploadSanitized(
					context.Background(),
					"file-1",
					"revision-1",
					[]byte("not stored"),
				)
			}

			require.ErrorIs(t, err, injectedErr)
			require.NotErrorIs(t, err, storage.ErrSourceRevisionConflict)
			_, exists, stateErr := fake.SanitizedBytes("file-1", "revision-1")
			require.NoError(t, stateErr)
			require.False(t, exists)
		})
	}
}

func TestFakeSupportsConcurrentExactRevisionOperations(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	require.NoError(t, fake.SetSource("file-1", storage.SourceObject{
		PDFBytes: []byte("source"),
		Metadata: map[string]string{"key": "value"},
		ETag:     "revision-1",
	}))

	operationErrors := make(chan error, 60)
	var waitGroup sync.WaitGroup
	for index := range 20 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()

			_, readErr := fake.DownloadSource(context.Background(), "file-1", "revision-1")
			operationErrors <- readErr
			operationErrors <- fake.UploadSanitized(
				context.Background(),
				"file-1",
				"revision-1",
				[]byte(strings.Repeat("x", index+1)),
			)
			_, lookupErr := fake.SanitizedExists(context.Background(), "file-1", "revision-1")
			operationErrors <- lookupErr
		}()
	}
	waitGroup.Wait()
	close(operationErrors)
	for operationErr := range operationErrors {
		require.NoError(t, operationErr)
	}

	_, exists, err := fake.SanitizedBytes("file-1", "revision-1")
	require.NoError(t, err)
	require.True(t, exists)
}

func TestFakeReturnsCopiedHeaderMaps(t *testing.T) {
	t.Parallel()

	fake := storage.NewFake()
	first, err := fake.PresignSourceUpload(context.Background(), "file-1", time.Minute)
	require.NoError(t, err)
	first.RequiredHeaders[http.CanonicalHeaderKey("Content-Type")][0] = "text/plain"

	second, err := fake.PresignSourceUpload(context.Background(), "file-1", time.Minute)
	require.NoError(t, err)
	require.Equal(t, storage.PDFContentType, second.RequiredHeaders.Get("Content-Type"))
}
