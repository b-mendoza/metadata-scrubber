package handler

import (
	"bytes"
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

func TestSaturatedEndpointUsesBaseDelayAndWritesSafeLogWhenJitterFails(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	var logs bytes.Buffer
	handler := newTestHandler(t, nil, nil, nil)
	handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
	handler.admissionJitter = func() (int, error) {
		return 0, errors.New("random-source-failure")
	}
	handler.admissionTimeout = time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Equal(t, "2", recorder.Header().Get(header.RetryAfter))
	require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
	require.Contains(t, logs.String(), `"msg":"could not generate admission retry jitter"`)
	require.NotContains(t, recorder.Body.String(), "random-source-failure")

	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses, "timed out waiting for holder response")
}

func TestDryRunReleasesPermitAfterPanic(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		panic("inspect panic")
	}, nil, nil)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	require.PanicsWithValue(t, "inspect panic", func() {
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	})

	handler.inspect = func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) { return nil, nil }
	followUpResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDTwo, fileIDThree} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, followUpResponses)
	}
	observer.waitForDownloads(t)
	close(observer.downloadRelease)
	requireResponsesSuccess(t, followUpResponses, "timed out waiting for follow-up response")
}

func TestScrubReleasesPermitAfterPanic(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	handler := newTestHandler(t, nil, func([]byte) ([]byte, error) {
		panic("clean panic")
	}, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	require.PanicsWithValue(t, "clean panic", func() {
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
	})

	handler.clean = func(input []byte) ([]byte, error) { return bytes.Clone(input), nil }
	followUpResponses := make(chan *httptest.ResponseRecorder, 2)
	{
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDTwo), ETag: canonicalETagTwo})
		require.NoError(t, err)
		go serveAdmissionScrub(body, handler, observer, followUpResponses)
	}
	{
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: canonicalETagThree})
		require.NoError(t, err)
		go serveAdmissionScrub(body, handler, observer, followUpResponses)
	}
	observer.waitForDownloads(t)
	close(observer.downloadRelease)
	requireResponsesSuccess(t, followUpResponses, "timed out waiting for follow-up response")
}
