package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
)

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newServer(":0", bindings.Bindings{Env: config.Config{Port: 8080}}, discardLogger())

	require.Equal(t, ":0", server.Addr)
	require.NotNil(t, server.Handler)

	recorder := &statusRecorder{}
	request, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	require.NoError(t, err)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.status)
}

func TestNewServerLogsRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	server := newServer(
		":0",
		bindings.Bindings{Env: config.Config{Port: 8080}},
		slog.New(slog.NewJSONHandler(&logs, nil)),
	)

	recorder := &statusRecorder{}
	request, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	require.NoError(t, err)

	server.Handler.ServeHTTP(recorder, request)

	records := readServerJSONLogRecords(t, logs.Bytes())
	require.Len(t, records, 2)
	require.Equal(t, "request started", records[0]["msg"])
	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, float64(http.StatusOK), records[1]["status"])
}

type statusRecorder struct {
	header http.Header
	status int
}

func (r *statusRecorder) Header() http.Header {
	if r.header == nil {
		r.header = make(http.Header)
	}
	return r.header
}

func (r *statusRecorder) Write(bytes []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return len(bytes), nil
}

func (r *statusRecorder) WriteHeader(statusCode int) {
	r.status = statusCode
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
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
