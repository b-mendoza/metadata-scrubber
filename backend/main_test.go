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
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/handler"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	startupR2AccessKeyID     = "startup-access-key-id-sentinel"
	startupR2SecretAccessKey = "startup-secret-access-key-sentinel"
	startupR2Bucket          = "startup-bucket-sentinel"
)

func TestRunRejectsIncompleteOrInvalidR2ConfigurationBeforeStartingServer(t *testing.T) {
	t.Setenv("PORT", "8080")
	t.Setenv("R2_ACCOUNT_ID", " \t\n")
	t.Setenv("R2_ACCESS_KEY_ID", startupR2AccessKeyID)
	t.Setenv("R2_SECRET_ACCESS_KEY", startupR2SecretAccessKey)
	t.Setenv("R2_BUCKET", startupR2Bucket)

	err := run(context.Background(), slog.New(slog.DiscardHandler))

	require.ErrorContains(t, err, "invalid configuration")
}

func TestNewServerAppliesSettingsAndLogsRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	server := newTestServer(slog.New(slog.NewJSONHandler(&logs, nil)))

	require.Equal(t, ":0", server.Addr)
	require.Equal(t, readHeaderTimeout, server.ReadHeaderTimeout)

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	recorder := serveServer(server, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	var response struct {
		Status string `json:"status"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "reachable", response.Status)

	type serverLogRecord struct {
		Message string `json:"msg"`
		Path    string `json:"path"`
		Status  int    `json:"status"`
	}

	var completionRecord serverLogRecord
	scanner := bufio.NewScanner(bytes.NewReader(logs.Bytes()))
	for scanner.Scan() {
		var record serverLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		if record.Message == "request completed" {
			completionRecord = record
			break
		}
	}
	require.NoError(t, scanner.Err())
	require.Equal(t, "request completed", completionRecord.Message)
	require.Equal(t, "/api/health", completionRecord.Path)
	require.Equal(t, http.StatusOK, completionRecord.Status)
}

func TestNewServerHandlesCORSPreflight(t *testing.T) {
	t.Parallel()

	server := newTestServer(slog.New(slog.DiscardHandler))
	request := httptest.NewRequest(http.MethodOptions, "/api/files/scrub", http.NoBody)
	recorder := serveServer(server, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Contains(t, recorder.Header().Get(header.AccessControlAllowMethods), http.MethodOptions)
}

func TestNewServerRegistersWorkflowRoutes(t *testing.T) {
	t.Parallel()

	server := newTestServer(slog.New(slog.DiscardHandler))
	testCases := []struct {
		method     string
		path       string
		wantStatus int
	}{
		{method: http.MethodPost, path: "/api/uploads", wantStatus: http.StatusUnsupportedMediaType},
		{method: http.MethodPost, path: "/api/files/dry-run", wantStatus: http.StatusUnsupportedMediaType},
		{method: http.MethodPost, path: "/api/files/scrub", wantStatus: http.StatusUnsupportedMediaType},
		{method: http.MethodPost, path: "/api/files/download-grant", wantStatus: http.StatusUnsupportedMediaType},
		{method: http.MethodPost, path: "/api/files/delete", wantStatus: http.StatusUnsupportedMediaType},
		{method: http.MethodGet, path: "/api/files/config", wantStatus: http.StatusOK},
		{method: http.MethodPost, path: "/api/files/config", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodGet, path: "/api/uploads", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodGet, path: "/api/files/dry-run", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodGet, path: "/api/files/scrub", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodGet, path: "/api/files/download-grant", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodGet, path: "/api/files/delete", wantStatus: http.StatusMethodNotAllowed},
		{method: http.MethodPost, path: "/api/scrub", wantStatus: http.StatusNotFound},
	}
	for _, testCase := range testCases {
		request := httptest.NewRequest(testCase.method, testCase.path, http.NoBody)
		recorder := serveServer(server, request)

		require.Equal(t, testCase.wantStatus, recorder.Code, "%s %s", testCase.method, testCase.path)
	}
}

func TestCanonicalCapacityAndSizeLimitsStayPinned(t *testing.T) {
	t.Parallel()

	require.Equal(t, 2, handler.ProcessingPermitCount)
	require.Equal(t, 10_485_760, storage.MaxSourceObjectBytes)
	require.Equal(t, 10_485_760, scrub.MaxInputBytes)
}

func TestNewServerSharesOneCapacityTwoGateAcrossDryRunAndScrubMisses(t *testing.T) {
	scrub.DisableConfigDir()

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
	observer := &blockingServerStorage{
		Storage: fake,
		started: make(chan string, 3),
		release: make(chan struct{}),
	}
	server := newServer(config.Config{Port: 0}, observer, slog.New(slog.DiscardHandler))

	firstDryRunBody, err := json.Marshal(dryRunRequest{StorageKey: "uploads/" + firstFileID})
	require.NoError(t, err)
	secondDryRunBody, err := json.Marshal(dryRunRequest{StorageKey: "uploads/" + secondFileID})
	require.NoError(t, err)
	scrubBody, err := json.Marshal(scrubRequest{
		StorageKey: "uploads/" + thirdFileID,
		ETag:       "0123456789abcdef0123456789abcdef",
	})
	require.NoError(t, err)

	dryRunResponses := make(chan *httptest.ResponseRecorder, 2)
	go collectDryRunServerResponse(dryRunResponses, server, firstDryRunBody)
	go collectDryRunServerResponse(dryRunResponses, server, secondDryRunBody)
	for range 2 {
		<-observer.started
	}

	scrubContext, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	scrubResponses := make(chan *httptest.ResponseRecorder, 1)
	collectScrubServerResponse(scrubContext, scrubResponses, server, scrubBody)
	scrubResponse := <-scrubResponses
	require.Equal(t, http.StatusRequestTimeout, scrubResponse.Code, scrubResponse.Body.String())
	var sanitizedLookups []string
	for _, call := range fake.Calls() {
		if call.Operation == storage.FakeSanitizedExists {
			sanitizedLookups = append(sanitizedLookups, call.FileID)
		}
	}
	require.Contains(t, sanitizedLookups, thirdFileID)
	select {
	case fileID := <-observer.started:
		require.FailNow(t, "scrub miss entered a separate gate", "unexpected download for %s", fileID)
	default:
	}

	close(observer.release)
	for range 2 {
		recorder := <-dryRunResponses
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	}
}

func collectDryRunServerResponse(responses chan *httptest.ResponseRecorder, server *http.Server, requestBody []byte) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(requestBody))
	request.Header.Set(header.ContentType, mediatype.JSON)
	responses <- serveServer(server, request)
}

func collectScrubServerResponse(ctx context.Context, responses chan *httptest.ResponseRecorder, server *http.Server, scrubBody []byte) {
	request := httptest.NewRequestWithContext(ctx, http.MethodPost, "/api/files/scrub", bytes.NewReader(scrubBody))
	request.Header.Set(header.ContentType, mediatype.JSON)
	responses <- serveServer(server, request)
}

func newTestServer(logger *slog.Logger) *http.Server {
	return newServer(config.Config{Port: 0}, storage.NewFake(), logger)
}

func serveServer(server *http.Server, request *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	server.Handler.ServeHTTP(recorder, request)
	return recorder
}

type blockingServerStorage struct {
	storage.Storage

	started chan string
	release chan struct{}
}

func (observer *blockingServerStorage) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (storage.SourceObject, error) {
	observer.started <- fileID
	select {
	case <-observer.release:
		return observer.Storage.DownloadSource(ctx, fileID, expectedETag)
	case <-ctx.Done():
		return storage.SourceObject{}, ctx.Err()
	}
}
