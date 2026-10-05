package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	handler := newTestHandler(t, nil, nil, nil)
	require.Equal(t, 2*time.Second, handler.admissionTimeout, "production admission wait must stay wired to two seconds")
	// Shorten the wait so the saturation path is exercised without spending the
	// production timeout; only the one-sided lower bound below depends on the
	// clock, and load can only increase elapsed time, never trip it.
	handler.admissionTimeout = 75 * time.Millisecond

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveSaturatedAdmissionHolder(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)
	startedAt := time.Now()
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	elapsed := time.Since(startedAt)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code, recorder.Body.String())
	require.Equal(t, "2", recorder.Header().Get(header.RetryAfter))
	require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
	require.GreaterOrEqual(t, elapsed, 75*time.Millisecond)
	require.False(t, observer.downloadObserved(fileIDThree))
	require.NotContains(t, callOperationsFor(fake.Calls(), fileIDThree), storage.FakeDownloadSource)

	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestCancellationWhileWaitingReturnsSanitizedResponseWithoutStorageWork(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	var canceledInspectCalls, canceledCleanCalls atomic.Int64
	handler := newTestHandler(t, func(input []byte, _ scrub.InspectionOrigin) ([]scrub.Field, error) {
		if bytes.Contains(input, []byte(fileIDThree)) {
			canceledInspectCalls.Add(1)
		}
		return nil, nil
	}, func(input []byte) ([]byte, error) {
		if bytes.Contains(input, []byte(fileIDThree)) {
			canceledCleanCalls.Add(1)
		}
		return bytes.Clone(input), nil
	}, nil)
	t.Run("releases permits for follow-up capacity", func(t *testing.T) {
		holderResponses := make(chan *httptest.ResponseRecorder, 2)
		{
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
			require.NoError(t, err)
			go serveCancellationFirstHolder(body, handler, observer, holderResponses)
		}
		{
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDTwo)})
			require.NoError(t, err)
			go serveCancellationSecondHolder(body, handler, observer, holderResponses)
		}
		observer.waitForDownloads(t)

		enteredWait, response := make(chan struct{}), make(chan *httptest.ResponseRecorder, 1)
		// sync.OnceFunc keeps the later follow-up requests from closing enteredWait twice.
		handler.beforeAcquireSelect = sync.OnceFunc(func() { close(enteredWait) })

		ctx, cancel := context.WithCancel(context.Background())
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
		require.NoError(t, err)
		go serveCanceledAdmissionRequest(handler, canceledAdmissionRequest{
			ctx:      ctx,
			body:     body,
			observer: observer,
			response: response,
		})

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
		require.Empty(t, callOperationsFor(fake.Calls(), fileIDThree))
		require.Zero(t, canceledInspectCalls.Load())
		require.Zero(t, canceledCleanCalls.Load())

		observer.releaseDownloads()
		requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")

		followUpObserver := newBlockingStorage(fake, fileIDOne, fileIDTwo)
		followUpResponses := make(chan *httptest.ResponseRecorder, 2)
		{
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
			require.NoError(t, err)
			go serveCancellationFirstFollowUp(body, handler, followUpObserver, followUpResponses)
		}
		{
			body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDTwo)})
			require.NoError(t, err)
			go serveCancellationSecondFollowUp(body, handler, followUpObserver, followUpResponses)
		}
		followUpObserver.waitForDownloads(t)
		require.Len(t, handler.permits, ProcessingPermitCount)
		followUpObserver.releaseDownloads()
		requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for holder response")
	})
}

func TestExactRevisionCacheHitSucceedsWhileBothPermitsAreHeld(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	cached := []byte("clean")
	require.NoError(t, fake.SetSanitized(fileIDThree, canonicalETagThree, cached))
	var inspectCalls, cleanCalls atomic.Int64
	handler := newTestHandler(t, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls.Add(1)
		return nil, nil
	}, func([]byte) ([]byte, error) {
		cleanCalls.Add(1)
		return nil, nil
	}, nil)
	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDOne, fileIDTwo} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveCacheHitAdmissionHolder(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)

	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 2, observer.peakDownloads())
	require.Zero(t, inspectCalls.Load())
	require.Zero(t, cleanCalls.Load())
	require.False(t, observer.downloadObserved(fileIDThree))
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperationsFor(fake.Calls(), fileIDThree))
	stored, exists, err := fake.SanitizedBytes(fileIDThree, canonicalETagThree)
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, cached, stored)

	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestMixedWorkflowsPeakAtTwo(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo, fileIDThree)
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	handler := newTestHandler(t, nil, nil, nil)

	responses := make(chan *httptest.ResponseRecorder, 3)
	{
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
		require.NoError(t, err)
		go serveMixedWorkflowFirstDryRun(body, handler, observer, responses)
	}
	{
		body, err := json.Marshal(scrubRequest{
			StorageKey: formatStorageKey(fileIDTwo),
			ETag:       canonicalETagsByFileID[fileIDTwo],
		})
		require.NoError(t, err)
		go serveMixedWorkflowScrub(body, handler, observer, responses)
	}
	{
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
		require.NoError(t, err)
		go serveMixedWorkflowSecondDryRun(body, handler, observer, responses)
	}
	observer.waitForDownloads(t)
	require.Equal(t, 2, observer.peakDownloads())
	select {
	case fileID := <-observer.downloadStarted:
		require.FailNow(t, "third guarded workflow exceeded shared capacity", "downloaded %s", fileID)
	case <-time.After(100 * time.Millisecond):
	}

	observer.releaseDownloads()
	requireResponsesSuccess(t, responses, 3, "timed out waiting for mixed guarded workflow")
	require.Equal(t, 2, observer.peakDownloads())
	require.Empty(t, handler.permits)
}

func TestScrubReleasesPermitBeforeUploadingSanitizedBytes(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	require.NoError(t, fake.SetSource(fileIDThree, storage.SourceObject{PDFBytes: []byte("%PDF-three"), ETag: canonicalETagThree}))
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	observer.blockUpload(fileIDOne)
	handler := newTestHandler(t, nil, func(input []byte) ([]byte, error) {
		return input, nil
	}, nil)

	firstResponse := make(chan *httptest.ResponseRecorder, 1)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	go serveScrubWithBlockedSanitizedUpload(body, handler, observer, firstResponse)
	observer.waitForUpload(t, fileIDOne)

	holderResponses := make(chan *httptest.ResponseRecorder, 2)
	for _, fileID := range []string{fileIDTwo, fileIDThree} {
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileID)})
		require.NoError(t, err)
		go serveDryRunWhileSanitizedUploadBlocked(body, handler, observer, holderResponses)
	}
	observer.waitForDownloads(t)

	observer.releaseUploads()
	require.Equal(t, http.StatusOK, (<-firstResponse).Code)
	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func serveSaturatedAdmissionHolder(body []byte, handler *Handler, observer *blockingStorage, holderResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	holderResponses <- recorder
}

func serveCancellationFirstHolder(body []byte, handler *Handler, observer *blockingStorage, holderResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	holderResponses <- recorder
}

func serveCancellationSecondHolder(body []byte, handler *Handler, observer *blockingStorage, holderResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	holderResponses <- recorder
}

type canceledAdmissionRequest struct {
	ctx      context.Context
	body     []byte
	observer *blockingStorage
	response chan *httptest.ResponseRecorder
}

func serveCanceledAdmissionRequest(handler *Handler, admissionRequest canceledAdmissionRequest) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(admissionRequest.body)).WithContext(admissionRequest.ctx)
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: admissionRequest.observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	admissionRequest.response <- recorder
}

func serveCancellationFirstFollowUp(body []byte, handler *Handler, followUpObserver *blockingStorage, followUpResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: followUpObserver})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	followUpResponses <- recorder
}

func serveCancellationSecondFollowUp(body []byte, handler *Handler, followUpObserver *blockingStorage, followUpResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: followUpObserver})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	followUpResponses <- recorder
}

func serveCacheHitAdmissionHolder(body []byte, handler *Handler, observer *blockingStorage, holderResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	holderResponses <- recorder
}

func serveMixedWorkflowFirstDryRun(body []byte, handler *Handler, observer *blockingStorage, responses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	responses <- recorder
}

func serveMixedWorkflowScrub(body []byte, handler *Handler, observer *blockingStorage, responses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
	responses <- recorder
}

func serveMixedWorkflowSecondDryRun(body []byte, handler *Handler, observer *blockingStorage, responses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	responses <- recorder
}

func serveScrubWithBlockedSanitizedUpload(body []byte, handler *Handler, observer *blockingStorage, firstResponse chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
	firstResponse <- recorder
}

func serveDryRunWhileSanitizedUploadBlocked(body []byte, handler *Handler, observer *blockingStorage, holderResponses chan *httptest.ResponseRecorder) {
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: observer})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
	holderResponses <- recorder
}
