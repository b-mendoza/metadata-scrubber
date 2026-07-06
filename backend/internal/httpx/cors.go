package httpx

import (
	"net/http"

	"metadata-scrubber/internal/httpx/header"
)

const (
	corsAllowedOrigin  = "*"
	corsAllowedMethods = "GET, POST, OPTIONS"
)

// CORS allows the frontend dev server to call this API from another origin.
// Loosen or tighten as needed; it's permissive here purely for local development.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(header.AccessControlAllowOrigin, corsAllowedOrigin)
		w.Header().Set(header.AccessControlAllowMethods, corsAllowedMethods)
		w.Header().Set(header.AccessControlAllowHeaders, header.ContentType)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
