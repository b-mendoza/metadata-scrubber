// Package httpx provides shared HTTP plumbing: JSON responses and middleware.
package httpx

import (
	"encoding/json"
	"net/http"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

// WriteJSON writes body as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// WriteError writes msg as a JSON error response with the given status code.
func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}
