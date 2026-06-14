package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
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
		t.Fatalf("health status = %d, want %d", recorder.status, http.StatusOK)
	}
}

func TestRunHealthCheckAcceptsHealthyLocalServer(t *testing.T) {
	t.Parallel()

	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer testServer.Close()

	parsedURL, err := url.Parse(testServer.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, port, err := net.SplitHostPort(parsedURL.Host)
	if err != nil {
		t.Fatal(err)
	}

	if err := runHealthCheck(port); err != nil {
		t.Fatalf("runHealthCheck returned error: %v", err)
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
