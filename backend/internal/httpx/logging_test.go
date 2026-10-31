package httpx_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx"
)

func TestRequestLoggerLogsRequestLifecycle(t *testing.T) {
	t.Parallel()

	responseBody := "created-response-secret"

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Scrubbed", "true")
		w.WriteHeader(http.StatusCreated)
		_, err := w.Write([]byte(responseBody))
		assert.NoError(t, err)
	}))

	request := httptest.NewRequest(http.MethodPost, "/api/scrub?token=query-secret", bytes.NewBufferString("request-body-secret"))
	request.Header.Set("User-Agent", "metadata-scrubber-test")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, responseBody, recorder.Body.String())
	require.Equal(t, "true", recorder.Header().Get("X-Scrubbed"))

	records := readJSONLogRecords(t, logs.Bytes())
	require.Equal(t, []logRecord{
		{Msg: "request started", Level: "INFO", Method: http.MethodPost, Path: "/api/scrub", RemoteAddr: request.RemoteAddr, UserAgent: "metadata-scrubber-test"},
		{Msg: "request completed", Level: "INFO", Method: http.MethodPost, Path: "/api/scrub", Status: new(http.StatusCreated), Bytes: new(len(responseBody)), DurationRecorded: true},
	}, records)
	require.NotContains(t, logs.String(), "query-secret")
	require.NotContains(t, logs.String(), "request-body-secret")
	require.NotContains(t, logs.String(), responseBody)
}

func TestRequestLoggerDefaultsStatusToOKWhenHandlerOnlyWritesBody(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, err := w.Write([]byte("ok"))
		assert.NoError(t, err)
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	handler.ServeHTTP(httptest.NewRecorder(), request)

	records := readJSONLogRecords(t, logs.Bytes())
	require.Equal(t, []logRecord{
		{Msg: "request started", Level: "INFO", Method: http.MethodGet, Path: "/api/health", RemoteAddr: request.RemoteAddr},
		{Msg: "request completed", Level: "INFO", Method: http.MethodGet, Path: "/api/health", Status: new(http.StatusOK), Bytes: new(len("ok")), DurationRecorded: true},
	}, records)
}

func TestRequestLoggerLogsPanickedRequests(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		panic("panic-value-sensitive-marker")
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	require.PanicsWithValue(t, "panic-value-sensitive-marker", func() {
		handler.ServeHTTP(httptest.NewRecorder(), request)
	})

	records := readJSONLogRecords(t, logs.Bytes())
	require.Equal(t, []logRecord{
		{Msg: "request started", Level: "INFO", Method: http.MethodGet, Path: "/api/health", RemoteAddr: request.RemoteAddr},
		{Msg: "request completed", Level: "ERROR", Method: http.MethodGet, Path: "/api/health", Status: new(http.StatusInternalServerError), Bytes: new(0), DurationRecorded: true, Panicked: new(true)},
	}, records)
	require.NotContains(t, logs.String(), "panic-value-sensitive-marker")
}

func TestRequestLoggerLogsPanickedRequestsAfterWritingHeader(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := httpx.RequestLogger(logger)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		panic("panic-value-sensitive-marker")
	}))

	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)
	require.PanicsWithValue(t, "panic-value-sensitive-marker", func() {
		handler.ServeHTTP(httptest.NewRecorder(), request)
	})

	records := readJSONLogRecords(t, logs.Bytes())
	require.Equal(t, []logRecord{
		{Msg: "request started", Level: "INFO", Method: http.MethodGet, Path: "/api/health", RemoteAddr: request.RemoteAddr},
		{Msg: "request completed", Level: "ERROR", Method: http.MethodGet, Path: "/api/health", Status: new(http.StatusCreated), Bytes: new(0), DurationRecorded: true, Panicked: new(true)},
	}, records)
	require.NotContains(t, logs.String(), "panic-value-sensitive-marker")
}

type logRecord struct {
	Msg              string  `json:"msg"`
	Level            string  `json:"level"`
	Method           string  `json:"method"`
	Path             string  `json:"path"`
	RemoteAddr       string  `json:"remote_addr"`
	UserAgent        string  `json:"user_agent"`
	Status           *int    `json:"status"`
	Bytes            *int    `json:"bytes"`
	DurationRecorded bool    `json:"-"`
	Panicked         *bool   `json:"panicked"`
	Panic            *string `json:"panic"`
}

func readJSONLogRecords(t *testing.T, data []byte) []logRecord {
	t.Helper()

	var records []logRecord
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record struct {
			logRecord
			DurationMilliseconds *int64 `json:"duration_ms"`
		}
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		record.DurationRecorded = record.DurationMilliseconds != nil && *record.DurationMilliseconds >= 0
		records = append(records, record.logRecord)
	}
	require.NoError(t, scanner.Err())

	return records
}
