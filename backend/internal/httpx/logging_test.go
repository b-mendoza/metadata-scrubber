package httpx_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx"
)

func TestRequestLoggerLogsRequestLifecycle(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, err := w.Write([]byte("created"))
		require.NoError(t, err)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/scrub?token=secret", nil))

	records := readJSONLogRecords(t, logs.Bytes())
	require.Len(t, records, 2)

	require.Equal(t, "request started", records[0]["msg"])
	require.Equal(t, http.MethodPost, records[0]["method"])
	require.Equal(t, "/api/scrub", records[0]["path"])
	require.NotContains(t, records[0], "query")

	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, http.MethodPost, records[1]["method"])
	require.Equal(t, "/api/scrub", records[1]["path"])
	require.Equal(t, float64(http.StatusCreated), records[1]["status"])
	require.Equal(t, float64(len("created")), records[1]["bytes"])
	require.Contains(t, records[1], "duration_ms")
}

func TestRequestLoggerDefaultsStatusToOKWhenHandlerOnlyWritesBody(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, err := w.Write([]byte("ok"))
		require.NoError(t, err)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))

	records := readJSONLogRecords(t, logs.Bytes())
	require.Len(t, records, 2)
	require.Equal(t, float64(http.StatusOK), records[1]["status"])
	require.Equal(t, float64(len("ok")), records[1]["bytes"])
}

func TestRequestLoggerLogsPanickedRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))

	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic("boom")
	}))

	require.PanicsWithValue(t, "boom", func() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))
	})

	records := readJSONLogRecords(t, logs.Bytes())
	require.Len(t, records, 2)
	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, float64(http.StatusInternalServerError), records[1]["status"])
	require.Equal(t, true, records[1]["panicked"])
	require.Equal(t, "boom", records[1]["panic"])
}

func readJSONLogRecords(t *testing.T, data []byte) []map[string]any {
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
