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
	"os"
	"slices"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestDryRunReturnsReviewedRevisionAndBackendOwnedFields(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-synthetic"), ETag: "0123456789abcdef0123456789abcdef"}))
	inspectCalls := 0
	handler := newTestHandler(t, func(input []byte, origin scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		require.Equal(t, []byte("%PDF-synthetic"), input)
		require.Equal(t, scrub.PublicInput, origin)
		return []scrub.Field{{Name: "title", Label: "Title", Preview: "private", OriginalByteSize: 7, Action: scrub.ActionRemove}}, nil
	}, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.ElementsMatch(t, []string{"etag", "fields"}, slices.Collect(maps.Keys(response)))
	var fields []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(response["fields"], &fields))
	require.Len(t, fields, 1)
	require.ElementsMatch(t, []string{"name", "label", "preview", "originalByteSize", "action"}, slices.Collect(maps.Keys(fields[0])))
	require.NotContains(t, recorder.Body.String(), "digest")
	require.Equal(t, 1, inspectCalls)

	calls := fake.Calls()
	require.Len(t, calls, 1)
	require.Equal(t, storage.FakeDownloadSource, calls[0].Operation)
	require.Empty(t, calls[0].SourceETag)
	require.Empty(t, handler.permits)
}

func TestDryRunReportsServerFailureForUnknownInspectedFieldAction(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-synthetic"), ETag: "0123456789abcdef0123456789abcdef"}))
	handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		return []scrub.Field{{Name: "field", Label: "Field", Action: scrub.FieldAction("unknown")}}, nil
	}, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)

	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})

	require.Equal(t, http.StatusInternalServerError, recorder.Code, recorder.Body.String())
	require.Equal(t, "could not inspect PDF", errorMessage(t, recorder))
}

func TestDryRunReturnsNonNullEmptyFieldsForCleanPDF(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-clean"), ETag: "0123456789abcdef0123456789abcdef"}))
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code)
	var response dryRunResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, canonicalETagOne, response.ETag)
	require.NotNil(t, response.Fields)
	require.Empty(t, response.Fields)
}

func TestDryRunIntegratesWithPublicPDFInspection(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "0123456789abcdef0123456789abcdef"}))
	handler := newTestHandler(t, scrub.InspectPDF, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response dryRunResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "0123456789abcdef0123456789abcdef", response.ETag)
	require.NotEmpty(t, response.Fields)
}

func TestConstructedDryRunRejectsStructurallySignedPDFFixtureWithoutMutation(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/structurally-signed.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "0123456789abcdef0123456789abcdef"}))
	workflow := New(slog.New(slog.NewTextHandler(io.Discard, nil)), make(chan struct{}, ProcessingPermitCount))
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: workflow, objectStorage: fake, method: dryRunMethod, body: string(body)})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, recorder.Body.String())
	require.Equal(t, "signed PDFs are not supported in v1", errorMessage(t, recorder))
	require.Equal(t, []storage.FakeOperation{storage.FakeDownloadSource}, callOperations(fake.Calls()))
	_, exists, err := fake.SanitizedBytes(fileIDOne, "0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	require.False(t, exists)
	require.Empty(t, workflow.permits)
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
		{name: "leading bytes", pdfBytes: []byte(" \n%PDF-1.7"), wantStatus: http.StatusUnsupportedMediaType, wantMessage: "file is not a PDF"},
		{name: "malformed candidate", pdfBytes: []byte("%PDF-"), inspectErr: scrub.ErrMalformedPDF, wantStatus: http.StatusBadRequest, wantMessage: "invalid PDF"},
		{name: "signed PDF", pdfBytes: []byte("%PDF-signed"), inspectErr: scrub.ErrSignedPDF, wantStatus: http.StatusUnprocessableEntity, wantMessage: "signed PDFs are not supported in v1"},
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
			handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				inspectCalls++
				return nil, testCase.inspectErr
			}, nil, nil)
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
			require.NoError(t, err)
			recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.NotContains(t, recorder.Body.String(), "provider-secret")
			require.NotContains(t, recorder.Body.String(), "dddddddddddddddddddddddddddddddd")
			if len(testCase.pdfBytes) == 0 || !bytes.HasPrefix(testCase.pdfBytes, []byte("%PDF-")) {
				require.Zero(t, inspectCalls)
			}
			require.Empty(t, handler.permits)
		})
	}
}
