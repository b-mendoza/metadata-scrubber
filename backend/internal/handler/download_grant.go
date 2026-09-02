package handler

import (
	"net/http"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/storage"
)

// DownloadGrant creates a fresh grant for one exact sanitized source revision.
func (handler *Handler) DownloadGrant(w http.ResponseWriter, request *http.Request) {
	input, ok := decodeJSONRequest[downloadGrantRequest](handler.logger, w, request)
	if !ok {
		return
	}
	fileID, ok := handler.downloadGrantFileID(w, request, input)
	if !ok {
		return
	}
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	exists, err := objectStorage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check scrubbed file")
		return
	}
	if !exists {
		handler.writeDownloadGrantNotFound(w, request)
		return
	}

	operationTime := handler.now().UTC().Truncate(time.Second)
	grant, err := objectStorage.PresignSanitizedDownload(
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
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

func (handler *Handler) writeDownloadGrantNotFound(w http.ResponseWriter, request *http.Request) {
	if writeErr := httpx.WriteError(w, http.StatusNotFound, "scrubbed file not found"); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
}

func (handler *Handler) downloadGrantFileID(
	w http.ResponseWriter,
	request *http.Request,
	input downloadGrantRequest,
) (string, bool) {
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		if err := httpx.WriteError(w, http.StatusBadRequest, "invalid storage key"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return "", false
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err == nil {
		return fileID, true
	}
	if err := httpx.WriteError(w, http.StatusBadRequest, "invalid ETag"); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
	return "", false
}
