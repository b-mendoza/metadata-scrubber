package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/posthog/posthog-go"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
	"metadata-scrubber/internal/telemetry"
)

func TestWorkflowEventsCaptureOnlySuccessfulAnonymousOutcomes(t *testing.T) {
	t.Parallel()

	uploadBody, err := json.Marshal(uploadRequest{FileName: "private-file.pdf", FileSizeBytes: 64})
	require.NoError(t, err)
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: "uploads/" + fileIDOne})
	require.NoError(t, err)
	scrubBody, err := json.Marshal(scrubRequest{StorageKey: "uploads/" + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	downloadBody, err := json.Marshal(downloadGrantRequest{StorageKey: "uploads/" + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	deleteBody, err := json.Marshal(deleteRequest{StorageKey: "uploads/" + fileIDOne})
	require.NoError(t, err)

	for _, testCase := range []struct {
		name       string
		body       []byte
		serve      func(*Handler, http.ResponseWriter, *http.Request)
		failure    storage.FakeOperation
		distinctID string
		failureErr error
		sanitized  bool
		wantStatus int
		wantEvents []posthog.Capture
	}{
		{name: "upload/success", body: uploadBody, serve: (*Handler).Upload, failure: storage.FakePresignSourceUpload, distinctID: "browser-id", wantStatus: http.StatusOK, wantEvents: []posthog.Capture{{Event: "upload grant created", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}}}},
		{name: "upload/absent distinct ID", body: uploadBody, serve: (*Handler).Upload, failure: storage.FakePresignSourceUpload, wantStatus: http.StatusOK},
		{name: "upload/failure", body: uploadBody, serve: (*Handler).Upload, failure: storage.FakePresignSourceUpload, distinctID: "browser-id", failureErr: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "dry run/success", body: dryRunBody, serve: (*Handler).DryRun, failure: storage.FakeDownloadSource, distinctID: "browser-id", wantStatus: http.StatusOK, wantEvents: []posthog.Capture{{Event: "dry run completed", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}}}},
		{name: "dry run/absent distinct ID", body: dryRunBody, serve: (*Handler).DryRun, failure: storage.FakeDownloadSource, wantStatus: http.StatusOK},
		{name: "dry run/failure", body: dryRunBody, serve: (*Handler).DryRun, failure: storage.FakeDownloadSource, distinctID: "browser-id", failureErr: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "scrub/success", body: scrubBody, serve: (*Handler).Scrub, failure: storage.FakePresignSanitizedDownload, distinctID: "browser-id", wantStatus: http.StatusOK, wantEvents: []posthog.Capture{{Event: "file scrubbed", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}}}},
		{name: "scrub/absent distinct ID", body: scrubBody, serve: (*Handler).Scrub, failure: storage.FakePresignSanitizedDownload, wantStatus: http.StatusOK},
		{name: "scrub/failure", body: scrubBody, serve: (*Handler).Scrub, failure: storage.FakePresignSanitizedDownload, distinctID: "browser-id", failureErr: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "download/success", body: downloadBody, serve: (*Handler).DownloadGrant, failure: storage.FakePresignSanitizedDownload, distinctID: "browser-id", sanitized: true, wantStatus: http.StatusOK, wantEvents: []posthog.Capture{{Event: "download grant refreshed", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}}}},
		{name: "download/absent distinct ID", body: downloadBody, serve: (*Handler).DownloadGrant, failure: storage.FakePresignSanitizedDownload, sanitized: true, wantStatus: http.StatusOK},
		{name: "download/failure", body: downloadBody, serve: (*Handler).DownloadGrant, failure: storage.FakePresignSanitizedDownload, distinctID: "browser-id", failureErr: errors.New("storage failure"), sanitized: true, wantStatus: http.StatusInternalServerError},
		{name: "delete/success", body: deleteBody, serve: (*Handler).DeleteFlow, failure: storage.FakeDeleteFlow, distinctID: "browser-id", wantStatus: http.StatusOK, wantEvents: []posthog.Capture{{Event: "file deleted", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false, "$session_id": "browser-session"}}}},
		{name: "delete/absent distinct ID", body: deleteBody, serve: (*Handler).DeleteFlow, failure: storage.FakeDeleteFlow, wantStatus: http.StatusOK},
		{name: "delete/failure", body: deleteBody, serve: (*Handler).DeleteFlow, failure: storage.FakeDeleteFlow, distinctID: "browser-id", failureErr: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler, fake, events := newAnalyticsTest(t, testCase.sanitized)
			fake.SetFailure(testCase.failure, testCase.failureErr)
			request := httptest.NewRequest(http.MethodPost, "/api/files/workflow", bytes.NewReader(testCase.body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", testCase.distinctID)
			request.Header.Set("X-POSTHOG-SESSION-ID", "browser-session")
			response := httptest.NewRecorder()
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: telemetry.NewRecorder(events, slog.New(slog.DiscardHandler))})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				testCase.serve(handler, w, r)
			}))

			bound.ServeHTTP(response, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.ElementsMatch(t, testCase.wantEvents, events.captured)
		})
	}
}

func newAnalyticsTest(t *testing.T, sanitized bool) (*Handler, *storage.Fake, *workflowEvents) {
	t.Helper()
	handler := newTestHandler(t)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: canonicalETagOne}))
	if sanitized {
		require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("cleaned")))
	}
	return handler, fake, &workflowEvents{}
}

func TestScrubCacheHitCapturesOneCompletedOutcome(t *testing.T) {
	t.Parallel()
	handler, fake, events := newAnalyticsTest(t, true)
	body, err := json.Marshal(scrubRequest{StorageKey: "uploads/" + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "browser-id")
	response := httptest.NewRecorder()
	bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: telemetry.NewRecorder(events, slog.New(slog.DiscardHandler))})(http.HandlerFunc(handler.Scrub))

	bound.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, []posthog.Capture{{Event: "file scrubbed", DistinctId: "browser-id", Properties: posthog.Properties{"$process_person_profile": false}}}, events.captured)
}

func TestScrubUploadFailureDoesNotCaptureCompletedOutcome(t *testing.T) {
	t.Parallel()
	handler, fake, events := newAnalyticsTest(t, false)
	fake.SetFailure(storage.FakeUploadSanitized, errors.New("upload failure"))
	body, err := json.Marshal(scrubRequest{StorageKey: "uploads/" + fileIDOne, ETag: canonicalETagOne})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "browser-id")
	response := httptest.NewRecorder()
	bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: telemetry.NewRecorder(events, slog.New(slog.DiscardHandler))})(http.HandlerFunc(handler.Scrub))

	bound.ServeHTTP(response, request)

	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Empty(t, events.captured)
}

func TestUploadResponseWriteFailureDoesNotCaptureCompletedOutcome(t *testing.T) {
	t.Parallel()
	handler, fake, events := newAnalyticsTest(t, false)
	body, err := json.Marshal(uploadRequest{FileName: "private-file.pdf", FileSizeBytes: 64})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "/api/uploads", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "browser-id")
	writer := &failingResponseWriter{ResponseRecorder: httptest.NewRecorder(), err: errors.New("response write failure")}
	bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: telemetry.NewRecorder(events, slog.New(slog.DiscardHandler))})(http.HandlerFunc(handler.Upload))

	bound.ServeHTTP(writer, request)

	require.Empty(t, events.captured)
}

type workflowEvents struct {
	captured []posthog.Capture
}

func (events *workflowEvents) Enqueue(message posthog.Message) error {
	event, ok := message.(posthog.Capture)
	if !ok {
		return errors.New("expected a capture event")
	}
	events.captured = append(events.captured, event)
	return nil
}
