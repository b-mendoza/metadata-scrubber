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

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	handler := newTestHandler(t, nil, nil, nil)
	require.Equal(t, 2*time.Second, handler.admissionTimeout, "production admission wait must stay wired to two seconds")
	// Shorten the wait so the saturation path is exercised without spending the
	// production timeout; only the one-sided lower bound below depends on the
	// clock, and load can only increase elapsed time, never trip it.
	handler.admissionTimeout = 75 * time.Millisecond

	holderResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDOne},
		{method: dryRunMethod, fileID: fileIDTwo},
	})
	startedAt := time.Now()
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: observer, method: dryRunMethod, contentType: mediatype.JSON, body: string(body)})
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
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
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
	holderResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDOne},
		{method: dryRunMethod, fileID: fileIDTwo},
	})

	enteredWait := make(chan struct{})
	// sync.OnceFunc keeps the later follow-up requests from closing enteredWait twice.
	handler.beforeAcquireSelect = sync.OnceFunc(func() { close(enteredWait) })

	ctx, cancel := context.WithCancel(context.Background())
	response := make(chan *httptest.ResponseRecorder, 1)
	body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	require.NoError(t, err)
	go func() {
		response <- serveRequest(t, handlerRequest{ctx: ctx, handler: handler, objectStorage: observer, method: dryRunMethod, contentType: mediatype.JSON, body: string(body)})
	}()

	select {
	case <-enteredWait:
		require.Len(t, handler.permits, ProcessingPermitCount, "waiting request reached the acquisition select with both permits held")
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for request to reach the acquisition select")
	}
	canceledAt := time.Now()
	cancel()

	var recorder *httptest.ResponseRecorder
	select {
	case recorder = <-response:
		require.Less(t, time.Since(canceledAt), 500*time.Millisecond)
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
	followUpResponses := startGuardedRequests(t, handler, followUpObserver, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDOne},
		{method: dryRunMethod, fileID: fileIDTwo},
	})
	require.Len(t, handler.permits, ProcessingPermitCount)
	followUpObserver.releaseDownloads()
	requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for holder response")
}

func TestExactRevisionCacheHitSucceedsWhileBothPermitsAreHeld(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	require.NoError(t, fake.SetSanitized(fileIDThree, canonicalETagThree, []byte("clean")))
	handler := newTestHandler(t, nil, nil, nil)
	holderResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDOne},
		{method: dryRunMethod, fileID: fileIDTwo},
	})

	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: observer, method: scrubMethod, contentType: mediatype.JSON, body: string(body)})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 2, observer.peakDownloads())
	require.Equal(t, []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperationsFor(fake.Calls(), fileIDThree))

	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestMixedWorkflowsPeakAtTwo(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo, fileIDThree)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	handler := newTestHandler(t, nil, nil, nil)

	requests := []guardedRequest{
		{method: dryRunMethod, fileID: fileIDOne},
		{method: scrubMethod, fileID: fileIDTwo},
		{method: dryRunMethod, fileID: fileIDThree},
	}
	responses := startGuardedRequests(t, handler, observer, requests)
	require.Equal(t, 2, observer.peakDownloads())
	select {
	case fileID := <-observer.downloadStarted:
		require.FailNow(t, "third guarded workflow exceeded shared capacity", "downloaded %s", fileID)
	case <-time.After(100 * time.Millisecond):
	}

	observer.releaseDownloads()
	requireResponsesSuccess(t, responses, len(requests), "timed out waiting for mixed guarded workflow")
	require.Equal(t, 2, observer.peakDownloads())
	require.Empty(t, handler.permits)
}
