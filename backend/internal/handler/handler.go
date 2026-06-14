// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"errors"
	"io"
	"net/http"
	"path/filepath"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
)

// maxUploadSize caps the size of an uploaded file (25 MB) to keep memory usage bounded.
const maxUploadSize = 25 << 20

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "reachable"})
}

// Scrub accepts a multipart upload under the form field "file", removes
// its metadata, and streams the cleaned file back to the client.
func Scrub(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "missing or invalid \"file\" form field")
		return
	}
	defer func() { _ = file.Close() }()

	// pdfcpu needs an io.ReadSeeker, so buffer the upload into memory.
	src, err := io.ReadAll(file)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not read uploaded file")
		return
	}

	cleaned, err := scrub.Scrub(header.Filename, src)
	if err != nil {
		if errors.Is(err, scrub.ErrUnsupportedType) {
			httpx.WriteError(w, http.StatusUnsupportedMediaType, err.Error())
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "could not scrub file: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(header.Filename)+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleaned)
}
