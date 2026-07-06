// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"errors"
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
	// maxUploadSize caps the size of an uploaded file (25 MB) to keep memory usage bounded.
	maxUploadSize    = 25 << 20
	statusKey        = "status"
	reachableStatus  = "reachable"
	fileFormField    = "file"
	missingFileError = "missing or invalid \"file\" form field"
	readFileError    = "could not read uploaded file"
	scrubFileError   = "could not scrub file: "
)

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]string{statusKey: reachableStatus})
}

// Scrub accepts a multipart upload under the form field "file", removes
// its metadata, and streams the cleaned file back to the client.
func Scrub(w http.ResponseWriter, r *http.Request) {
	filename, src, ok := readUploadedFile(w, r)
	if !ok {
		return
	}

	cleaned, err := scrub.Scrub(filename, src)
	if err != nil {
		if errors.Is(err, scrub.ErrUnsupportedType) {
			httpx.WriteError(w, http.StatusUnsupportedMediaType, err.Error())
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, scrubFileError+err.Error())
		return
	}

	w.Header().Set(header.ContentType, mediatype.OctetStream)
	w.Header().Set(header.ContentDisposition, contentDisposition(filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleaned)
}

func contentDisposition(filename string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(filename)})
}

func readUploadedFile(w http.ResponseWriter, r *http.Request) (string, []byte, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	file, fileHeader, err := r.FormFile(fileFormField)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, missingFileError)
		return "", nil, false
	}
	defer func() { _ = file.Close() }()

	// pdfcpu needs an io.ReadSeeker, so buffer the upload into memory.
	src, err := io.ReadAll(file)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, readFileError)
		return "", nil, false
	}

	return fileHeader.Filename, src, true
}
