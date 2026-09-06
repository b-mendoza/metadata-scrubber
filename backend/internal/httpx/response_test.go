package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

func TestWriteErrorWritesJSONErrorResponse(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()

	err := httpx.WriteError(recorder, http.StatusBadRequest, "request failed")
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	require.JSONEq(t, `{"error":"request failed"}`, recorder.Body.String())
}
