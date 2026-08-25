package bindings_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/storage"
)

func testBindings() bindings.Bindings {
	return bindings.Bindings{
		Env:     config.Config{Port: 3000},
		Storage: storage.NewFake(),
	}
}

func TestInjectPreservesRequestContextValues(t *testing.T) {
	t.Parallel()

	type contextKey struct{}
	key := contextKey{}
	const wantValue = "request-id"
	wantBindings := testBindings()

	request := httptest.NewRequest(http.MethodGet, "/", http.NoBody)
	request = request.WithContext(context.WithValue(request.Context(), key, wantValue))

	called := false
	handler := bindings.Inject(wantBindings)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		called = true
		assert.Equal(t, wantValue, r.Context().Value(key))

		gotBindings, ok := bindings.FromContext(r.Context())
		assert.True(t, ok)
		assert.Equal(t, wantBindings, gotBindings)
	}))

	handler.ServeHTTP(httptest.NewRecorder(), request)

	require.True(t, called)
}

func TestFromContextReportsMissingBindings(t *testing.T) {
	t.Parallel()

	_, ok := bindings.FromContext(httptest.NewRequest(http.MethodGet, "/", http.NoBody).Context())

	require.False(t, ok)
}
