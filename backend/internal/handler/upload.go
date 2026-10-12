package handler

import (
	"net/http"
	"time"
	"uuid"

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

	fileID := uuid.NewV4().String()
	storageKey := storageKeyPrefix + fileID
	requestBindings := handler.bindingsFromRequest(w, request)
	if requestBindings.Storage == nil {
		return
	}

	grant, err := requestBindings.Storage.PresignSourceUpload(
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
		return
	}
	requestBindings.Events(request.Context(), "upload grant created")
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
