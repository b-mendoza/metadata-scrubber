package main

import (
	"net/http"
	"testing"
)

func TestNewServerConfiguresAddressAndHandler(t *testing.T) {
	t.Parallel()

	server := newServer(":0")

	if server.Addr != ":0" {
		t.Fatalf("server.Addr = %q, want %q", server.Addr, ":0")
	}
	if server.Handler == nil {
		t.Fatal("server.Handler is nil")
	}

	recorder := &statusRecorder{}
	request, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	if err != nil {
		t.Fatal(err)
	}
	server.Handler.ServeHTTP(recorder, request)

	if recorder.status != http.StatusOK {
		t.Fatalf("reachability status = %d, want %d", recorder.status, http.StatusOK)
	}
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
