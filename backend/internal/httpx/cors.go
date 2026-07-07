package httpx

import (
	"net/http"

	"metadata-scrubber/internal/httpx/header"
)

const (
	corsAllowedOrigin  = "*"
	corsAllowedMethods = http.MethodGet + ", " + http.MethodPost + ", " + http.MethodOptions
	corsAllowedHeaders = header.ContentType
)

// CORS applies a permissive, fixed cross-origin policy before dispatching requests.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(header.AccessControlAllowOrigin, corsAllowedOrigin)
		w.Header().Set(header.AccessControlAllowMethods, corsAllowedMethods)
		w.Header().Set(header.AccessControlAllowHeaders, corsAllowedHeaders)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
