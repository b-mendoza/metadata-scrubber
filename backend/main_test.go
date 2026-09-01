package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/handler"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	startupR2AccountID       = "startup-account-id-sentinel"
	startupR2AccessKeyID     = "startup-access-key-id-sentinel"
	startupR2SecretAccessKey = "startup-secret-access-key-sentinel"
	startupR2Bucket          = "startup-bucket-sentinel"
)

func TestRunRejectsIncompleteOrInvalidR2ConfigurationBeforeStartingServer(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		configureFail func(t *testing.T)
		affectedField string
	}{
		{
			name: "missing required value",
			configureFail: func(t *testing.T) {
				t.Helper()
				t.Setenv("R2_SECRET_ACCESS_KEY", "")
				require.NoError(t, os.Unsetenv("R2_SECRET_ACCESS_KEY"))
			},
			affectedField: "R2SecretAccessKey",
		},
		{
			name: "blank required value",
			configureFail: func(t *testing.T) {
				t.Helper()
				t.Setenv("R2_ACCOUNT_ID", " \t\n")
			},
			affectedField: "R2AccountID",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Setenv("PORT", "8080")
			t.Setenv("R2_ACCOUNT_ID", startupR2AccountID)
			t.Setenv("R2_ACCESS_KEY_ID", startupR2AccessKeyID)
			t.Setenv("R2_SECRET_ACCESS_KEY", startupR2SecretAccessKey)
			t.Setenv("R2_BUCKET", startupR2Bucket)
			testCase.configureFail(t)

			err := run(context.Background())

			require.Error(t, err)
			require.ErrorContains(t, err, "invalid configuration")
			require.ErrorContains(t, err, testCase.affectedField)
			require.NotContains(t, err.Error(), startupR2AccountID)
			require.NotContains(t, err.Error(), startupR2AccessKeyID)
			require.NotContains(t, err.Error(), startupR2SecretAccessKey)
			require.NotContains(t, err.Error(), startupR2Bucket)
		})
	}
}

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())

	require.Equal(t, ":0", server.Addr)
	require.Equal(t, readHeaderTimeout, server.ReadHeaderTimeout)

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	recorder := serveServer(server, request)

	require.Equal(t, http.StatusOK, recorder.Code)
}

func TestNewServerLogsRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	server := newTestServer(slog.New(slog.NewJSONHandler(&logs, nil)))

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	serveServer(server, request)

	record := readServerCompletionLogRecord(t, logs.Bytes())
	require.Equal(t, "/api/health", record.Path)
	require.Equal(t, http.StatusOK, record.Status)
}

func TestNewServerHandlesCORSPreflight(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	request := httptest.NewRequest(http.MethodOptions, "/api/files/scrub", http.NoBody)
	recorder := serveServer(server, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Contains(t, recorder.Header().Get(header.AccessControlAllowMethods), http.MethodOptions)
}

func TestNewServerRoutesJSONWorkflowAndRemovesLegacyScrub(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	testCases := []struct {
		path       string
		wantStatus int
	}{
		{path: "/api/uploads", wantStatus: http.StatusUnsupportedMediaType},
		{path: "/api/files/dry-run", wantStatus: http.StatusUnsupportedMediaType},
		{path: "/api/files/scrub", wantStatus: http.StatusUnsupportedMediaType},
		{path: "/api/files/download-grant", wantStatus: http.StatusUnsupportedMediaType},
		{path: "/api/scrub", wantStatus: http.StatusNotFound},
	}
	for _, testCase := range testCases {
		request := httptest.NewRequest(http.MethodPost, testCase.path, http.NoBody)
		recorder := serveServer(server, request)

		require.Equal(t, testCase.wantStatus, recorder.Code, testCase.path)
	}
}

func TestNewServerRoutesBackendOwnedWorkflowConfig(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	request := httptest.NewRequest(http.MethodGet, "/api/files/config", http.NoBody)
	recorder := serveServer(server, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response struct {
		MaxFileSizeBytes int `json:"maxFileSizeBytes"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, 10_485_760, response.MaxFileSizeBytes)
}

func TestCanonicalCapacityAndSizeLimitsStayPinned(t *testing.T) {
	t.Parallel()

	require.Equal(t, 2, handler.ProcessingPermitCount)
	require.Equal(t, 10_485_760, storage.MaxSourceObjectBytes)
	require.Equal(t, 10_485_760, scrub.MaxInputBytes)
}

func TestNewServerRejectsWrongMethodsForJSONWorkflow(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodPost, path: "/api/files/config"},
		{method: http.MethodGet, path: "/api/uploads"},
		{method: http.MethodGet, path: "/api/files/dry-run"},
		{method: http.MethodGet, path: "/api/files/scrub"},
		{method: http.MethodGet, path: "/api/files/download-grant"},
	}
	for _, testCase := range tests {
		request := httptest.NewRequest(testCase.method, testCase.path, http.NoBody)
		recorder := serveServer(server, request)

		require.Equal(t, http.StatusMethodNotAllowed, recorder.Code, testCase.path)
	}
}

func TestNewServerSharesOneCapacityTwoGateAcrossDryRunAndScrubMisses(t *testing.T) {
	type dryRunRequest struct {
		StorageKey string `json:"storageKey"`
	}
	type scrubRequest struct {
		StorageKey string `json:"storageKey"`
		ETag       string `json:"etag"`
	}

	const (
		firstFileID  = "00000000-0000-4000-8000-000000000001"
		secondFileID = "00000000-0000-4000-8000-000000000002"
		thirdFileID  = "00000000-0000-4000-8000-000000000003"
	)

	pdfBytes, err := os.ReadFile("internal/handler/testdata/with-property.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	for _, fileID := range []string{firstFileID, secondFileID, thirdFileID} {
		require.NoError(t, fake.SetSource(fileID, storage.SourceObject{
			PDFBytes: pdfBytes,
			ETag:     "0123456789abcdef0123456789abcdef",
		}))
	}
	observer := &serverAdmissionStorage{
		Storage:             fake,
		downloadStarted:     make(chan string, 3),
		downloadRelease:     make(chan struct{}, 3),
		observedScrubFileID: thirdFileID,
		observedScrubLookup: make(chan struct{}),
	}
	server := newServer(config.Config{Port: 0}, observer, discardLogger())

	firstDryRunBody, err := json.Marshal(dryRunRequest{StorageKey: "uploads/" + firstFileID})
	require.NoError(t, err)
	secondDryRunBody, err := json.Marshal(dryRunRequest{StorageKey: "uploads/" + secondFileID})
	require.NoError(t, err)
	scrubBody, err := json.Marshal(scrubRequest{
		StorageKey: "uploads/" + thirdFileID,
		ETag:       "0123456789abcdef0123456789abcdef",
	})
	require.NoError(t, err)

	responses := make(chan *httptest.ResponseRecorder, 3)
	for _, body := range [][]byte{firstDryRunBody, secondDryRunBody} {
		go func(requestBody []byte) {
			responses <- serveServerJSON(server, "/api/files/dry-run", string(requestBody))
		}(body)
	}
	observer.waitForTwoDownloads(t)

	go func() {
		responses <- serveServerJSON(server, "/api/files/scrub", string(scrubBody))
	}()
	observer.waitForObservedScrubLookup(t)

	select {
	case fileID := <-observer.downloadStarted:
		require.FailNow(t, "scrub miss entered a separate gate", "unexpected download for %s", fileID)
	case <-time.After(100 * time.Millisecond):
	}
	require.Equal(t, 2, observer.peakDownloads())

	observer.releaseOneDownload()
	observer.requireDownloadStarts(t, thirdFileID)
	require.Equal(t, 2, observer.peakDownloads())

	observer.releaseOneDownload()
	observer.releaseOneDownload()
	for range 3 {
		select {
		case recorder := <-responses:
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		case <-time.After(3 * time.Second):
			require.FailNow(t, "timed out waiting for constructed route response")
		}
	}
	require.Equal(t, 2, observer.peakDownloads())
}

func discardLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

func newTestServer(logger *slog.Logger) *http.Server {
	return newServer(config.Config{Port: 0}, storage.NewFake(), logger)
}

func serveServer(server *http.Server, request *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	server.Handler.ServeHTTP(recorder, request)
	return recorder
}

func serveServerJSON(server *http.Server, path string, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set(header.ContentType, "application/json")
	return serveServer(server, request)
}

type serverAdmissionStorage struct {
	storage.Storage

	mu                    sync.Mutex
	active                int
	peak                  int
	downloadStarted       chan string
	downloadRelease       chan struct{}
	observedScrubFileID   string
	observedScrubLookup   chan struct{}
	scrubLookupSignalOnce sync.Once
}

func (observer *serverAdmissionStorage) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (storage.SourceObject, error) {
	observer.mu.Lock()
	observer.active++
	if observer.active > observer.peak {
		observer.peak = observer.active
	}
	observer.mu.Unlock()

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
	return observer.Storage.DownloadSource(ctx, fileID, expectedETag)
}

func (observer *serverAdmissionStorage) SanitizedExists(
	ctx context.Context,
	fileID string,
	sourceETag string,
) (bool, error) {
	exists, err := observer.Storage.SanitizedExists(ctx, fileID, sourceETag)
	if fileID == observer.observedScrubFileID {
		observer.scrubLookupSignalOnce.Do(func() { close(observer.observedScrubLookup) })
	}
	return exists, err
}

func (observer *serverAdmissionStorage) requireDownloadStarts(t *testing.T, expectedFileID string) {
	t.Helper()
	select {
	case fileID := <-observer.downloadStarted:
		require.Equal(t, expectedFileID, fileID)
	case <-time.After(time.Second):
		require.FailNow(t, "scrub miss did not enter shared gate after one permit was released")
	}
}

func (observer *serverAdmissionStorage) waitForTwoDownloads(t *testing.T) {
	t.Helper()
	for range 2 {
		select {
		case <-observer.downloadStarted:
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for constructed handler download")
		}
	}
}

func (observer *serverAdmissionStorage) waitForObservedScrubLookup(t *testing.T) {
	t.Helper()
	select {
	case <-observer.observedScrubLookup:
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for scrub miss lookup")
	}
}

func (observer *serverAdmissionStorage) releaseOneDownload() {
	observer.downloadRelease <- struct{}{}
}

func (observer *serverAdmissionStorage) peakDownloads() int {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.peak
}

type serverLogRecord struct {
	Message string `json:"msg"`
	Path    string `json:"path"`
	Status  int    `json:"status"`
}

func readServerCompletionLogRecord(t *testing.T, data []byte) serverLogRecord {
	t.Helper()

	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record serverLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		if record.Message == "request completed" {
			return record
		}
	}
	require.NoError(t, scanner.Err())
	require.FailNow(t, "request completion log record not found")

	panic("unreachable")
}
