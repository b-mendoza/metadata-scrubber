package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/storage"
)

// DeleteFlow removes and verifies all private objects for one logical file.
func (handler *Handler) DeleteFlow(w http.ResponseWriter, request *http.Request) {
	input, ok := decodeJSONRequest[deleteRequest](handler, w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		handler.writeError(w, request, http.StatusBadRequest, "invalid storage key")
		return
	}
	requestBindings, _ := bindings.FromContext(request.Context())

	err := requestBindings.Storage.DeleteFlow(request.Context(), fileID)
	if errors.Is(err, storage.ErrFlowObjectsRemain) {
		handler.writeError(w, request, http.StatusConflict, "file deletion could not be confirmed")
		return
	}
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not delete file")
		return
	}
	if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	requestBindings.Events(request.Context(), "file deleted")
}
