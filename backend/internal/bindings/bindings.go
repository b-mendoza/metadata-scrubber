// Package bindings injects per-request application bindings — the validated
// config today, shared clients such as a database tomorrow — into the request
// context, so handlers read sanitized values from the context instead of
// touching the environment directly. It is the Go analogue of the frontend's
// application-bindings middleware
// (frontend/src/shared/middlewares/application-bindings/application-bindings.mod.ts),
// with request context.Context standing in for AsyncLocalStorage.
package bindings

import (
	"context"
	"net/http"

	"metadata-scrubber/internal/config"
)

// Bindings is the set of validated, request-scoped application values.
type Bindings struct {
	// Env is the validated environment configuration.
	Env config.Config
	// Db *sql.DB // wire a shared client here as the backend grows.
}

// contextKey is an unexported type so bindings cannot collide with context
// values set by other packages. The zero value is the only key we use.
type contextKey struct{}

// Inject returns middleware that attaches b to every request's context. Bindings
// are resolved once at startup and shared across requests: the environment is
// static for the process lifetime, so re-parsing per request would only add cost
// and a new failure mode.
func Inject(b Bindings) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), contextKey{}, b)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FromContext returns the application bindings carried by ctx. The bool is false
// when no bindings were injected, i.e. the Inject middleware was not applied —
// the explicit Go counterpart to the frontend's invariant guard.
func FromContext(ctx context.Context) (Bindings, bool) {
	b, ok := ctx.Value(contextKey{}).(Bindings)
	return b, ok
}
