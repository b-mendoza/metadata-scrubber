package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestPipelineLogsExcludeSeededSensitiveValues(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
		PDFBytes: []byte("%PDF-source-bytes-secret"),
		Metadata: map[string]string{"private-object-marker": "private-metadata-marker"},
		ETag:     "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	}))
	objectStorage := &sensitiveGrantStorage{Storage: fake}
	var logs bytes.Buffer
	handler := newTestHandler(t)
	handler.inspect = func([]byte) ([]scrub.Field, error) {
		return []scrub.Field{{Name: "title", Preview: "metadata-preview-secret", Action: scrub.ActionRemove}}, nil
	}
	handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))

	uploadBody, err := json.Marshal(uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(uploadBody))
	uploadRequest.Header.Set(header.ContentType, mediatype.JSON)
	uploadRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: objectStorage})(http.HandlerFunc(handler.Upload)).ServeHTTP(uploadRecorder, uploadRequest)
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	dryRunHTTPRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dryRunBody))
	dryRunHTTPRequest.Header.Set(header.ContentType, mediatype.JSON)
	dryRunRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: objectStorage})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dryRunRecorder, dryRunHTTPRequest)
	fake.SetFailure(storage.FakeDownloadSource, errors.New("dependency-error-sensitive-marker"))
	dependencyFailureBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDTwo})
	require.NoError(t, err)
	dependencyFailureRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dependencyFailureBody))
	dependencyFailureRequest.Header.Set(header.ContentType, mediatype.JSON)
	dependencyFailureRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: objectStorage})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dependencyFailureRecorder, dependencyFailureRequest)

	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
	var grantedUpload uploadResponse
	require.NoError(t, json.Unmarshal(uploadRecorder.Body.Bytes(), &grantedUpload))
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())
	require.Equal(t, http.StatusInternalServerError, dependencyFailureRecorder.Code, dependencyFailureRecorder.Body.String())
	rawLogs := logs.String()
	require.Contains(t, rawLogs, `"storage_key_digest":"`+storageKeyDigestOne+`"`)
	for _, secret := range []string{
		grantedUpload.StorageKey,
		storageKeyPrefix + fileIDOne,
		storageKeyPrefix + fileIDTwo,
		"source-bytes-secret",
		"private-object-marker",
		"private-metadata-marker",
		"metadata-preview-secret",
		"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"request-name-secret",
		"upload-url-secret",
		"credential-secret",
		"dependency-error-sensitive-marker",
	} {
		require.NotContains(t, rawLogs, secret)
	}
}

func TestUnexpectedStorageFailureLogsSafeErrorAndCancellationLogsNone(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name       string
		failure    error
		wantStatus int
		wantErrors int
	}{
		{name: "storage failure", failure: errors.New("sensitive-provider-url-object-key-marker"), wantStatus: http.StatusInternalServerError, wantErrors: 1},
		{name: "canceled", failure: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "deadline exceeded", failure: context.DeadlineExceeded, wantStatus: http.StatusRequestTimeout},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			fake := storage.NewFake()
			fake.SetFailure(storage.FakePresignSourceUpload, testCase.failure)
			var logs bytes.Buffer
			handler := newTestHandler(t)
			handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
			body, err := json.Marshal(uploadRequest{FileName: "private-file.pdf", FileSizeBytes: 1})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/uploads", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			response := httptest.NewRecorder()
			bound := bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload))

			bound.ServeHTTP(response, request)

			require.Equal(t, testCase.wantStatus, response.Code)
			require.Equal(t, testCase.wantErrors, bytes.Count(logs.Bytes(), []byte("\n")))
			require.NotContains(t, logs.String(), "sensitive-provider-url-object-key-marker")
			require.NotContains(t, logs.String(), `"error":`)
			if testCase.wantErrors == 0 {
				require.Empty(t, logs.String())
				return
			}
			var record struct {
				Level   string `json:"level"`
				Message string `json:"msg"`
			}
			require.NoError(t, json.Unmarshal(logs.Bytes(), &record))
			require.Equal(t, "ERROR", record.Level)
			require.Equal(t, "could not create upload", record.Message)
		})
	}
}

type sensitiveGrantStorage struct {
	storage.Storage
}

func (objectStorage *sensitiveGrantStorage) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (storage.PresignedRequest, error) {
	grant, err := objectStorage.Storage.PresignSourceUpload(ctx, fileID, sizeBytes, expiry)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	grant.URL = "https://upload-url-secret.invalid/source?credential=credential-secret"
	return grant, nil
}
