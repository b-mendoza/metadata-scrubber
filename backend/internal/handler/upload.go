package handler

import (
	"net/http"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/storage"
)

// Upload creates a private direct-upload grant for one generated logical file ID.
func (handler *Handler) Upload(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[uploadRequest](handler.logger, w, request)
	if !ok {
		return
	}
	if !handler.validateUploadRequest(w, request, input) {
		return
	}

	fileID, ok := handler.newFileID()
	if !ok {
		if err := httpx.WriteError(w, http.StatusInternalServerError, "could not create upload"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return
	}
	storageKey := formatStorageKey(fileID)
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	grant, err := objectStorage.PresignSourceUpload(
		request.Context(),
		fileID,
		input.FileSizeBytes,
		uploadGrantExpiry,
	)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not create upload")
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageUploadCreated, storageKey: storageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	if err := writeJSON(w, http.StatusOK, uploadResponse{StorageKey: storageKey, UploadURL: grant.URL}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

func (handler *Handler) validateUploadRequest(w http.ResponseWriter, request *http.Request, input uploadRequest) bool {
	if !validFileName(input.FileName) || input.FileSizeBytes <= 0 {
		if err := httpx.WriteError(w, http.StatusBadRequest, "invalid upload request"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return false
	}
	if input.FileSizeBytes > storage.MaxSourceObjectBytes {
		if err := httpx.WriteError(w, http.StatusRequestEntityTooLarge, "source file exceeds 10 MiB limit"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return false
	}
	return true
}
