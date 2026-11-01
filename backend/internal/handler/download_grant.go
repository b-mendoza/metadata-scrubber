package handler

import (
	"log/slog"
	"net/http"
	"time"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/storage"
)

// DownloadGrant creates a fresh grant for one exact sanitized source revision.
func (handler *Handler) DownloadGrant(w http.ResponseWriter, request *http.Request) {
	input, ok := decodeJSONRequest[downloadGrantRequest](handler, w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		handler.writeError(w, request, http.StatusBadRequest, "invalid storage key")
		return
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err != nil {
		handler.writeError(w, request, http.StatusBadRequest, "invalid ETag")
		return
	}
	requestBindings, _ := bindings.FromContext(request.Context())

	exists, err := requestBindings.Storage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check scrubbed file")
		return
	}
	if !exists {
		handler.writeError(w, request, http.StatusNotFound, "scrubbed file not found")
		return
	}

	operationTime := handler.now().UTC().Truncate(time.Second)
	grant, err := requestBindings.Storage.PresignSanitizedDownload(
		request.Context(),
		fileID,
		input.ETag,
		downloadGrantExpiry,
	)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not create download")
		return
	}

	if err := writeJSON(w, http.StatusOK, downloadGrantResponse{
		DownloadURL: grant.URL,
		ExpiresAt:   operationTime.Add(downloadGrantExpiry).Format(time.RFC3339),
	}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	requestBindings.Events(request.Context(), "download grant refreshed")
}
