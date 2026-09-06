package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestWriteJSONPreservesConcreteResponseContracts(t *testing.T) {
	tests := []struct {
		name     string
		write    func(http.ResponseWriter)
		wantBody string
	}{
		{
			name: "reachability",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, reachabilityResponse{Status: "reachable"}))
			},
			wantBody: "{\"status\":\"reachable\"}\n",
		},
		{
			name: "workflow config",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, workflowConfigResponse{MaxFileSizeBytes: storage.MaxSourceObjectBytes}))
			},
			wantBody: "{\"maxFileSizeBytes\":10485760}\n",
		},
		{
			name: "upload",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, uploadResponse{StorageKey: "uploads/id", UploadURL: "https://upload.example"}))
			},
			wantBody: "{\"storageKey\":\"uploads/id\",\"uploadUrl\":\"https://upload.example\"}\n",
		},
		{
			name: "dry run",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, dryRunResponse{ETag: "revision", Fields: []publicField{}}))
			},
			wantBody: "{\"etag\":\"revision\",\"fields\":[]}\n",
		},
		{
			name: "scrub",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, scrubResponse{Status: "done", Result: scrubResponseResult{DownloadURL: "https://download.example"}}))
			},
			wantBody: "{\"status\":\"done\",\"result\":{\"downloadUrl\":\"https://download.example\"}}\n",
		},
		{
			name: "download grant",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, downloadGrantResponse{DownloadURL: "https://download.example", ExpiresAt: "2026-09-01T12:15:00Z"}))
			},
			wantBody: "{\"downloadUrl\":\"https://download.example\",\"expiresAt\":\"2026-09-01T12:15:00Z\"}\n",
		},
		{
			name: "delete",
			write: func(w http.ResponseWriter) {
				require.NoError(t, writeJSON(w, http.StatusAccepted, deleteResponse{Status: "deleted"}))
			},
			wantBody: "{\"status\":\"deleted\"}\n",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			testCase.write(recorder)

			require.Equal(t, http.StatusAccepted, recorder.Code)
			require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
			require.Equal(t, testCase.wantBody, recorder.Body.String())
		})
	}
}

func TestUploadWireContractRejectsInvalidJSONBeforeWork(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		body        string
		wantStatus  int
	}{
		{name: "missing content type", body: `{}`, wantStatus: http.StatusUnsupportedMediaType},
		{name: "wrong content type", contentType: "text/plain", body: `{}`, wantStatus: http.StatusUnsupportedMediaType},
		{name: "empty body", contentType: mediatype.JSON, wantStatus: http.StatusBadRequest},
		{name: "malformed JSON", contentType: mediatype.JSON, body: `{`, wantStatus: http.StatusBadRequest},
		{name: "unknown field", contentType: mediatype.JSON, body: `{"fileName":"report.pdf","fileSizeBytes":1,"unexpected":true}`, wantStatus: http.StatusBadRequest},
		{name: "multiple JSON values", contentType: mediatype.JSON, body: `{"fileName":"report.pdf","fileSizeBytes":1} {}`, wantStatus: http.StatusBadRequest},
		{name: "trailing JSON null", contentType: mediatype.JSON, body: `{"fileName":"report.pdf","fileSizeBytes":1} null`, wantStatus: http.StatusBadRequest},
		{name: "non-whitespace trailing data", contentType: mediatype.JSON, body: `{"fileName":"report.pdf","fileSizeBytes":1} trailing`, wantStatus: http.StatusBadRequest},
		{name: "wrong JSON type", contentType: mediatype.JSON, body: `{"fileName":1,"fileSizeBytes":1}`, wantStatus: http.StatusBadRequest},
		{name: "oversized body", contentType: mediatype.JSON, body: `{"fileName":"` + strings.Repeat("x", maxJSONBodyBytes) + `","fileSizeBytes":1}`, wantStatus: http.StatusBadRequest},
		{name: "parameters and trailing whitespace", contentType: mediatype.JSON + "; charset=utf-8; profile=safe", body: `{"fileName":"report.pdf","fileSizeBytes":1}` + " \n\t", wantStatus: http.StatusOK},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			testUploadWireContract(t, testCase.contentType, testCase.body, testCase.wantStatus)
		})
	}
}

func testUploadWireContract(t *testing.T, contentType string, body string, wantStatus int) {
	t.Helper()
	fake := storage.NewFake()
	entropyCalls := 0
	handler := newTestHandler(t, nil, nil, func(destination []byte) (int, error) {
		entropyCalls++
		for index := range destination {
			destination[index] = byte(index)
		}
		return len(destination), nil
	})
	request := httptest.NewRequest(http.MethodPost, "/api/files/upload", strings.NewReader(body))
	if contentType != "" {
		request.Header.Set(header.ContentType, contentType)
	}
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(recorder, request)

	require.Equal(t, wantStatus, recorder.Code, recorder.Body.String())
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	if wantStatus == http.StatusOK {
		require.Equal(t, 1, entropyCalls)
		require.Equal(t, []storage.FakeOperation{storage.FakePresignSourceUpload}, callOperations(fake.Calls()))
		return
	}
	require.NotEmpty(t, errorMessage(t, recorder))
	require.Zero(t, entropyCalls)
	require.Empty(t, fake.Calls())
}

func TestUploadValidatesRequiredFieldsBeforeWork(t *testing.T) {
	fake := storage.NewFake()
	entropyCalls := 0
	handler := newTestHandler(t, nil, nil, func([]byte) (int, error) {
		entropyCalls++
		return 0, nil
	})
	body, err := json.Marshal(uploadRequest{FileName: "", FileSizeBytes: 1})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "invalid upload request", errorMessage(t, recorder))
	require.Zero(t, entropyCalls)
	require.Empty(t, fake.Calls())
}

func TestDryRunValidatesRequiredFieldsBeforeWork(t *testing.T) {
	fake := storage.NewFake()
	inspectCalls := 0
	handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		return nil, nil
	}, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: ""})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "invalid storage key", errorMessage(t, recorder))
	require.Zero(t, inspectCalls)
	require.Empty(t, fake.Calls())
}

func TestScrubValidatesRequiredFieldsBeforeWork(t *testing.T) {
	fake := storage.NewFake()
	cleanCalls := 0
	handler := newTestHandler(t, nil, func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: ""})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "invalid ETag", errorMessage(t, recorder))
	require.Zero(t, cleanCalls)
	require.Empty(t, fake.Calls())
}

func TestDownloadGrantValidatesRequiredFieldsBeforeWork(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(downloadGrantRequest{StorageKey: formatStorageKey(fileIDOne), ETag: ""})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/download-grant", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DownloadGrant)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "invalid ETag", errorMessage(t, recorder))
	require.Empty(t, fake.Calls())
}

func TestDeleteFlowValidatesRequiredFieldsBeforeWork(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(deleteRequest{StorageKey: ""})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DeleteFlow)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "invalid storage key", errorMessage(t, recorder))
	require.Empty(t, fake.Calls())
}
