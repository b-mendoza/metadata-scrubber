package bindings_test

import (
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

func TestFromContextReportsMissingBindings(t *testing.T) {
	t.Parallel()

	_, ok := bindings.FromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context())

	require.False(t, ok)
}
