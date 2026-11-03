package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestRandomAdmissionJitterReturnsAllThreeValues(t *testing.T) {
	observed := make(map[int]bool)
	for range 1000 {
		observed[randomAdmissionJitter()] = true
	}
	require.Equal(t, map[int]bool{0: true, 1: true, 2: true}, observed)
}

func TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	handler := newTestHandler(t)
	require.Equal(t, 2*time.Second, handler.admissionTimeout, "production admission wait must stay wired to two seconds")
	handler.admissionTimeout = 75 * time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKey(storageKeyPrefix + fileID)})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			holderResponses <- recorder
		}()
	}
	observer.waitForDownloads(t)

	t.Run("retry delay", func(t *testing.T) {
		jitterValues := []int{0, 2}
		jitterCalls := 0
		handler.admissionJitter = func() int {
			value := jitterValues[jitterCalls]
			jitterCalls++
			return value
		}
		for _, wantHeader := range []string{"2", "4"} {
			startedAt := time.Now()
			body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDThree})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			elapsed := time.Since(startedAt)

			require.Equal(t, http.StatusServiceUnavailable, recorder.Code, recorder.Body.String())
			require.Equal(t, wantHeader, recorder.Header().Get(header.RetryAfter))
			require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
			require.GreaterOrEqual(t, elapsed, handler.admissionTimeout)
			require.False(t, observer.downloadObserved(fileIDThree))
		}
		require.Equal(t, 2, jitterCalls)
	})

	t.Run("canceled wait", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDThree})
		require.NoError(t, err)
		request := httptest.NewRequestWithContext(ctx, http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusRequestTimeout, recorder.Code)
		require.Equal(t, cancellationMessage, errorMessage(t, recorder))
		require.Empty(t, recorder.Header().Get(header.RetryAfter))
		require.False(t, observer.downloadObserved(fileIDThree))
	})

	t.Run("exact cache hit", func(t *testing.T) {
		require.NoError(t, fake.SetSanitized(fileIDThree, canonicalETagThree, []byte("clean")))
		var cleanCalls atomic.Int64
		handler.clean = func(context.Context, []byte) ([]byte, error) {
			cleanCalls.Add(1)
			return nil, nil
		}
		body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDThree, ETag: canonicalETagThree})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		require.Zero(t, cleanCalls.Load())
		require.False(t, observer.downloadObserved(fileIDThree))
		var operations []storage.FakeOperation
		for _, call := range fake.Calls() {
			if call.FileID == fileIDThree {
				operations = append(operations, call.Operation)
			}
		}
		require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, operations)
	})

	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses)
}

func TestDryRunAndScrubReleasePermitsAfterPanic(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	handler := newTestHandler(t)
	handler.inspect = func(context.Context, []byte) ([]scrub.Field, error) { panic("inspect panic") }
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	dryRunHTTPRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dryRunBody))
	dryRunHTTPRequest.Header.Set(header.ContentType, mediatype.JSON)
	dryRunRecorder := httptest.NewRecorder()
	require.PanicsWithValue(t, "inspect panic", func() {
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dryRunRecorder, dryRunHTTPRequest)
	})

	handler.clean = func(context.Context, []byte) ([]byte, error) { panic("clean panic") }
	scrubBody, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	scrubHTTPRequest := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(scrubBody))
	scrubHTTPRequest.Header.Set(header.ContentType, mediatype.JSON)
	scrubRecorder := httptest.NewRecorder()
	require.PanicsWithValue(t, "clean panic", func() {
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(scrubRecorder, scrubHTTPRequest)
	})

	t.Run("follow-up requests", func(t *testing.T) {
		handler.inspect = func(context.Context, []byte) ([]scrub.Field, error) { return nil, nil }
		handler.clean = func(_ context.Context, input []byte) ([]byte, error) { return bytes.Clone(input), nil }
		followUpResponses := make(chan *httptest.ResponseRecorder, 2)
		followUpDryRunBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDTwo})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(followUpDryRunBody))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			followUpResponses <- recorder
		}()
		followUpScrubBody, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDThree, ETag: canonicalETagThree})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(followUpScrubBody))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
			followUpResponses <- recorder
		}()
		observer.waitForDownloads(t)
		close(observer.downloadRelease)
		requireResponsesSuccess(t, followUpResponses)
	})
}

func TestScrubReleasesPermitBeforeUploadingSanitizedBytes(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	observer.blockedUploadFileID = fileIDOne
	handler := newTestHandler(t)
	handler.clean = func(_ context.Context, input []byte) ([]byte, error) { return input, nil }

	firstResponse := make(chan *httptest.ResponseRecorder, 1)
	body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	go func() {
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
		firstResponse <- recorder
	}()
	select {
	case <-observer.uploadStarted:
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for sanitized upload")
	}

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDTwo, fileIDThree} {
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKey(storageKeyPrefix + fileID)})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			holderResponses <- recorder
		}()
	}
	observer.waitForDownloads(t)

	close(observer.uploadRelease)
	select {
	case recorder := <-firstResponse:
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for scrub response")
	}
	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses)
}

type blockingStorage struct {
	storage.Storage

	mu                sync.Mutex
	blockedDownloads  map[string]bool
	observedDownloads map[string]bool
	downloadStarted   chan string
	downloadRelease   chan struct{}

	blockedUploadFileID string
	uploadStarted       chan struct{}
	uploadRelease       chan struct{}
}

func newBlockingStorage(delegate storage.Storage, blockedFileIDs ...string) *blockingStorage {
	blocked := make(map[string]bool, len(blockedFileIDs))
	for _, fileID := range blockedFileIDs {
		blocked[fileID] = true
	}
	return &blockingStorage{
		Storage:           delegate,
		blockedDownloads:  blocked,
		observedDownloads: make(map[string]bool),
		downloadStarted:   make(chan string, 16),
		downloadRelease:   make(chan struct{}),
		uploadStarted:     make(chan struct{}, 4),
		uploadRelease:     make(chan struct{}),
	}
}

func (observer *blockingStorage) DownloadSource(ctx context.Context, fileID string, expectedETag string) (storage.SourceObject, error) {
	observer.mu.Lock()
	observer.observedDownloads[fileID] = true
	blocked := observer.blockedDownloads[fileID]
	observer.mu.Unlock()

	if blocked {
		observer.downloadStarted <- fileID
		select {
		case <-observer.downloadRelease:
		case <-ctx.Done():
			return storage.SourceObject{}, ctx.Err()
		}
	}

	return observer.Storage.DownloadSource(ctx, fileID, expectedETag)
}

func (observer *blockingStorage) UploadSanitized(ctx context.Context, fileID string, sourceETag string, pdfBytes []byte) error {
	if fileID == observer.blockedUploadFileID {
		observer.uploadStarted <- struct{}{}
		select {
		case <-observer.uploadRelease:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return observer.Storage.UploadSanitized(ctx, fileID, sourceETag, pdfBytes)
}

func (observer *blockingStorage) waitForDownloads(t *testing.T) {
	t.Helper()
	for range ProcessingPermitCount {
		select {
		case <-observer.downloadStarted:
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for guarded download")
		}
	}
}

func (observer *blockingStorage) downloadObserved(fileID string) bool {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.observedDownloads[fileID]
}

func requireResponsesSuccess(t *testing.T, responses <-chan *httptest.ResponseRecorder) {
	t.Helper()
	for range ProcessingPermitCount {
		select {
		case recorder := <-responses:
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for holder response")
		}
	}
}
