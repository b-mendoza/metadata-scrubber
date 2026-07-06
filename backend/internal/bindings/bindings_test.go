package bindings_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
)

func TestInjectMakesBindingsAvailableToHandler(t *testing.T) {
	t.Parallel()

	want := bindings.Bindings{Env: config.Config{Port: 3000}}

	var got bindings.Bindings
	var ok bool

	handler := bindings.Inject(want)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got, ok = bindings.FromContext(r.Context())
	}))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	require.True(t, ok)
	require.Equal(t, want, got)
}

func TestInjectPreservesRequestContextValues(t *testing.T) {
	t.Parallel()

	type contextKey struct{}
	key := contextKey{}
	const wantValue = "request-id"
	wantBindings := bindings.Bindings{Env: config.Config{Port: 3000}}

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request = request.WithContext(context.WithValue(request.Context(), key, wantValue))

	called := false
	handler := bindings.Inject(wantBindings)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		called = true
		require.Equal(t, wantValue, r.Context().Value(key))

		gotBindings, ok := bindings.FromContext(r.Context())
		require.True(t, ok)
		require.Equal(t, wantBindings, gotBindings)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), request)

	require.True(t, called)
}

func TestFromContextReportsMissingBindings(t *testing.T) {
	t.Parallel()

	_, ok := bindings.FromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context())

	require.False(t, ok)
}
