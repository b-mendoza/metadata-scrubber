package bindings_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"metadata-scrubber/internal/bindings"
)

func TestInjectValidatesAnalyticsHeadersWithoutRejectingRequests(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name  string
		value string
		want  string
	}{
		{name: "absent"},
		{name: "valid", value: "anonymous-browser-id", want: "anonymous-browser-id"},
		{name: "single printable character", value: " ", want: " "},
		{name: "maximum length", value: strings.Repeat("a", 200), want: strings.Repeat("a", 200)},
		{name: "too long", value: strings.Repeat("a", 201)},
		{name: "control character", value: "id\tvalue"},
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
