package handler

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestUploadValidatesIntakeAndCreatesOpaqueGrant(t *testing.T) {
	tests := []struct {
		name        string
		fileName    string
		size        int64
		wantStatus  int
		wantMessage string
	}{
		{name: "ordinary name", fileName: "report.pdf", size: 1, wantStatus: http.StatusOK},
		{name: "unicode non PDF display name", fileName: "résumé.txt", size: storage.MaxSourceObjectBytes, wantStatus: http.StatusOK},
		{name: "blank name", fileName: " \t", size: 1, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "path separator", fileName: "folder/report.pdf", size: 1, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "control character", fileName: "bad\nname.pdf", size: 1, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "too long", fileName: strings.Repeat("x", maxFileNameBytes+1), size: 1, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "zero bytes", fileName: "report.pdf", size: 0, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "negative bytes", fileName: "report.pdf", size: -1, wantStatus: http.StatusBadRequest, wantMessage: "invalid upload request"},
		{name: "over decimal limit", fileName: "report.pdf", size: storage.MaxSourceObjectBytes + 1, wantStatus: http.StatusRequestEntityTooLarge, wantMessage: "source file exceeds 10 MiB limit"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(uploadRequest{FileName: testCase.fileName, FileSizeBytes: testCase.size})
			require.NoError(t, err)
			recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: fake, method: uploadMethod, contentType: mediatype.JSON + "; charset=utf-8", body: string(body)})

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			if testCase.wantStatus != http.StatusOK {
				require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
				require.Empty(t, fake.Calls())
				return
			}

			var response map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			require.ElementsMatch(t, []string{"storageKey", "uploadUrl"}, slices.Collect(maps.Keys(response)))
			var storageKey, uploadURL string
			require.NoError(t, json.Unmarshal(response["storageKey"], &storageKey))
			require.NoError(t, json.Unmarshal(response["uploadUrl"], &uploadURL))
			fileID, ok := parseStorageKey(storageKey)
			require.True(t, ok)
			require.Equal(t, generatedFileID, fileID)
			require.NotEmpty(t, uploadURL)

			calls := fake.Calls()
			require.Len(t, calls, 1)
			require.Equal(t, storage.FakePresignSourceUpload, calls[0].Operation)
			require.Equal(t, generatedFileID, calls[0].FileID)
			require.Equal(t, testCase.size, calls[0].SizeBytes)
			require.Equal(t, uploadGrantExpiry, calls[0].Expiry)
		})
	}
}

func TestUploadRejectsInvalidUTF8FilenameBeforeStorage(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body := `{"fileName":"` + string([]byte{0xff}) + `","fileSizeBytes":1}`

	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: fake, method: uploadMethod, contentType: mediatype.JSON, body: body})

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Empty(t, fake.Calls())
}

func TestUploadStopsBeforeStorageWhenEntropyFails(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, func([]byte) (int, error) {
		return 0, errors.New("entropy-secret")
	})
	body, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: uploadMethod, body: string(body)})

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "could not create upload", errorMessage(t, recorder))
	require.NotContains(t, recorder.Body.String(), "entropy-secret")
	require.Empty(t, fake.Calls())
}

func TestUploadPresignFailureIsSanitized(t *testing.T) {
	fake := storage.NewFake()
	fake.SetFailure(storage.FakePresignSourceUpload, errors.New("provider-secret"))
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: uploadMethod, body: string(body)})

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "could not create upload", errorMessage(t, recorder))
	require.NotContains(t, recorder.Body.String(), "provider-secret")
	require.Equal(t, []storage.FakeOperation{storage.FakePresignSourceUpload}, callOperations(fake.Calls()))
}
