package bindings_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
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
	request.Header.Set("X-POSTHOG-DISTINCT-ID", "anonymous-browser-id")
	request.Header.Set("X-POSTHOG-SESSION-ID", "anonymous-session-id")
	request = request.WithContext(context.WithValue(request.Context(), key, wantValue))

	called := false
	handler := bindings.Inject(wantBindings)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		called = true
		assert.Equal(t, wantValue, r.Context().Value(key))

		gotBindings, ok := bindings.FromContext(r.Context())
		assert.True(t, ok)
		assert.Equal(t, wantBindings.Env, gotBindings.Env)
		assert.Same(t, wantBindings.Storage, gotBindings.Storage)
		assert.Equal(t, "anonymous-browser-id", gotBindings.PostHogDistinctID)
		assert.Equal(t, "anonymous-session-id", gotBindings.PostHogSessionID)
		assert.NotNil(t, gotBindings.Events)
		gotBindings.Events(r.Context(), "file scrubbed")
	}))

	handler.ServeHTTP(httptest.NewRecorder(), request)

	require.True(t, called)
	require.True(t, eventsCalled)
}

func TestInjectValidatesAnalyticsHeadersWithoutRejectingRequests(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name  string
		value string
		want  string
	}{
		{name: "first printable character", value: " ", want: " "},
		{name: "last printable character", value: "~", want: "~"},
		{name: "maximum length", value: strings.Repeat("a", 200), want: strings.Repeat("a", 200)},
		{name: "too long", value: strings.Repeat("a", 201)},
		{name: "control character", value: "id\x1fvalue"},
		{name: "delete character", value: "id\x7f"},
		{name: "non ASCII", value: "id-é"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequest(http.MethodPost, "/api/uploads", http.NoBody)
			request.Header.Set("X-POSTHOG-DISTINCT-ID", testCase.value)
			request.Header.Set("X-POSTHOG-SESSION-ID", testCase.value)
			handler := bindings.Inject(bindings.Bindings{})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				got, ok := bindings.FromContext(r.Context())
				assert.True(t, ok)
				assert.NotNil(t, got.Events)
				got.Events(r.Context(), "file scrubbed")
				assert.Equal(t, testCase.want, got.PostHogDistinctID)
				assert.Equal(t, testCase.want, got.PostHogSessionID)
				w.WriteHeader(http.StatusCreated)
			}))
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			assert.Equal(t, http.StatusCreated, response.Code)
		})
	}
}
