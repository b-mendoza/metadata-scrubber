package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestWorkflowConfigReturnsBackendOwnedFileSize(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/files/config", http.NoBody)

	newTestHandler(t).WorkflowConfig(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	var response workflowConfigResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, storage.MaxSourceObjectBytes, response.MaxFileSizeBytes)
}

func TestReachabilityLogsResponseWriteFailure(t *testing.T) {
	responseWriteErr := errors.New("response write failure sentinel")
	writer := &failingResponseWriter{ResponseRecorder: httptest.NewRecorder(), err: responseWriteErr}
	var logs bytes.Buffer
	handler := newTestHandler(t)
	handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	request := httptest.NewRequest(http.MethodGet, "/api/health", http.NoBody)

	handler.Reachability(writer, request)

	var record struct {
		Level   string `json:"level"`
		Message string `json:"msg"`
		Error   string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(logs.Bytes(), &record))
	require.Equal(t, "ERROR", record.Level)
	require.Equal(t, "could not write JSON response", record.Message)
	require.Equal(t, responseWriteErr.Error(), record.Error)
}

type failingResponseWriter struct {
	*httptest.ResponseRecorder
	err error
}

func (writer *failingResponseWriter) Write([]byte) (int, error) {
	return 0, writer.err
}

func TestHandlersWithoutBindingsReturnSafeServerFailure(t *testing.T) {
	handler := newTestHandler(t)
	body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", strings.NewReader(string(body)))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()

	handler.DryRun(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "service unavailable", errorMessage(t, recorder))
}
