package handler

import (
	"net/http"

	"metadata-scrubber/internal/storage"
)

// WorkflowConfig returns the backend-owned limits for the small-JSON workflow.
func (handler *Handler) WorkflowConfig(w http.ResponseWriter, request *http.Request) {
	if err := writeJSON(w, http.StatusOK, workflowConfigResponse{
		MaxFileSizeBytes: storage.MaxSourceObjectBytes,
	}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}
