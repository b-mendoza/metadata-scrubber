package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestUploadEvents(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		failure      error
		writeFailure bool
		wantStatus   int
		wantEvents   []string
	}{
		{name: "success", wantStatus: http.StatusOK, wantEvents: []string{"upload grant created"}},
		{name: "dependency failure", failure: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "response write failure", writeFailure: true, wantStatus: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler := newTestHandler(t)
			fake := storage.NewFake()
			fake.SetFailure(storage.FakePresignSourceUpload, testCase.failure)
			body, err := json.Marshal(uploadRequest{FileName: "private-file.pdf", FileSizeBytes: 1})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/uploads", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", "upload-browser-id")
			response := httptest.NewRecorder()
			var writer http.ResponseWriter = response
			if testCase.writeFailure {
				writer = &failingResponseWriter{ResponseRecorder: response, err: errors.New("response write failure")}
			}
			var events []string
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: func(ctx context.Context, event string) {
				requestBindings, ok := bindings.FromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "upload-browser-id", requestBindings.PostHogDistinctID)
				events = append(events, event)
			}})(http.HandlerFunc(handler.Upload))

			bound.ServeHTTP(writer, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.Equal(t, testCase.wantEvents, events)
		})
	}
}

func TestDryRunEvents(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		failure      error
		writeFailure bool
		wantStatus   int
		wantEvents   []string
	}{
		{name: "success", wantStatus: http.StatusOK, wantEvents: []string{"dry run completed"}},
		{name: "dependency failure", failure: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "response write failure", writeFailure: true, wantStatus: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler := newTestHandler(t)
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: canonicalETagOne}))
			fake.SetFailure(storage.FakeDownloadSource, testCase.failure)
			body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", "dry-run-browser-id")
			response := httptest.NewRecorder()
			var writer http.ResponseWriter = response
			if testCase.writeFailure {
				writer = &failingResponseWriter{ResponseRecorder: response, err: errors.New("response write failure")}
			}
			var events []string
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: func(ctx context.Context, event string) {
				requestBindings, ok := bindings.FromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "dry-run-browser-id", requestBindings.PostHogDistinctID)
				events = append(events, event)
			}})(http.HandlerFunc(handler.DryRun))

			bound.ServeHTTP(writer, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.Equal(t, testCase.wantEvents, events)
		})
	}
}

func TestScrubEvents(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		failure      error
		writeFailure bool
		cacheHit     bool
		wantStatus   int
		wantEvents   []string
	}{
		{name: "success", wantStatus: http.StatusOK, wantEvents: []string{"file scrubbed"}},
		{name: "dependency failure", failure: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "response write failure", writeFailure: true, wantStatus: http.StatusOK},
		{name: "cache hit", cacheHit: true, wantStatus: http.StatusOK, wantEvents: []string{"file scrubbed"}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler := newTestHandler(t)
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: canonicalETagOne}))
			if testCase.cacheHit {
				require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("cleaned")))
			}
			fake.SetFailure(storage.FakePresignSanitizedDownload, testCase.failure)
			body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", "scrub-browser-id")
			response := httptest.NewRecorder()
			var writer http.ResponseWriter = response
			if testCase.writeFailure {
				writer = &failingResponseWriter{ResponseRecorder: response, err: errors.New("response write failure")}
			}
			var events []string
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: func(ctx context.Context, event string) {
				requestBindings, ok := bindings.FromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "scrub-browser-id", requestBindings.PostHogDistinctID)
				events = append(events, event)
			}})(http.HandlerFunc(handler.Scrub))

			bound.ServeHTTP(writer, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.Equal(t, testCase.wantEvents, events)
		})
	}
}

func TestDownloadGrantEvents(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		failure      error
		writeFailure bool
		wantStatus   int
		wantEvents   []string
	}{
		{name: "success", wantStatus: http.StatusOK, wantEvents: []string{"download grant refreshed"}},
		{name: "dependency failure", failure: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "response write failure", writeFailure: true, wantStatus: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler := newTestHandler(t)
			fake := storage.NewFake()
			require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("cleaned")))
			fake.SetFailure(storage.FakePresignSanitizedDownload, testCase.failure)
			body, err := json.Marshal(downloadGrantRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/download-grant", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", "download-browser-id")
			response := httptest.NewRecorder()
			var writer http.ResponseWriter = response
			if testCase.writeFailure {
				writer = &failingResponseWriter{ResponseRecorder: response, err: errors.New("response write failure")}
			}
			var events []string
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: func(ctx context.Context, event string) {
				requestBindings, ok := bindings.FromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "download-browser-id", requestBindings.PostHogDistinctID)
				events = append(events, event)
			}})(http.HandlerFunc(handler.DownloadGrant))

			bound.ServeHTTP(writer, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.Equal(t, testCase.wantEvents, events)
		})
	}
}

func TestDeleteFlowEvents(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		failure      error
		writeFailure bool
		wantStatus   int
		wantEvents   []string
	}{
		{name: "success", wantStatus: http.StatusOK, wantEvents: []string{"file deleted"}},
		{name: "dependency failure", failure: errors.New("storage failure"), wantStatus: http.StatusInternalServerError},
		{name: "response write failure", writeFailure: true, wantStatus: http.StatusOK},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			handler := newTestHandler(t)
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: canonicalETagOne}))
			fake.SetFailure(storage.FakeDeleteFlow, testCase.failure)
			body, err := json.Marshal(deleteRequest{StorageKey: storageKeyPrefix + fileIDOne})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", "delete-browser-id")
			response := httptest.NewRecorder()
			var writer http.ResponseWriter = response
			if testCase.writeFailure {
				writer = &failingResponseWriter{ResponseRecorder: response, err: errors.New("response write failure")}
			}
			var events []string
			bound := bindings.Inject(bindings.Bindings{Storage: fake, Events: func(ctx context.Context, event string) {
				requestBindings, ok := bindings.FromContext(ctx)
				require.True(t, ok)
				require.Equal(t, "delete-browser-id", requestBindings.PostHogDistinctID)
				events = append(events, event)
			}})(http.HandlerFunc(handler.DeleteFlow))

			bound.ServeHTTP(writer, request)

			require.Equal(t, testCase.wantStatus, response.Code, response.Body.String())
			require.Equal(t, testCase.wantEvents, events)
		})
	}
}
