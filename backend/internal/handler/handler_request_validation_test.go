package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestPublicStorageKeysAndETagsAreValidatedBeforeStorage(t *testing.T) {
	invalidKeys := []string{
		"", fileIDOne, "downloads/" + fileIDOne, "uploads/" + strings.ToUpper(generatedFileID),
		"uploads/" + fileIDOne + "/extra", " uploads/" + fileIDOne, "uploads/../" + fileIDOne,
	}
	for _, invalidKey := range invalidKeys {
		t.Run("key "+invalidKey, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t)
			body, err := json.Marshal(dryRunRequest{StorageKey: storageKey(invalidKey)})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)
			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
	}

	t.Run("scrub key", func(t *testing.T) {
		fake := storage.NewFake()
		handler := newTestHandler(t)
		body, err := json.Marshal(scrubRequest{StorageKey: fileIDOne, ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
		require.Equal(t, http.StatusBadRequest, recorder.Code)
		require.Empty(t, fake.Calls())
	})
	t.Run("scrub ETag", func(t *testing.T) {
		fake := storage.NewFake()
		handler := newTestHandler(t)
		body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: "revision-1"})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)
		require.Equal(t, http.StatusBadRequest, recorder.Code)
		require.Empty(t, fake.Calls())
	})
	t.Run("download-grant key", func(t *testing.T) {
		fake := storage.NewFake()
		handler := newTestHandler(t)
		body, err := json.Marshal(downloadGrantRequest{StorageKey: fileIDOne, ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/download-grant", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DownloadGrant)).ServeHTTP(recorder, request)
		require.Equal(t, http.StatusBadRequest, recorder.Code)
		require.Empty(t, fake.Calls())
	})
	t.Run("download-grant ETag", func(t *testing.T) {
		fake := storage.NewFake()
		handler := newTestHandler(t)
		body, err := json.Marshal(downloadGrantRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: "revision-1"})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/download-grant", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DownloadGrant)).ServeHTTP(recorder, request)
		require.Equal(t, http.StatusBadRequest, recorder.Code)
		require.Empty(t, fake.Calls())
	})
}
