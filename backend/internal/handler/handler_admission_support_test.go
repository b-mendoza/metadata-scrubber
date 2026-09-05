package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

type blockingStorage struct {
	storage.Storage

	mu                 sync.Mutex
	blockedDownloads   map[string]bool
	observedDownloads  map[string]bool
	downloadErrors     map[string]error
	downloadPanics     map[string]string
	downloadStarted    chan string
	downloadRelease    chan struct{}
	downloadReleaseOne sync.Once
	active             int
	peak               int

	blockedUploads   map[string]bool
	uploadStarted    chan string
	uploadRelease    chan struct{}
	uploadReleaseOne sync.Once
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
		downloadErrors:    make(map[string]error),
		downloadPanics:    make(map[string]string),
		downloadStarted:   make(chan string, 16),
		downloadRelease:   make(chan struct{}),
		blockedUploads:    make(map[string]bool),
		uploadStarted:     make(chan string, 4),
		uploadRelease:     make(chan struct{}),
	}
}

func (observer *blockingStorage) DownloadSource(ctx context.Context, fileID string, expectedETag string) (storage.SourceObject, error) {
	observer.mu.Lock()
	observer.observedDownloads[fileID] = true
	blocked := observer.blockedDownloads[fileID]
	if blocked {
		observer.active++
		if observer.active > observer.peak {
			observer.peak = observer.active
		}
	}
	observer.mu.Unlock()

	if blocked {
		observer.downloadStarted <- fileID
		select {
		case <-observer.downloadRelease:
		case <-ctx.Done():
			observer.mu.Lock()
			observer.active--
			observer.mu.Unlock()
			return storage.SourceObject{}, ctx.Err()
		}
		observer.mu.Lock()
		observer.active--
		observer.mu.Unlock()
	}

	observer.mu.Lock()
	downloadErr := observer.downloadErrors[fileID]
	panicValue, shouldPanic := observer.downloadPanics[fileID]
	observer.mu.Unlock()
	if shouldPanic {
		panic(panicValue)
	}
	if downloadErr != nil {
		return storage.SourceObject{}, downloadErr
	}
	return observer.Storage.DownloadSource(ctx, fileID, expectedETag)
}

func (observer *blockingStorage) UploadSanitized(ctx context.Context, fileID string, sourceETag string, pdfBytes []byte) error {
	observer.mu.Lock()
	blocked := observer.blockedUploads[fileID]
	observer.mu.Unlock()
	if blocked {
		observer.uploadStarted <- fileID
		select {
		case <-observer.uploadRelease:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return observer.Storage.UploadSanitized(ctx, fileID, sourceETag, pdfBytes)
}

func (observer *blockingStorage) failDownload(fileID string, err error) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.downloadErrors[fileID] = err
}

func (observer *blockingStorage) panicDownload(fileID string, value string) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.downloadPanics[fileID] = value
}

func (observer *blockingStorage) blockUpload(fileID string) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.blockedUploads[fileID] = true
}

func (observer *blockingStorage) waitForDownloads(t *testing.T, count int) {
	t.Helper()
	for range count {
		select {
		case <-observer.downloadStarted:
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for guarded download")
		}
	}
}

func (observer *blockingStorage) waitForUpload(t *testing.T, fileID string) {
	t.Helper()
	select {
	case observed := <-observer.uploadStarted:
		require.Equal(t, fileID, observed)
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for sanitized upload")
	}
}

func (observer *blockingStorage) releaseDownloads() {
	observer.downloadReleaseOne.Do(func() { close(observer.downloadRelease) })
}

func (observer *blockingStorage) releaseUploads() {
	observer.uploadReleaseOne.Do(func() { close(observer.uploadRelease) })
}

func (observer *blockingStorage) downloadObserved(fileID string) bool {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.observedDownloads[fileID]
}

func (observer *blockingStorage) peakDownloads() int {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.peak
}

type guardedRequest struct {
	method handlerMethod
	fileID string
}

// startGuardedRequests serves every request in its own goroutine. It waits until
// the shared admission gate starts both allowed downloads.
func startGuardedRequests(
	t *testing.T,
	handler *Handler,
	observer *blockingStorage,
	requests []guardedRequest,
) <-chan *httptest.ResponseRecorder {
	t.Helper()
	responses := make(chan *httptest.ResponseRecorder, len(requests))
	for _, request := range requests {
		var body []byte
		var err error
		if request.method == scrubMethod {
			body, err = json.Marshal(scrubRequest{
				StorageKey: formatStorageKey(request.fileID),
				ETag:       canonicalETagsByFileID[request.fileID],
			})
		} else {
			body, err = json.Marshal(dryRunRequest{StorageKey: formatStorageKey(request.fileID)})
		}
		require.NoError(t, err)
		go func() {
			responses <- serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: observer, method: request.method, contentType: mediatype.JSON, body: string(body)})
		}()
	}
	observer.waitForDownloads(t, ProcessingPermitCount)
	return responses
}

func requireResponsesSuccess(
	t *testing.T,
	responses <-chan *httptest.ResponseRecorder,
	count int,
	timeoutMessage string,
) {
	t.Helper()
	for range count {
		select {
		case recorder := <-responses:
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		case <-time.After(time.Second):
			require.FailNow(t, timeoutMessage)
		}
	}
}
