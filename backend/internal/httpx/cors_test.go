package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
)

func expectedAllowedMethodsHeader() string {
	return strings.Join([]string{http.MethodGet, http.MethodPost, http.MethodOptions}, ", ")
}

func requireCORSHeaders(t *testing.T, responseHeaders http.Header) {
	t.Helper()

	require.Equal(t, "*", responseHeaders.Get(header.AccessControlAllowOrigin))
	require.Equal(t, expectedAllowedMethodsHeader(), responseHeaders.Get(header.AccessControlAllowMethods))
	require.Equal(t, header.ContentType, responseHeaders.Get(header.AccessControlAllowHeaders))
}

func TestCORSHandlesPreflightWithoutDelegating(t *testing.T) {
	t.Parallel()

	delegatedCalls := 0
	handler := httpx.CORS(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		delegatedCalls++
	}))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodOptions, "/api/scrub", nil)

	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	requireCORSHeaders(t, recorder.Header())
	require.Zero(t, delegatedCalls)
}

func TestCORSAddsHeadersAndDelegatesNonPreflightRequests(t *testing.T) {
	t.Parallel()

	delegatedCalls := 0
	handler := httpx.CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		delegatedCalls++
		require.Equal(t, http.MethodPost, r.Method)
		w.WriteHeader(http.StatusAccepted)
	}))

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/scrub", nil)

	handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusAccepted, recorder.Code)
	requireCORSHeaders(t, recorder.Header())
	require.Equal(t, 1, delegatedCalls)
}
