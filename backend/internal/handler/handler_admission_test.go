package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
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
