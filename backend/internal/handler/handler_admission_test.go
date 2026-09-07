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

func TestSaturatedEndpointUsesFreshWholeSecondJitter(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	jitterValues := []int{0, 2}
	jitterCalls := 0
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)),
		admissionJitter: func() (int, error) {
			value := jitterValues[jitterCalls]
			jitterCalls++
			return value, nil
		},
	})
	handler.admissionTimeout = time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			holderResponses <- recorder
		}()
	}
	observer.waitForDownloads(t)
	for index, wantHeader := range []string{"2", "4"} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusServiceUnavailable, recorder.Code, "response %d: %s", index, recorder.Body.String())
		require.Equal(t, wantHeader, recorder.Header().Get(header.RetryAfter), "response %d", index)
		require.Regexp(t, `^[1-9][0-9]*$`, recorder.Header().Get(header.RetryAfter))
		require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
	}
	require.Equal(t, 2, jitterCalls)

	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestSaturatedEndpointUsesBaseDelayAndWritesSafeLogWhenJitterFails(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		admissionJitter: func() (int, error) {
			return 0, errors.New("random-source-failure")
		},
	})
	handler.admissionTimeout = time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go func() {
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			holderResponses <- recorder
		}()
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

	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestDryRunReleasesPermitAfterSuccessErrorAndCancellation(t *testing.T) {
	tests := []struct {
		name       string
		inspectErr error
		wantStatus int
	}{
		{name: "success", wantStatus: http.StatusOK},
		{name: "error", inspectErr: errors.New("inspect failed"), wantStatus: http.StatusInternalServerError},
		{name: "cancellation", inspectErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
			require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
			require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
			observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
			handler := newTestHandler(t, func(input []byte, _ scrub.InspectionOrigin) ([]scrub.Field, error) {
				if bytes.Contains(input, []byte("one")) {
					return nil, testCase.inspectErr
				}
				return nil, nil
			}, nil, nil)
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())

			followUpResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
				{scrub: false, fileID: fileIDTwo},
				{scrub: false, fileID: fileIDThree},
			})
			observer.releaseDownloads()
			requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for follow-up response")
		})
	}
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
	followUpResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{scrub: false, fileID: fileIDTwo},
		{scrub: false, fileID: fileIDThree},
	})
	observer.releaseDownloads()
	requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for follow-up response")
}

func TestScrubReleasesPermitAfterSuccessErrorAndCancellation(t *testing.T) {
	tests := []struct {
		name       string
		cleanErr   error
		wantStatus int
	}{
		{name: "success", wantStatus: http.StatusOK},
		{name: "error", cleanErr: errors.New("clean failed"), wantStatus: http.StatusInternalServerError},
		{name: "cancellation", cleanErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
			require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
			require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
			observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
			handler := newTestHandler(t, nil, func(input []byte) ([]byte, error) {
				if bytes.Contains(input, []byte("one")) {
					return nil, testCase.cleanErr
				}
				return bytes.Clone(input), nil
			}, nil)
			body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())

			followUpResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
				{scrub: true, fileID: fileIDTwo},
				{scrub: true, fileID: fileIDThree},
			})
			observer.releaseDownloads()
			requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for follow-up response")
		})
	}
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
	followUpResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{scrub: true, fileID: fileIDTwo},
		{scrub: true, fileID: fileIDThree},
	})
	observer.releaseDownloads()
	requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for follow-up response")
}
