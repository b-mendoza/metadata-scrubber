package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
)

func TestCORSHandlesPreflightWithoutDelegating(t *testing.T) {
	t.Parallel()

	delegated := false
	handler := httpx.CORS(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		delegated = true
	}))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/scrub", nil)

	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Equal(t, "GET, POST, OPTIONS", recorder.Header().Get(header.AccessControlAllowMethods))
	require.Equal(t, header.ContentType, recorder.Header().Get(header.AccessControlAllowHeaders))
	require.False(t, delegated)
}

func TestCORSAddsHeadersAndDelegatesNonPreflightRequests(t *testing.T) {
	t.Parallel()

	handler := httpx.CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.WriteHeader(http.StatusAccepted)
	}))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/scrub", nil)

	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusAccepted, recorder.Code)
	require.Equal(t, "*", recorder.Header().Get(header.AccessControlAllowOrigin))
	require.Equal(t, "GET, POST, OPTIONS", recorder.Header().Get(header.AccessControlAllowMethods))
	require.Equal(t, header.ContentType, recorder.Header().Get(header.AccessControlAllowHeaders))
}
