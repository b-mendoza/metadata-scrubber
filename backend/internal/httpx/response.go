// Package httpx provides shared HTTP plumbing: JSON error responses and middleware.
package httpx

import (
	"encoding/json"
	"net/http"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

type errorResponse struct {
	Error string `json:"error"`
}

// WriteError writes msg as a JSON error response with the given status code.
func WriteError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: msg})
}
