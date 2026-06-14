package main

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
)

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newServer(":0", bindings.Bindings{Env: config.Config{Port: 8080}})

	require.Equal(t, ":0", server.Addr)
	require.NotNil(t, server.Handler)

	recorder := &statusRecorder{}
	request, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	require.NoError(t, err)

	server.Handler.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.status)
}

type statusRecorder struct {
	header http.Header
	status int
}

func (r *statusRecorder) Header() http.Header {
	if r.header == nil {
		r.header = make(http.Header)
	}
	return r.header
}

func (r *statusRecorder) Write(bytes []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	return len(bytes), nil
}

func (r *statusRecorder) WriteHeader(statusCode int) {
	r.status = statusCode
}
