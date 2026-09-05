package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

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
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(dryRunRequest{StorageKey: invalidKey})
			require.NoError(t, err)
			recorder := serveRequest(t, handlerRequest{ctx: context.Background(), contentType: mediatype.JSON, handler: handler, objectStorage: fake, method: dryRunMethod, body: string(body)})
			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
	}

	invalidETags := []struct {
		name  string
		value string
	}{
		{name: "empty", value: ""},
		{name: "weak", value: `W/"` + canonicalETagOne + `"`},
		{name: "quoted", value: `"` + canonicalETagOne + `"`},
		{name: "leading quote", value: `"` + canonicalETagOne},
		{name: "trailing quote", value: canonicalETagOne + `"`},
		{name: "embedded quote", value: "0123456789abcde\"0123456789abcdef"},
		{name: "single quoted", value: `'` + canonicalETagOne + `'`},
		{name: "line feed", value: "0123456789abcde\n0123456789abcdef"},
		{name: "carriage return", value: "0123456789abcde\r0123456789abcdef"},
		{name: "horizontal tab", value: "0123456789abcde\t0123456789abcdef"},
		{name: "null", value: "0123456789abcde\x000123456789abcdef"},
		{name: "too short", value: "0123456789abcdef0123456789abcde"},
		{name: "too long", value: canonicalETagOne + "0"},
		{name: "upper case", value: strings.ToUpper(canonicalETagOne)},
		{name: "non hex", value: "0123456789abcdef0123456789abcdeg"},
		{name: "multipart", value: canonicalETagOne + "-2"},
		{name: "leading space", value: " " + canonicalETagOne},
		{name: "trailing space", value: canonicalETagOne + " "},
		{name: "opaque", value: "revision-1"},
	}
	for _, invalidETag := range invalidETags {
		t.Run("scrub ETag "+invalidETag.name, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(scrubRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       invalidETag.value,
			})
			require.NoError(t, err)

			recorder := serveRequest(t, handlerRequest{
				ctx: context.Background(), contentType: mediatype.JSON,
				handler: handler, objectStorage: fake, method: scrubMethod, body: string(body),
			})

			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
		t.Run("download grant ETag "+invalidETag.name, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(downloadGrantRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       invalidETag.value,
			})
			require.NoError(t, err)

			recorder := serveRequest(t, handlerRequest{
				ctx: context.Background(), contentType: mediatype.JSON,
				handler: handler, objectStorage: fake, method: downloadGrantMethod, body: string(body),
			})

			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
	}
}
