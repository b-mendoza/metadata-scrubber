// Package bindings stores validated application values on request contexts.
package bindings

import (
	"context"
	"net/http"

	"metadata-scrubber/internal/config"
)

// Bindings is the set of validated, request-scoped application values.
type Bindings struct {
	Env config.Config
}

// contextKey is unexported, so no other package can forge the bindings key.
type contextKey struct{}

// Inject returns middleware that attaches bindings to every request context.
func Inject(bindings Bindings) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), contextKey{}, bindings)
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
