package handler

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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

const (
	fileIDOne                 = "00000000-0000-4000-8000-000000000001"
	fileIDTwo                 = "00000000-0000-4000-8000-000000000002"
	fileIDThree               = "00000000-0000-4000-8000-000000000003"
	generatedFileID           = "00010203-0405-4607-8809-0a0b0c0d0e0f"
	storageKeyDigestOne       = "77376c868b92"
	storageKeyDigestTwo       = "8fb905d391d9"
	generatedStorageKeyDigest = "1e8eaec2a78b"
	canonicalETagOne          = "0123456789abcdef0123456789abcdef"
	canonicalETagTwo          = "fedcba9876543210fedcba9876543210"
	canonicalETagThree        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

func TestAdmissionTimeoutUsesFreshWholeSecondJitterAtResponseBoundary(t *testing.T) {
	for _, testCase := range []struct {
		name       string
		jitter     int
		wantHeader string
	}{
		{name: "zero seconds", jitter: 0, wantHeader: "2"},
		{name: "one second", jitter: 1, wantHeader: "3"},
		{name: "two seconds", jitter: 2, wantHeader: "4"},
		{name: "floor", jitter: -10, wantHeader: "1"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			handler := newTestHandlerWithLogger(t, testHandlerOptions{
				permits: make(chan struct{}, ProcessingPermitCount),
				logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
				admissionJitter: func() (int, error) {
					return testCase.jitter, nil
				},
			})
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", http.NoBody)

			handler.writeAdmissionFailure(recorder, request, errAdmissionTimeout)

			require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
			require.Equal(t, testCase.wantHeader, recorder.Header().Get(header.RetryAfter))
			require.Regexp(t, `^[1-9][0-9]*$`, recorder.Header().Get(header.RetryAfter))
			require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
		})
	}

	jitterValues := []int{0, 2}
	jitterCalls := 0
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		admissionJitter: func() (int, error) {
			value := jitterValues[jitterCalls]
			jitterCalls++
			return value, nil
		},
	})
	for index, wantHeader := range []string{"2", "4"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", http.NoBody)
		handler.writeAdmissionFailure(recorder, request, errAdmissionTimeout)
		require.Equal(t, wantHeader, recorder.Header().Get(header.RetryAfter), "response %d", index)
	}
	require.Equal(t, 2, jitterCalls)
}

func TestAdmissionJitterFailureUsesBaseDelayAndWritesSafeLog(t *testing.T) {
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		admissionJitter: func() (int, error) {
			return 0, errors.New("random-source-failure")
		},
	})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", http.NoBody)

	handler.writeAdmissionFailure(recorder, request, errAdmissionTimeout)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Equal(t, "2", recorder.Header().Get(header.RetryAfter))
	require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
	require.Contains(t, logs.String(), `"msg":"could not generate admission retry jitter"`)
	require.NotContains(t, recorder.Body.String(), "random-source-failure")
}

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

type terminalPathTestCase struct {
	name          string
	method        handlerMethod
	downloadErr   error
	downloadPanic string
	inspectErr    error
	inspectPanic  string
	cleanErr      error
	cleanPanic    string
	wantStatus    int
}

func TestTerminalPathsReleasePermits(t *testing.T) {
	terminalCases := []terminalPathTestCase{
		{name: "dry run success", method: dryRunMethod, wantStatus: http.StatusOK},
		{name: "scrub success", method: scrubMethod, wantStatus: http.StatusOK},
		{name: "download error", method: dryRunMethod, downloadErr: errors.New("download failed"), wantStatus: http.StatusInternalServerError},
		{name: "download cancellation", method: scrubMethod, downloadErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "download panic", method: dryRunMethod, downloadPanic: "download panic"},
		{name: "inspect error", method: dryRunMethod, inspectErr: errors.New("inspect failed"), wantStatus: http.StatusInternalServerError},
		{name: "inspect cancellation", method: dryRunMethod, inspectErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "inspect panic", method: dryRunMethod, inspectPanic: "inspect panic"},
		{name: "clean error", method: scrubMethod, cleanErr: errors.New("clean failed"), wantStatus: http.StatusInternalServerError},
		{name: "clean cancellation", method: scrubMethod, cleanErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "clean panic", method: scrubMethod, cleanPanic: "clean panic"},
	}

	for _, testCase := range terminalCases {
		t.Run(testCase.name+" returns both permits", func(t *testing.T) { runTerminalPathTest(t, testCase) })
	}
}

func runTerminalPathTest(t *testing.T, testCase terminalPathTestCase) {
	t.Helper()
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	configureTerminalDownload(observer, testCase)
	handler := newTestHandler(t, terminalInspectOperation(testCase), func(input []byte) ([]byte, error) {
		switch {
		case !bytes.Contains(input, []byte(fileIDOne)):
			return bytes.Clone(input), nil
		case testCase.cleanPanic != "":
			panic(testCase.cleanPanic)
		case testCase.cleanErr != nil:
			return nil, testCase.cleanErr
		default:
			return bytes.Clone(input), nil
		}
	}, nil)
	var body []byte
	var err error
	if testCase.method == scrubMethod {
		body, err = json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	} else {
		body, err = json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	}
	require.NoError(t, err)
	request := handlerRequest{ctx: context.Background(), handler: handler, objectStorage: observer, method: testCase.method, contentType: mediatype.JSON, body: string(body)}
	panicValue := testCase.downloadPanic + testCase.inspectPanic + testCase.cleanPanic
	if panicValue != "" {
		require.PanicsWithValue(t, panicValue, func() { serveRequest(t, request) })
	} else {
		recorder := serveRequest(t, request)
		require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
	}
	require.Empty(t, handler.permits)

	followUpResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDTwo},
		{method: scrubMethod, fileID: fileIDThree},
	})
	require.Len(t, handler.permits, ProcessingPermitCount, "both follow-up workflows must acquire after terminal path")
	require.Equal(t, 2, observer.peakDownloads())
	observer.releaseDownloads()
	requireResponsesSuccess(t, followUpResponses, 2, "timed out waiting for holder response")
	require.Empty(t, handler.permits)
}

func configureTerminalDownload(observer *blockingStorage, testCase terminalPathTestCase) {
	if testCase.downloadErr != nil {
		observer.failDownload(fileIDOne, testCase.downloadErr)
	}
	if testCase.downloadPanic != "" {
		observer.panicDownload(fileIDOne, testCase.downloadPanic)
	}
}

func terminalInspectOperation(testCase terminalPathTestCase) inspectPDFOperation {
	return func(input []byte, _ scrub.InspectionOrigin) ([]scrub.Field, error) {
		if !bytes.Contains(input, []byte(fileIDOne)) {
			return nil, nil
		}
		if testCase.inspectPanic != "" {
			panic(testCase.inspectPanic)
		}
		return nil, testCase.inspectErr
	}
}

func TestScrubReleasesPermitBeforeUploadingSanitizedBytes(t *testing.T) {
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	observer.blockUpload(fileIDOne)
	handler := newTestHandler(t, nil, func(input []byte) ([]byte, error) {
		return input, nil
	}, nil)

	firstResponse := make(chan *httptest.ResponseRecorder, 1)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	go func() {
		firstResponse <- serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: observer, method: scrubMethod, contentType: mediatype.JSON, body: string(body)})
	}()
	observer.waitForUpload(t, fileIDOne)
	require.Empty(t, handler.permits, "upload must start after guarded permit release")

	holderResponses := startGuardedRequests(t, handler, observer, []guardedRequest{
		{method: dryRunMethod, fileID: fileIDTwo},
		{method: dryRunMethod, fileID: fileIDThree},
	})
	require.Len(t, handler.permits, ProcessingPermitCount)

	observer.releaseUploads()
	require.Equal(t, http.StatusOK, (<-firstResponse).Code)
	observer.releaseDownloads()
	requireResponsesSuccess(t, holderResponses, 2, "timed out waiting for holder response")
}

func TestPipelineLogsRecordAllApprovedSuccessStages(t *testing.T) {
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo)
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := newTestHandlerWithLogger(t, testHandlerOptions{permits: make(chan struct{}, ProcessingPermitCount), logger: logger})

	uploadBody, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	scrubBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDTwo), ETag: canonicalETagTwo})
	require.NoError(t, err)
	requests := []struct {
		method handlerMethod
		body   string
	}{
		{method: uploadMethod, body: string(uploadBody)},
		{method: dryRunMethod, body: string(dryRunBody)},
		{method: scrubMethod, body: string(scrubBody)},
	}
	recorders := make([]*httptest.ResponseRecorder, 0, len(requests))
	for _, request := range requests {
		recorders = append(recorders, serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: fake, method: request.method, contentType: mediatype.JSON, body: request.body}))
	}

	for _, recorder := range recorders {
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	}
	records := readLogRecords(t, logs.Bytes())
	require.Equal(t, []pipelineLogRecord{
		{Message: "upload-created", Level: "INFO", StorageKeyDigest: generatedStorageKeyDigest, Outcome: "success"},
		{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
		{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"},
		{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "accepted"},
		{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "success"},
		{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "success"},
	}, records)
}

func TestPipelineLogsShortCircuitFailuresAndDescribeCacheHitsTruthfully(t *testing.T) {
	uploadFailureBody, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	sniffRejectionBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	inspectionFailureBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	cleanFailureBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	uploadFailureAfterScrubBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	presignFailureBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	cacheHitBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "0123456789abcdef0123456789abcdef"})
	require.NoError(t, err)

	tests := []struct {
		name        string
		method      handlerMethod
		configure   func(t *testing.T, fake *storage.Fake)
		inspect     inspectPDFOperation
		clean       cleanPDFOperation
		body        string
		wantStatus  int
		wantRecords []pipelineLogRecord
	}{
		{
			name:   "upload failure emits no created success stage",
			method: uploadMethod,
			configure: func(_ *testing.T, fake *storage.Fake) {
				fake.SetFailure(storage.FakePresignSourceUpload, errors.New("upload failure"))
			},
			body:       string(uploadFailureBody),
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:   "sniff rejection records terminal outcomes without later success",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("not-pdf"), ETag: "0123456789abcdef0123456789abcdef"}))
			},
			body:       string(sniffRejectionBody),
			wantStatus: http.StatusUnsupportedMediaType,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "rejected"},
				{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "not-pdf"},
			},
		},
		{
			name:   "inspection failure records dry run failure",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				return nil, errors.New("inspect failed")
			},
			body:       string(inspectionFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "dry-run", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"},
			},
		},
		{
			name:   "clean failure records scrub failure without presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			clean:      func([]byte) ([]byte, error) { return nil, errors.New("clean failed") },
			body:       string(cleanFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"},
			},
		},
		{
			name:   "upload failure after scrub emits no presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakeUploadSanitized, errors.New("upload failed"))
			},
			body:       string(uploadFailureAfterScrubBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"},
			},
		},
		{
			name:   "presign failure emits no presigned success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakePresignSanitizedDownload, errors.New("presign failed"))
			},
			body:       string(presignFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"},
			},
		},
		{
			name:   "cache hit records presign reuse without scrub work",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
			},
			body:       string(cacheHitBody),
			wantStatus: http.StatusOK,
			wantRecords: []pipelineLogRecord{
				{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "cache-hit"},
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			testCase.configure(t, fake)
			var logs bytes.Buffer
			handler := newTestHandlerWithLogger(t, testHandlerOptions{
				permits: make(chan struct{}, ProcessingPermitCount),
				logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
				inspect: testCase.inspect,
				clean:   testCase.clean,
			})

			recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: fake, method: testCase.method, contentType: mediatype.JSON, body: testCase.body})

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			records := readLogRecords(t, logs.Bytes())
			require.Equal(t, testCase.wantRecords, records)
		})
	}
}

func TestPipelineLogsExcludeSeededSensitiveValues(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
		PDFBytes: []byte("%PDF-source-bytes-secret"),
		Metadata: map[string]string{"private-object-marker": "private-metadata-marker"},
		ETag:     "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	}))
	objectStorage := &sensitiveGrantStorage{Storage: fake}
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
			return []scrub.Field{{Name: "title", Preview: "metadata-preview-secret", Action: scrub.ActionRemove}}, nil
		},
	})

	uploadBody, err := json.Marshal(uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	uploadRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: uploadMethod, contentType: mediatype.JSON,
		body: string(uploadBody),
	})
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	dryRunRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: dryRunMethod, contentType: mediatype.JSON,
		body: string(dryRunBody),
	})
	fake.SetFailure(storage.FakeDownloadSource, errors.New("dependency-error-sensitive-marker"))
	dependencyFailureBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDTwo)})
	require.NoError(t, err)
	dependencyFailureRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: dryRunMethod, contentType: mediatype.JSON,
		body: string(dependencyFailureBody),
	})

	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())
	require.Equal(t, http.StatusInternalServerError, dependencyFailureRecorder.Code, dependencyFailureRecorder.Body.String())
	rawLogs := logs.String()
	require.Contains(t, rawLogs, `"storage_key_digest":"`+storageKeyDigestOne+`"`)
	for _, secret := range []string{
		formatStorageKey(generatedFileID),
		formatStorageKey(fileIDOne),
		formatStorageKey(fileIDTwo),
		"source-bytes-secret",
		"private-object-marker",
		"private-metadata-marker",
		"metadata-preview-secret",
		"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"request-name-secret",
		"upload-url-secret",
		"credential-secret",
		"dependency-error-sensitive-marker",
	} {
		require.NotContains(t, rawLogs, secret)
	}
}

type handlerMethod int

const (
	uploadMethod handlerMethod = iota
	dryRunMethod
	scrubMethod
	downloadGrantMethod
	deleteFlowMethod
)

func assertAcceptedResponse(t *testing.T, method handlerMethod, recorder *httptest.ResponseRecorder) {
	t.Helper()

	switch method {
	case uploadMethod:
		var response uploadResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, formatStorageKey(generatedFileID), response.StorageKey)
		require.NotEmpty(t, response.UploadURL)
	case dryRunMethod:
		var response dryRunResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, canonicalETagOne, response.ETag)
		require.Empty(t, response.Fields)
	case scrubMethod:
		var response scrubResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "done", response.Status)
		require.NotEmpty(t, response.Result.DownloadURL)
	case downloadGrantMethod:
		var response downloadGrantResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.NotEmpty(t, response.DownloadURL)
		require.NotEmpty(t, response.ExpiresAt)
	case deleteFlowMethod:
		var response deleteResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "deleted", response.Status)
	default:
		t.Fatalf("unknown handler method %d", method)
	}
}

func newTestHandler(
	t *testing.T,
	inspect inspectPDFOperation,
	clean cleanPDFOperation,
	entropy entropyOperation,
) *Handler {
	t.Helper()
	return newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		inspect: inspect,
		clean:   clean,
		entropy: entropy,
	})
}

type testHandlerOptions struct {
	permits         chan struct{}
	logger          *slog.Logger
	inspect         inspectPDFOperation
	clean           cleanPDFOperation
	entropy         entropyOperation
	admissionJitter admissionJitterOperation
	now             clockOperation
}

func newTestHandlerWithLogger(t *testing.T, options testHandlerOptions) *Handler {
	t.Helper()
	if options.inspect == nil {
		options.inspect = func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) { return nil, nil }
	}
	if options.clean == nil {
		options.clean = func(input []byte) ([]byte, error) { return bytes.Clone(input), nil }
	}
	if options.entropy == nil {
		options.entropy = func(destination []byte) (int, error) {
			for index := range destination {
				destination[index] = byte(index)
			}
			return len(destination), nil
		}
	}
	if options.admissionJitter == nil {
		options.admissionJitter = func() (int, error) { return 0, nil }
	}
	if options.now == nil {
		options.now = time.Now
	}
	handler := New(options.logger, options.permits)
	handler.inspect = options.inspect
	handler.clean = options.clean
	handler.entropy = options.entropy
	handler.admissionJitter = options.admissionJitter
	handler.now = options.now
	return handler
}

type handlerRequest struct {
	ctx           context.Context
	handler       *Handler
	objectStorage storage.Storage
	method        handlerMethod
	contentType   string
	body          string
}

func serveRequest(t *testing.T, input handlerRequest) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(input.body)).WithContext(input.ctx)
	if input.contentType != "" {
		request.Header.Set(header.ContentType, input.contentType)
	}
	recorder := httptest.NewRecorder()

	var endpoint http.HandlerFunc
	switch input.method {
	case uploadMethod:
		endpoint = input.handler.Upload
	case dryRunMethod:
		endpoint = input.handler.DryRun
	case scrubMethod:
		endpoint = input.handler.Scrub
	case downloadGrantMethod:
		endpoint = input.handler.DownloadGrant
	case deleteFlowMethod:
		endpoint = input.handler.DeleteFlow
	default:
		t.Fatalf("unknown handler method %d", input.method)
		return recorder
	}
	bindings.Inject(bindings.Bindings{Storage: input.objectStorage})(endpoint).ServeHTTP(recorder, request)
	return recorder
}

func errorMessage(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body.Error
}

func callOperations(calls []storage.FakeCall) []storage.FakeOperation {
	operations := make([]storage.FakeOperation, 0, len(calls))
	for _, call := range calls {
		operations = append(operations, call.Operation)
	}
	return operations
}

func callOperationsFor(calls []storage.FakeCall, fileID string) []storage.FakeOperation {
	var operations []storage.FakeOperation
	for _, call := range calls {
		if call.FileID == fileID {
			operations = append(operations, call.Operation)
		}
	}
	return operations
}

func seedCandidateSources(t *testing.T, fake *storage.Fake, fileIDs ...string) {
	t.Helper()
	for _, fileID := range fileIDs {
		require.NoError(t, fake.SetSource(fileID, storage.SourceObject{
			PDFBytes: []byte("%PDF-" + fileID),
			ETag:     canonicalETagsByFileID[fileID],
		}))
	}
}

var canonicalETagsByFileID = map[string]string{
	fileIDOne:   canonicalETagOne,
	fileIDTwo:   canonicalETagTwo,
	fileIDThree: canonicalETagThree,
}

type sensitiveGrantStorage struct {
	storage.Storage
}

func (objectStorage *sensitiveGrantStorage) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (storage.PresignedRequest, error) {
	grant, err := objectStorage.Storage.PresignSourceUpload(ctx, fileID, sizeBytes, expiry)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	grant.URL = "https://upload-url-secret.invalid/source?credential=credential-secret"
	return grant, nil
}

type pipelineLogRecord struct {
	Message              string `json:"msg"`
	Level                string `json:"level"`
	StorageKeyDigest     string `json:"storage_key_digest"`
	Outcome              string `json:"outcome"`
	DurationMilliseconds *int64 `json:"duration_ms"`
}

func readLogRecords(t *testing.T, data []byte) []pipelineLogRecord {
	t.Helper()
	var records []pipelineLogRecord
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record pipelineLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		require.NotNil(t, record.DurationMilliseconds)
		require.GreaterOrEqual(t, *record.DurationMilliseconds, int64(0))
		record.DurationMilliseconds = nil
		records = append(records, record)
	}
	require.NoError(t, scanner.Err())
	return records
}
