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

func TestInjectProvidesExactBindingsToNextHandlerAndPreservesContextValues(t *testing.T) {
	t.Parallel()

	type contextKey struct{}
	key := contextKey{}
	const wantValue = "request-id"
	eventsCalled := false
	wantBindings := bindings.Bindings{
		Env:     config.Config{Port: 3000},
		Storage: storage.NewFake(),
		Events: func(ctx context.Context, event string) {
			eventsCalled = true
			assert.Equal(t, wantValue, ctx.Value(key))
			assert.Equal(t, "file scrubbed", event)
		},
	}

	request := httptest.NewRequest(http.MethodGet, "/", http.NoBody)
	request = request.WithContext(context.WithValue(request.Context(), key, wantValue))

	called := false
	handler := bindings.Inject(wantBindings)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		called = true
		assert.Equal(t, wantValue, r.Context().Value(key))

		gotBindings, ok := bindings.FromContext(r.Context())
		assert.True(t, ok)
		assert.Equal(t, wantBindings.Env, gotBindings.Env)
		assert.Same(t, wantBindings.Storage, gotBindings.Storage)
		assert.Equal(t, wantBindings.PostHogDistinctID, gotBindings.PostHogDistinctID)
		assert.Equal(t, wantBindings.PostHogSessionID, gotBindings.PostHogSessionID)
		assert.NotNil(t, gotBindings.Events)
		gotBindings.Events(r.Context(), "file scrubbed")
	}))

	handler.ServeHTTP(httptest.NewRecorder(), request)

	require.True(t, called)
	require.True(t, eventsCalled)
}

func TestFromContextReportsMissingBindings(t *testing.T) {
	t.Parallel()

	_, ok := bindings.FromContext(httptest.NewRequest(http.MethodGet, "/", http.NoBody).Context())

	require.False(t, ok)
}
