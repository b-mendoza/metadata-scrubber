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
	fileID, ok := handler.deleteFlowFileID(w, request, input)
	if !ok {
		return
	}
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	if !handler.deleteStoredFlow(w, deleteFlowOperation{
		request: request, objectStorage: objectStorage, fileID: fileID,
	}) {
		return
	}
	handler.writeDeleteFlowSuccess(w, request)
}

type deleteFlowOperation struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
}

func (handler *Handler) deleteStoredFlow(w http.ResponseWriter, operation deleteFlowOperation) bool {
	err := operation.objectStorage.DeleteFlow(operation.request.Context(), operation.fileID)
	if err == nil {
		return true
	}
	if errors.Is(err, storage.ErrFlowObjectsRemain) {
		handler.writeDeleteFlowConflict(w, operation.request)
		return false
	}
	handler.writeUnexpectedFailure(w, operation.request, err, "could not delete file")
	return false
}

func (handler *Handler) writeDeleteFlowConflict(w http.ResponseWriter, request *http.Request) {
	if writeErr := httpx.WriteError(w, http.StatusConflict, "file deletion could not be confirmed"); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
}

func (handler *Handler) writeDeleteFlowSuccess(w http.ResponseWriter, request *http.Request) {
	if err := writeJSON(w, http.StatusOK, deleteResponse{Status: "deleted"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

func (handler *Handler) deleteFlowFileID(
	w http.ResponseWriter,
	request *http.Request,
	input deleteRequest,
) (string, bool) {
	fileID, ok := parseStorageKey(input.StorageKey)
	if ok {
		return fileID, true
	}
	if err := httpx.WriteError(w, http.StatusBadRequest, "invalid storage key"); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
	return "", false
}
