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
		w.Header().Set("X-Scrubbed", "true")
		w.WriteHeader(http.StatusCreated)
		_, err := w.Write([]byte(responseBody))
		require.NoError(t, err)
	})

	request := httptest.NewRequest(http.MethodPost, "/api/scrub?token=query-secret", bytes.NewBufferString("request-body-secret"))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, responseBody, recorder.Body.String())
	require.Equal(t, "true", recorder.Header().Get("X-Scrubbed"))

	records := readRecords()
	require.Len(t, records, 2)
	for _, record := range records {
		require.Equal(t, http.MethodPost, record.Method)
		require.Equal(t, "/api/scrub", record.Path)

		require.NotContains(t, record.rawJSON, "query-secret")
		require.NotContains(t, record.rawJSON, "request-body-secret")
		require.NotContains(t, record.rawJSON, responseBody)
	}

	started := records[0]
	completed := records[1]

	require.Equal(t, "request started", started.Msg)

	require.Equal(t, "request completed", completed.Msg)
	requireRequiredIntLogField(t, "status", http.StatusCreated, completed.Status)
	requireRequiredIntLogField(t, "bytes", len(responseBody), completed.Bytes)
	require.NotNil(t, completed.DurationMilliseconds)
	require.GreaterOrEqual(t, *completed.DurationMilliseconds, int64(0))
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
	completed := records[1]
	requireRequiredIntLogField(t, "status", http.StatusOK, completed.Status)
	requireRequiredIntLogField(t, "bytes", len("ok"), completed.Bytes)
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
	completed := records[1]
	require.Equal(t, "request completed", completed.Msg)
	require.Equal(t, "ERROR", completed.Level)
	requireRequiredIntLogField(t, "status", http.StatusInternalServerError, completed.Status)
	require.NotNil(t, completed.Panicked, "missing panicked log field")
	require.True(t, *completed.Panicked)
	require.NotNil(t, completed.Panic, "missing panic log field")
	require.Equal(t, "boom", *completed.Panic)
}

type logRecord struct {
	rawJSON string

	Msg                  string  `json:"msg"`
	Level                string  `json:"level"`
	Method               string  `json:"method"`
	Path                 string  `json:"path"`
	Status               *int    `json:"status"`
	Bytes                *int    `json:"bytes"`
	DurationMilliseconds *int64  `json:"duration_ms"`
	Panicked             *bool   `json:"panicked"`
	Panic                *string `json:"panic"`
}

func newLoggedHandler(t *testing.T, next http.HandlerFunc) (http.Handler, func() []logRecord) {
	t.Helper()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(next)

	return handler, func() []logRecord {
		t.Helper()

		return readJSONLogRecords(t, logs.Bytes())
	}
}

func requireRequiredIntLogField(t *testing.T, name string, expected int, actual *int) {
	t.Helper()

	require.NotNil(t, actual, "missing %s log field", name)
	require.Equal(t, expected, *actual)
}

func readJSONLogRecords(t *testing.T, data []byte) []logRecord {
	t.Helper()

	var records []logRecord
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		rawJSON := scanner.Text()
		record := logRecord{rawJSON: rawJSON}
		require.NoError(t, json.Unmarshal([]byte(rawJSON), &record))
		records = append(records, record)
	}
	require.NoError(t, scanner.Err())

	return records
}
