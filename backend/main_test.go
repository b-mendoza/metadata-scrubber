package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())

	require.Equal(t, ":0", server.Addr)
	require.Equal(t, readHeaderTimeout, server.ReadHeaderTimeout)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.JSONEq(t, `{"status":"reachable"}`, recorder.Body.String())
}

func TestNewServerLogsRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	server := newTestServer(slog.New(slog.NewJSONHandler(&logs, nil)))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)

	server.Handler.ServeHTTP(recorder, request)

	records := readServerJSONLogRecords(t, logs.Bytes())
	require.Len(t, records, 2)
	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, http.MethodGet, records[1]["method"])
	require.Equal(t, "/api/health", records[1]["path"])
	require.Equal(t, float64(http.StatusOK), records[1]["status"])
}

func TestNewServerHandlesCORSPreflight(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/scrub", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Equal(t, "GET, POST, OPTIONS", recorder.Header().Get(header.AccessControlAllowMethods))
	require.Equal(t, header.ContentType, recorder.Header().Get(header.AccessControlAllowHeaders))
}

func TestNewServerRoutesScrubUploads(t *testing.T) {
	t.Parallel()

	server := newTestServer(discardLogger())
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/scrub", nil)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	require.JSONEq(t, `{"error":"missing or invalid \"file\" form field"}`, recorder.Body.String())
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestServer(logger *slog.Logger) *http.Server {
	return newServer(":0", bindings.Bindings{Env: config.Config{Port: 8080}}, logger)
}

func readServerJSONLogRecords(t *testing.T, data []byte) []map[string]any {
	t.Helper()

	var records []map[string]any
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record map[string]any
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		records = append(records, record)
	}
	require.NoError(t, scanner.Err())

	return records
}
