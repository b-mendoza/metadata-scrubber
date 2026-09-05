package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

type reachabilityResponse struct {
	Status string `json:"status"`
}

type workflowConfigResponse struct {
	MaxFileSizeBytes int `json:"maxFileSizeBytes"`
}

type uploadRequest struct {
	FileName      string `json:"fileName"`
	FileSizeBytes int64  `json:"fileSizeBytes"`
}

type uploadResponse struct {
	StorageKey string `json:"storageKey"`
	UploadURL  string `json:"uploadUrl"`
}

type dryRunRequest struct {
	StorageKey string `json:"storageKey"`
}

type publicField struct {
	Name             string            `json:"name"`
	Label            string            `json:"label"`
	Preview          string            `json:"preview"`
	OriginalByteSize int               `json:"originalByteSize"`
	Action           publicFieldAction `json:"action"`
}

type dryRunResponse struct {
	ETag   string        `json:"etag"`
	Fields []publicField `json:"fields"`
}

type scrubRequest struct {
	StorageKey string `json:"storageKey"`
	ETag       string `json:"etag"`
}

type scrubResponse struct {
	Status string              `json:"status"`
	Result scrubResponseResult `json:"result"`
}

type scrubResponseResult struct {
	DownloadURL string `json:"downloadUrl"`
}

type downloadGrantRequest struct {
	StorageKey string `json:"storageKey"`
	ETag       string `json:"etag"`
}

type downloadGrantResponse struct {
	DownloadURL string `json:"downloadUrl"`
	ExpiresAt   string `json:"expiresAt"`
}

type deleteRequest struct {
	StorageKey string `json:"storageKey"`
}

type deleteResponse struct {
	Status string `json:"status"`
}

func writeJSON[T reachabilityResponse | workflowConfigResponse | uploadResponse | dryRunResponse | scrubResponse | downloadGrantResponse | deleteResponse](
	w http.ResponseWriter,
	status int,
	body T,
) error {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(body)
}

func decodeJSONRequest[T uploadRequest | dryRunRequest | scrubRequest | downloadGrantRequest | deleteRequest](
	logger *slog.Logger,
	w http.ResponseWriter,
	request *http.Request,
) (T, bool) {
	var zero T
	if !requestHasJSONMediaType(logger, w, request) {
		return zero, false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input T
	if err := decoder.Decode(&input); err != nil {
		if writeErr := httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request"); writeErr != nil {
			logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return zero, false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if writeErr := httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request"); writeErr != nil {
			logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return zero, false
	}
	return input, true
}

func requestHasJSONMediaType(logger *slog.Logger, w http.ResponseWriter, request *http.Request) bool {
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err == nil && contentType == mediatype.JSON {
		return true
	}
	if writeErr := httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json"); writeErr != nil {
		logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
	return false
}
