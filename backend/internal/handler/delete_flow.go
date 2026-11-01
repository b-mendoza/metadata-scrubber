package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/logkey"
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
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		}
		return
	}
	requestBindings, ok := handler.bindingsFromRequest(w, request)
	if !ok {
		return
	}

	if !handler.deleteStoredFlow(w, request, requestBindings.Storage, fileID) {
		return
	}
	if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	requestBindings.Events(request.Context(), "file deleted")
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
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
		}
		return false
	}
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not delete file")
		return false
	}
	return true
}
