package handler

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
	"uuid"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/storage"
)

// Upload creates a private direct-upload grant for one generated logical file ID.
func (handler *Handler) Upload(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[uploadRequest](handler, w, request)
	if !ok {
		return
	}
	if !validFileName(input.FileName) || input.FileSizeBytes <= 0 {
		handler.writeError(w, request, http.StatusBadRequest, "invalid upload request")
		return
	}
	if input.FileSizeBytes > storage.MaxSourceObjectBytes {
		handler.writeError(w, request, http.StatusRequestEntityTooLarge, "source file exceeds 10 MiB limit")
		return
	}

	fileID := uuid.NewV4().String()
	key := storageKey(storageKeyPrefix + fileID)
	requestBindings, _ := bindings.FromContext(request.Context())

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

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageUploadCreated, storageKey: key, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	if err := writeJSON(w, http.StatusOK, uploadResponse{StorageKey: key, UploadURL: grant.URL}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	requestBindings.Events(request.Context(), "upload grant created")
}

func validFileName(fileName string) bool {
	return len(fileName) <= maxFileNameBytes &&
		!strings.ContainsRune(fileName, utf8.RuneError) &&
		strings.TrimSpace(fileName) != "" &&
		!strings.ContainsAny(fileName, `/\`) &&
		!strings.ContainsFunc(fileName, unicode.IsControl)
}
