package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	handler := newTestHandler(t, nil, nil, nil)
	jitterValues := []int{0, 2}
	jitterCalls := 0
	handler.admissionJitter = func() (int, error) {
		value := jitterValues[jitterCalls]
		jitterCalls++
		return value, nil
	}
	require.Equal(t, 2*time.Second, handler.admissionTimeout, "production admission wait must stay wired to two seconds")
	// Shorten the wait so the saturation path is exercised without spending the
	// production timeout; only the one-sided lower bound below depends on the
	// clock, and load can only increase elapsed time, never trip it.
	handler.admissionTimeout = 75 * time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)
	for index, wantHeader := range []string{"2", "4"} {
		startedAt := time.Now()
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
		elapsed := time.Since(startedAt)

		require.Equal(t, http.StatusServiceUnavailable, recorder.Code, recorder.Body.String())
		require.Equal(t, wantHeader, recorder.Header().Get(header.RetryAfter))
		require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
		if index == 0 {
			require.GreaterOrEqual(t, elapsed, handler.admissionTimeout)
		}
		require.False(t, observer.downloadObserved(fileIDThree))
	}
	require.Equal(t, 2, jitterCalls)

	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses, "timed out waiting for holder response")
}

func TestCancellationWhileWaitingReturnsSanitizedResponseWithoutStorageWork(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	handler := newTestHandler(t, nil, nil, nil)
	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)

	enteredWait, response := make(chan struct{}), make(chan *httptest.ResponseRecorder, 1)
	handler.beforeAcquireSelect = func() { close(enteredWait) }

	ctx, cancel := context.WithCancel(context.Background())
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	require.NoError(t, err)
	serveCanceledAdmissionRequest := func() {
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body)).WithContext(ctx)
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
		response <- recorder
	}
	go serveCanceledAdmissionRequest()

	select {
	case <-enteredWait:
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for request to reach the acquisition select")
	}
	cancel()

	var recorder *httptest.ResponseRecorder
	select {
	case recorder = <-response:
	case <-time.After(time.Second):
		require.FailNow(t, "canceled admission wait did not complete promptly")
	}

	require.Equal(t, http.StatusRequestTimeout, recorder.Code)
	require.Equal(t, cancellationMessage, errorMessage(t, recorder))
	require.Empty(t, recorder.Header().Get(header.RetryAfter))
	require.False(t, observer.downloadObserved(fileIDThree))

	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses, "timed out waiting for holder response")
}

func TestExactRevisionCacheHitSucceedsWhileBothPermitsAreHeld(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	cached := []byte("clean")
	require.NoError(t, fake.SetSanitized(fileIDThree, canonicalETagThree, cached))
	var cleanCalls atomic.Int64
	handler := newTestHandler(t, nil, func([]byte) ([]byte, error) {
		cleanCalls.Add(1)
		return nil, nil
	}, nil)
	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)

	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Zero(t, cleanCalls.Load())
	require.False(t, observer.downloadObserved(fileIDThree))
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperationsFor(fake.Calls(), fileIDThree))

	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses, "timed out waiting for holder response")
}

func TestScrubReleasesPermitBeforeUploadingSanitizedBytes(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	observer.blockedUploadFileID = fileIDOne
	handler := newTestHandler(t, nil, func(input []byte) ([]byte, error) {
		return input, nil
	}, nil)

	firstResponse := make(chan *httptest.ResponseRecorder, 1)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	go serveAdmissionScrub(body, handler, observer, firstResponse)
	observer.waitForUpload(t, fileIDOne)

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDTwo, fileIDThree} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveAdmissionDryRun(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)

	close(observer.uploadRelease)
	require.Equal(t, http.StatusOK, (<-firstResponse).Code)
	close(observer.downloadRelease)
	requireResponsesSuccess(t, holderResponses, "timed out waiting for holder response")
}
