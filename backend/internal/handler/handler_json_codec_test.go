package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

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

func TestJSONEndpointsValidateEveryBoundaryBeforeWork(t *testing.T) {
	endpoints := []struct {
		name                   string
		method                 handlerMethod
		wrongTypeBody          string
		missingFieldBody       string
		oversizedBody          string
		acceptedParameterBody  string
		configureAccepted      func(*testing.T, *storage.Fake)
		wantAcceptedOperations []storage.FakeOperation
		wantInspectCalls       int
		wantCleanCalls         int
	}{
		{
			name:                   "upload",
			method:                 uploadMethod,
			wrongTypeBody:          `{"fileName":1,"fileSizeBytes":1}`,
			missingFieldBody:       `{"fileName":"report.pdf"}`,
			oversizedBody:          `{"fileName":"` + strings.Repeat("x", maxJSONBodyBytes) + `","fileSizeBytes":1}`,
			acceptedParameterBody:  `{"fileName":"report.pdf","fileSizeBytes":1}` + " \n\t",
			wantAcceptedOperations: []storage.FakeOperation{storage.FakePresignSourceUpload},
		},
		{
			name:                  "dry run",
			method:                dryRunMethod,
			wrongTypeBody:         `{"storageKey":1}`,
			missingFieldBody:      `{}`,
			oversizedBody:         `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`,
			acceptedParameterBody: `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}` + " \n\t",
			configureAccepted: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
					PDFBytes: []byte("%PDF-source"),
					ETag:     "0123456789abcdef0123456789abcdef",
				}))
			},
			wantAcceptedOperations: []storage.FakeOperation{storage.FakeDownloadSource},
			wantInspectCalls:       1,
		},
		{
			name:                  "scrub",
			method:                scrubMethod,
			wrongTypeBody:         `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":1}`,
			missingFieldBody:      `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}`,
			oversizedBody:         `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `","etag":"` + canonicalETagOne + `"}`,
			acceptedParameterBody: `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":"` + canonicalETagOne + `"}` + " \n\t",
			configureAccepted: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
					PDFBytes: []byte("%PDF-source"),
					ETag:     canonicalETagOne,
				}))
			},
			wantAcceptedOperations: []storage.FakeOperation{
				storage.FakeSourceExists,
				storage.FakeSanitizedExists,
				storage.FakeDownloadSource,
				storage.FakeUploadSanitized,
				storage.FakePresignSanitizedDownload,
			},
			wantCleanCalls: 1,
		},
		{
			name:                  "download grant",
			method:                downloadGrantMethod,
			wrongTypeBody:         `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":1}`,
			missingFieldBody:      `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}`,
			oversizedBody:         `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `","etag":"` + canonicalETagOne + `"}`,
			acceptedParameterBody: `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":"` + canonicalETagOne + `"}` + " \n\t",
			configureAccepted: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
			},
			wantAcceptedOperations: []storage.FakeOperation{
				storage.FakeSanitizedExists,
				storage.FakePresignSanitizedDownload,
			},
		},
		{
			name:                   "delete flow",
			method:                 deleteFlowMethod,
			wrongTypeBody:          `{"storageKey":1}`,
			missingFieldBody:       `{}`,
			oversizedBody:          `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`,
			acceptedParameterBody:  `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}` + " \n\t",
			wantAcceptedOperations: []storage.FakeOperation{storage.FakeDeleteFlow},
		},
	}

	// Every subtest below needs its own handler with fresh inspect and clean counters.
	newCountingHandler := func(t *testing.T) (*Handler, *int, *int) {
		t.Helper()
		inspectCalls, cleanCalls := 0, 0
		handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
			inspectCalls++
			return nil, nil
		}, func(input []byte) ([]byte, error) {
			cleanCalls++
			return bytes.Clone(input), nil
		}, nil)
		return handler, &inspectCalls, &cleanCalls
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint.name, func(t *testing.T) {
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
				{name: "unknown field", contentType: mediatype.JSON, body: `{"unexpected":true}`, wantStatus: http.StatusBadRequest},
				{name: "multiple JSON values", contentType: mediatype.JSON, body: `{} {}`, wantStatus: http.StatusBadRequest},
				{name: "trailing JSON null", contentType: mediatype.JSON, body: endpoint.acceptedParameterBody + "null", wantStatus: http.StatusBadRequest},
				{name: "non-whitespace trailing data", contentType: mediatype.JSON, body: `{} trailing`, wantStatus: http.StatusBadRequest},
				{name: "wrong JSON type", contentType: mediatype.JSON, body: endpoint.wrongTypeBody, wantStatus: http.StatusBadRequest},
				{name: "missing required field", contentType: mediatype.JSON, body: endpoint.missingFieldBody, wantStatus: http.StatusBadRequest},
				{name: "oversized body", contentType: mediatype.JSON, body: endpoint.oversizedBody, wantStatus: http.StatusBadRequest},
			}

			for _, testCase := range tests {
				t.Run(testCase.name, func(t *testing.T) {
					fake := storage.NewFake()
					handler, inspectCalls, cleanCalls := newCountingHandler(t)
					recorder := serveRequest(t, handlerRequest{
						ctx: context.Background(), handler: handler, objectStorage: fake,
						method: endpoint.method, contentType: testCase.contentType, body: testCase.body,
					})

					require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
					require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
					require.NotEmpty(t, errorMessage(t, recorder))
					require.Empty(t, fake.Calls())
					require.Zero(t, *inspectCalls)
					require.Zero(t, *cleanCalls)
				})
			}

			t.Run("content type parameters and trailing whitespace reach successful work", func(t *testing.T) {
				fake := storage.NewFake()
				if endpoint.configureAccepted != nil {
					endpoint.configureAccepted(t, fake)
				}
				handler, inspectCalls, cleanCalls := newCountingHandler(t)

				recorder := serveRequest(t, handlerRequest{
					ctx: context.Background(), handler: handler, objectStorage: fake,
					method: endpoint.method, contentType: mediatype.JSON + "; charset=utf-8; profile=safe",
					body: endpoint.acceptedParameterBody,
				})

				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
				require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
				assertAcceptedResponse(t, endpoint.method, recorder)
				require.Equal(t, endpoint.wantAcceptedOperations, callOperations(fake.Calls()))
				require.Equal(t, endpoint.wantInspectCalls, *inspectCalls)
				require.Equal(t, endpoint.wantCleanCalls, *cleanCalls)
			})
		})
	}
}
