package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestScrubMissingSourceStopsBeforeCacheAdmissionAndPDFWork(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("orphaned-clean")))
	inspectCalls, cleanCalls := 0, 0
	handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		return nil, nil
	}, func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)

	recorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), contentType: mediatype.JSON,
		handler: handler, objectStorage: fake, method: scrubMethod, body: string(body),
	})

	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.Equal(t, "source file not found", errorMessage(t, recorder))
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists}, callOperations(fake.Calls()))
	require.Zero(t, inspectCalls)
	require.Zero(t, cleanCalls)
	require.Empty(t, handler.permits)
}

func TestScrubSourceLookupFailureStopsBeforeLaterWork(t *testing.T) {
	fake := storage.NewFake()
	fake.SetFailure(storage.FakeSourceExists, errors.New("provider-source-secret"))
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)

	recorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), contentType: mediatype.JSON,
		handler: handler, objectStorage: fake, method: scrubMethod, body: string(body),
	})

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "could not check source file", errorMessage(t, recorder))
	require.NotContains(t, recorder.Body.String(), "provider-source-secret")
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists}, callOperations(fake.Calls()))
	require.Empty(t, handler.permits)
}

func TestScrubCacheHitBypassesAdmissionAndReusesExactRevision(t *testing.T) {
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDThree)
	require.NoError(t, fake.SetSanitized(fileIDThree, canonicalETagThree, []byte("already-clean")))
	permits := make(chan struct{}, ProcessingPermitCount)
	permits <- struct{}{}
	permits <- struct{}{}
	inspectCalls, cleanCalls := 0, 0
	handler := newTestHandlerWithLogger(t, testHandlerOptions{permits: permits, logger: slog.New(slog.NewTextHandler(io.Discard, nil)), inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		return nil, nil
	}, clean: func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}})
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: scrubMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Contains(t, recorder.Body.String(), `"status":"done"`)
	require.Len(t, permits, ProcessingPermitCount)
	require.Zero(t, inspectCalls)
	require.Zero(t, cleanCalls)
	calls := fake.Calls()
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperations(calls))
	stored, exists, err := fake.SanitizedBytes(fileIDThree, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("already-clean"), stored)
}

func TestScrubCacheMissBindsEveryOperationToReviewedRevision(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: "0123456789abcdef0123456789abcdef"}))
	permits := make(chan struct{}, ProcessingPermitCount)
	cleaned := []byte("%PDF-cleaned")
	cleanCalls := 0
	handler := newTestHandlerWithLogger(t, testHandlerOptions{permits: permits, logger: slog.New(slog.NewTextHandler(io.Discard, nil)), clean: func(input []byte) ([]byte, error) {
		cleanCalls++
		require.Len(t, permits, 1, "clean must run while admitted")
		require.Equal(t, []byte("%PDF-source"), input)
		return cleaned, nil
	}})
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "0123456789abcdef0123456789abcdef"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: scrubMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 1, cleanCalls)
	require.Empty(t, permits)
	calls := fake.Calls()
	require.Equal(t, []storage.FakeOperation{
		storage.FakeSourceExists,
		storage.FakeSanitizedExists,
		storage.FakeDownloadSource,
		storage.FakeUploadSanitized,
		storage.FakePresignSanitizedDownload,
	}, callOperations(calls))
	for _, call := range calls {
		if call.Operation == storage.FakeSourceExists {
			require.Empty(t, call.SourceETag)
			continue
		}
		require.Equal(t, canonicalETagOne, call.SourceETag)
	}
	stored, exists, err := fake.SanitizedBytes(fileIDOne, "0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, cleaned, stored)
}

func TestScrubIntegratesWithDeepPDFCleaning(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "0123456789abcdef0123456789abcdef"}))
	handler := newTestHandler(t, scrub.InspectPDF, scrub.CleanPDF, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "0123456789abcdef0123456789abcdef"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: scrubMethod, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	stored, exists, err := fake.SanitizedBytes(fileIDOne, "0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	require.True(t, exists)
	fields, err := scrub.InspectPDF(stored, scrub.PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, fields)
}

func TestScrubReturnsConflictBeforePDFOrWriteWork(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-current"), ETag: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}))
	cleanCalls := 0
	handler := newTestHandler(t, nil, func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "cccccccccccccccccccccccccccccccc"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: scrubMethod, body: string(body)})

	require.Equal(t, http.StatusConflict, recorder.Code)
	require.Equal(t, "source file changed since review", errorMessage(t, recorder))
	require.Zero(t, cleanCalls)
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakeDownloadSource}, callOperations(fake.Calls()))
	require.Empty(t, handler.permits)
}
