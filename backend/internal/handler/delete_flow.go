package handler

import (
	"errors"
	"net/http"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/storage"
)

// DeleteFlow removes and verifies all private objects for one logical file.
func (handler *Handler) DeleteFlow(w http.ResponseWriter, request *http.Request) {
	input, ok := decodeJSONRequest[deleteRequest](handler.logger, w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		if err := httpx.WriteError(w, http.StatusBadRequest, "invalid storage key"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return
	}
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	if !handler.deleteStoredFlow(w, request, objectStorage, fileID) {
		return
	}
	if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

func (handler *Handler) deleteStoredFlow(
	w http.ResponseWriter,
	request *http.Request,
	objectStorage storage.Storage,
	fileID string,
) bool {
	err := objectStorage.DeleteFlow(request.Context(), fileID)
	if errors.Is(err, storage.ErrFlowObjectsRemain) {
		if writeErr := httpx.WriteError(w, http.StatusConflict, "file deletion could not be confirmed"); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return false
	}
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not delete file")
		return false
	}
	return true
}
