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

	responseBody := "created-response-secret"

	handler, readRecords := newLoggedHandler(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, err := w.Write([]byte(responseBody))
		require.NoError(t, err)
	})

	request := httptest.NewRequest(http.MethodPost, "/api/scrub?token=query-secret", bytes.NewBufferString("request-body-secret"))
	handler.ServeHTTP(httptest.NewRecorder(), request)

	records := readRecords()
	require.Len(t, records, 2)
	for _, record := range records {
		require.Equal(t, http.MethodPost, record["method"])
		require.Equal(t, "/api/scrub", record["path"])

		encoded, err := json.Marshal(record)
		require.NoError(t, err)
		require.NotContains(t, string(encoded), "query-secret")
		require.NotContains(t, string(encoded), "request-body-secret")
		require.NotContains(t, string(encoded), responseBody)
	}

	require.Equal(t, "request started", records[0]["msg"])

	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, float64(http.StatusCreated), records[1]["status"])
	require.Equal(t, float64(len(responseBody)), records[1]["bytes"])
	require.Contains(t, records[1], "duration_ms")
}

func TestRequestLoggerDefaultsStatusToOKWhenHandlerOnlyWritesBody(t *testing.T) {
	t.Parallel()

	handler, readRecords := newLoggedHandler(t, func(w http.ResponseWriter, _ *http.Request) {
		_, err := w.Write([]byte("ok"))
		require.NoError(t, err)
	})

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))

	records := readRecords()
	require.Len(t, records, 2)
	require.Equal(t, float64(http.StatusOK), records[1]["status"])
	require.Equal(t, float64(len("ok")), records[1]["bytes"])
}

func TestRequestLoggerLogsPanickedRequests(t *testing.T) {
	t.Parallel()

	handler, readRecords := newLoggedHandler(t, func(_ http.ResponseWriter, _ *http.Request) {
		panic("boom")
	})

	require.PanicsWithValue(t, "boom", func() {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))
	})

	records := readRecords()
	require.Len(t, records, 2)
	require.Equal(t, "request completed", records[1]["msg"])
	require.Equal(t, float64(http.StatusInternalServerError), records[1]["status"])
	require.Equal(t, true, records[1]["panicked"])
	require.Equal(t, "boom", records[1]["panic"])
}

func newLoggedHandler(t *testing.T, next http.HandlerFunc) (http.Handler, func() []map[string]any) {
	t.Helper()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(next)

	return handler, func() []map[string]any {
		t.Helper()

		return readJSONLogRecords(t, logs.Bytes())
	}
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
