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
	// maxUploadSize matches the scrub package's decimal 10 MB product boundary.
	maxUploadSize        = scrub.MaxInputBytes
	maxMultipartOverhead = 1 << 20
	maxMultipartBodySize = maxUploadSize + maxMultipartOverhead
	reachableStatus = "reachable"
	fileFormField   = "file"
	scrubFileError  = "could not scrub file: "
)

type reachabilityResponse struct {
	Status string `json:"status"`
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, reachabilityResponse{Status: reachableStatus})
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

	src, err := io.ReadAll(io.LimitReader(file, maxUploadSize+1))
	_ = file.Close()

	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not read uploaded file")
		return
	}

	if len(src) > maxUploadSize {
		httpx.WriteError(w, http.StatusBadRequest, "missing or invalid \"file\" form field")
		return
	}

	cleaned, err := scrub.Scrub(fileHeader.Filename, src)
	if err != nil {
		writeScrubError(w, err)
		return
	}

	writeDownload(w, fileHeader.Filename, cleaned)
}

func writeDownload(w http.ResponseWriter, filename string, cleaned []byte) {
	w.Header().Set(header.ContentType, mediatype.OctetStream)
	w.Header().Set(header.ContentDisposition, contentDisposition(filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(cleaned)
}

func contentDisposition(filename string) string {
	return mime.FormatMediaType("attachment", map[string]string{"filename": filepath.Base(filename)})
}

func writeScrubError(w http.ResponseWriter, err error) {
	if errors.Is(err, scrub.ErrUnsupportedType) {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, err.Error())
		return
	}

	httpx.WriteError(w, http.StatusInternalServerError, scrubFileError+err.Error())
}
