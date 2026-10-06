package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestDryRunReturnsReviewedRevisionAndBackendOwnedFields(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-synthetic"), ETag: canonicalETagOne}))
	inspectCalls := 0
	handler := newTestHandler(t)
	handler.inspect = func(input []byte) ([]scrub.Field, error) {
		inspectCalls++
		require.Equal(t, []byte("%PDF-synthetic"), input)
		return []scrub.Field{
			{Name: "title", Label: "Title", Preview: "private", OriginalByteSize: 7, Action: scrub.ActionRemove},
			{Name: "producer", Label: "Producer", Preview: "publisher", OriginalByteSize: 9, Action: scrub.ActionReplace},
		}, nil
	}
	body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.ElementsMatch(t, []string{"etag", "fields"}, slices.Collect(maps.Keys(response)))
	var fields []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(response["fields"], &fields))
	require.Len(t, fields, 2)
	for index, wantAction := range []string{"remove", "replace"} {
		require.ElementsMatch(t, []string{"name", "label", "preview", "originalByteSize", "action"}, slices.Collect(maps.Keys(fields[index])))
		var action publicFieldAction
		require.NoError(t, json.Unmarshal(fields[index]["action"], &action))
		require.Equal(t, publicFieldAction(wantAction), action)
	}
	require.Equal(t, 1, inspectCalls)

	calls := fake.Calls()
	require.Len(t, calls, 1)
	require.Equal(t, storage.FakeDownloadSource, calls[0].Operation)
	require.Empty(t, calls[0].SourceETag)
}

func TestDryRunReportsServerFailureForUnknownInspectedFieldAction(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-synthetic"), ETag: canonicalETagOne}))
	handler := newTestHandler(t)
	handler.inspect = func([]byte) ([]scrub.Field, error) {
		return []scrub.Field{{Name: "field", Label: "Field", Action: scrub.FieldAction("unknown")}}, nil
	}
	body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code, recorder.Body.String())
	require.Equal(t, "could not inspect PDF", errorMessage(t, recorder))
}

func TestDryRunReturnsNonNullEmptyFieldsForCleanPDF(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-clean"), ETag: canonicalETagOne}))
	handler := newTestHandler(t)
	body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	var response dryRunResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, canonicalETagOne, response.ETag)
	require.NotNil(t, response.Fields)
	require.Empty(t, response.Fields)
}

func TestConstructedDryRunRejectsStructurallySignedPDFFixtureWithoutMutation(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/structurally-signed.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: canonicalETagOne}))
	workflow := New(slog.New(slog.NewTextHandler(io.Discard, nil)))
	body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(workflow.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, recorder.Body.String())
	require.Equal(t, "signed PDFs are not supported in v1", errorMessage(t, recorder))
	require.Equal(t, []storage.FakeOperation{storage.FakeDownloadSource}, callOperations(fake.Calls()))
	_, exists, err := fake.SanitizedBytes(fileIDOne, canonicalETagOne)
	require.NoError(t, err)
	require.False(t, exists)
}

func TestDryRunClassifiesContentAndDependencyFailuresWithoutLeakingDetails(t *testing.T) {
	tests := []struct {
		name        string
		pdfBytes    []byte
		storageErr  error
		inspectErr  error
		wantStatus  int
		wantMessage string
	}{
		{name: "spoofed content", pdfBytes: []byte("not-pdf"), wantStatus: http.StatusUnsupportedMediaType, wantMessage: "file is not a PDF"},
		{name: "malformed candidate", pdfBytes: []byte("%PDF-"), inspectErr: scrub.ErrMalformedPDF, wantStatus: http.StatusBadRequest, wantMessage: "invalid PDF"},
		{name: "caller cancellation", pdfBytes: []byte("%PDF-canceled"), inspectErr: context.Canceled, wantStatus: http.StatusRequestTimeout, wantMessage: cancellationMessage},
		{name: "caller deadline", pdfBytes: []byte("%PDF-deadline"), inspectErr: context.DeadlineExceeded, wantStatus: http.StatusRequestTimeout, wantMessage: cancellationMessage},
		{name: "oversized PDF input", pdfBytes: []byte("%PDF-large"), inspectErr: scrub.ErrInputTooLarge, wantStatus: http.StatusRequestEntityTooLarge, wantMessage: "source file exceeds 10 MiB limit"},
		{name: "inspection limit", pdfBytes: []byte("%PDF-large"), inspectErr: scrub.ErrInspectionLimit, wantStatus: http.StatusBadRequest, wantMessage: "PDF metadata exceeds inspection limits"},
		{name: "missing source", storageErr: storage.ErrSourceNotFound, wantStatus: http.StatusNotFound, wantMessage: "source file not found"},
		{name: "oversized source", storageErr: storage.ErrSourceObjectTooLarge, wantStatus: http.StatusRequestEntityTooLarge, wantMessage: "source file exceeds 10 MiB limit"},
		{name: "dependency failure", storageErr: errors.New("provider-secret"), wantStatus: http.StatusInternalServerError, wantMessage: "could not inspect PDF"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			if testCase.storageErr != nil {
				fake.SetFailure(storage.FakeDownloadSource, testCase.storageErr)
			}
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: testCase.pdfBytes, ETag: "dddddddddddddddddddddddddddddddd"}))
			inspectCalls := 0
			handler := newTestHandler(t)
			handler.inspect = func([]byte) ([]scrub.Field, error) {
				inspectCalls++
				return nil, testCase.inspectErr
			}
			body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.NotContains(t, recorder.Body.String(), "provider-secret")
			require.NotContains(t, recorder.Body.String(), "dddddddddddddddddddddddddddddddd")
			if len(testCase.pdfBytes) == 0 || !bytes.HasPrefix(testCase.pdfBytes, []byte("%PDF-")) {
				require.Zero(t, inspectCalls)
			}
		})
	}
}
