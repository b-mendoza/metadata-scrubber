// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"io"
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
		httpx.WriteError(w, http.StatusInternalServerError, "could not scrub file: "+err.Error())
		return
	}

	w.Header().Set(header.ContentType, mediatype.OctetStream)
	w.Header().Set(header.ContentDisposition, contentDisposition(fileHeader.Filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleanedBytes)
}

func contentDisposition(filename string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(filename)})
}
