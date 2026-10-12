// Package bindings stores validated application values on request contexts.
package bindings

import (
	"context"
	"net/http"

	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/storage"
)

// Bindings is the set of validated, request-scoped application values.
type Bindings struct {
	Env               config.Config
	Storage           storage.Storage
	PostHogDistinctID string
	PostHogSessionID  string
	Events            func(ctx context.Context, event string)
}

// contextKey is unexported, so no other package can forge the bindings key.
type contextKey struct{}

// Inject returns middleware that attaches bindings to every request context.
func Inject(bindings Bindings) func(http.Handler) http.Handler {
	if bindings.Events == nil {
		bindings.Events = func(context.Context, string) {}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestBindings := bindings
			// Invalid or absent analytics headers must never fail a workflow request.
			requestBindings.PostHogDistinctID = analyticsHeader(r.Header.Get("X-POSTHOG-DISTINCT-ID"))
			requestBindings.PostHogSessionID = analyticsHeader(r.Header.Get("X-POSTHOG-SESSION-ID"))
			ctx := context.WithValue(r.Context(), contextKey{}, requestBindings)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FromContext returns the application bindings carried by ctx. The bool is false
// when Inject has not attached bindings.
func FromContext(ctx context.Context) (Bindings, bool) {
	b, ok := ctx.Value(contextKey{}).(Bindings)
	return b, ok
}

func analyticsHeader(value string) string {
	const (
		maxLength      = 200
		firstPrintable = ' '
		lastPrintable  = '~'
	)
	if value == "" || len(value) > maxLength {
		return ""
	}
	for i := range len(value) {
		if value[i] < firstPrintable || value[i] > lastPrintable {
			return ""
		}
	}
	return value
}
