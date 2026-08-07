// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"path/filepath"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
)

const (
	// maxUploadSize matches the scrub package's decimal 10 MB product boundary.
	maxUploadSize        = scrub.MaxInputBytes
	maxMultipartOverhead = 1 << 20
	maxMultipartBodySize = maxUploadSize + maxMultipartOverhead
	fileFormField        = "file"
)

type reachabilityResponse struct {
	Status string `json:"status"`
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, reachabilityResponse{Status: "reachable"})
}

// Scrub accepts a multipart upload under the form field "file", removes
// its metadata, and streams the cleaned file back to the client.
func Scrub(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxMultipartBodySize)

	file, fileHeader, err := r.FormFile(fileFormField)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "missing or invalid \"file\" form field")
		return
	}

	inputBytes, err := io.ReadAll(io.LimitReader(file, maxUploadSize+1))
	_ = file.Close()

	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not read uploaded file")
		return
	}
	if len(inputBytes) > maxUploadSize {
		httpx.WriteError(w, http.StatusBadRequest, "missing or invalid \"file\" form field")
		return
	}

	cleanedBytes, err := scrub.CleanPDF(inputBytes)
	if err != nil {
		writeScrubFailure(w, r, err)
		return
	}

	w.Header().Set(header.ContentType, mediatype.OctetStream)
	w.Header().Set(header.ContentDisposition, contentDisposition(fileHeader.Filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleanedBytes)
}

// writeScrubFailure answers classified scrub failures as client errors with
// fixed public messages. Everything unclassified is a server failure: its
// detail is logged for diagnostics and never echoed to the client.
func writeScrubFailure(w http.ResponseWriter, r *http.Request, scrubErr error) {
	switch {
	case errors.Is(scrubErr, scrub.ErrInputTooLarge):
		httpx.WriteError(w, http.StatusBadRequest, "PDF input exceeds 10 MB limit")
	case errors.Is(scrubErr, scrub.ErrSignedPDF):
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "signed PDF is unsupported")
	case errors.Is(scrubErr, scrub.ErrInspectionLimit):
		httpx.WriteError(w, http.StatusBadRequest, "PDF metadata exceeds inspection limits")
	default:
		slog.ErrorContext(r.Context(), "scrub failed", "error", scrubErr)
		httpx.WriteError(w, http.StatusInternalServerError, "could not scrub file")
	}
}

func contentDisposition(filename string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(filename)})
}
