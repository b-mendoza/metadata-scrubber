package handler

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/sniff"
	"metadata-scrubber/internal/storage"
)

// DryRun inspects the current source revision while holding shared admission.
func (handler *Handler) DryRun(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[dryRunRequest](handler.logger, w, request)
	if !ok {
		return
	}
	fileID, ok := handler.dryRunFileID(w, request, input)
	if !ok {
		return
	}
	requestBindings := handler.bindingsFromRequest(w, request)
	if requestBindings.Storage == nil {
		return
	}

	inspectWorkflow := inspectWorkflowRequest{
		request: request, objectStorage: requestBindings.Storage, fileID: fileID,
		storageKey: input.StorageKey, startedAt: startedAt,
	}
	etag, inspectedFields, err := handler.inspectSource(inspectWorkflow)
	var fields []publicField
	if err == nil {
		fields, err = convertPublicFields(inspectedFields)
	}
	if errors.Is(err, errAdmissionFailure) {
		handler.writeAdmissionFailure(w, request, err)
		return
	}
	if err != nil {
		handler.writeDryRunFailure(w, inspectWorkflow, err)
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	if err := writeJSON(w, http.StatusOK, dryRunResponse{ETag: etag, Fields: fields}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		return
	}
	requestBindings.Events(request.Context(), "dry run completed")
}

func (handler *Handler) dryRunFileID(w http.ResponseWriter, request *http.Request, input dryRunRequest) (string, bool) {
	fileID, ok := parseStorageKey(input.StorageKey)
	if ok {
		return fileID, true
	}
	if err := httpx.WriteError(w, http.StatusBadRequest, "invalid storage key"); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
	return "", false
}

func (handler *Handler) writeDryRunFailure(w http.ResponseWriter, inspectWorkflow inspectWorkflowRequest, err error) {
	failure := classifyPipelineFailure(err, "could not inspect PDF")
	handler.logStage(pipelineLogEvent{ctx: inspectWorkflow.request.Context(), stage: pipelineStageDryRun, storageKey: inspectWorkflow.storageKey, outcome: failure.outcome, startedAt: inspectWorkflow.startedAt})
	if writeErr := httpx.WriteError(w, failure.status, failure.message); writeErr != nil {
		handler.logger.ErrorContext(inspectWorkflow.request.Context(), "could not write JSON response", "error", writeErr)
	}
}

type inspectWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	storageKey    string
	startedAt     time.Time
}

func (handler *Handler) inspectSource(inspectWorkflow inspectWorkflowRequest) (string, []scrub.Field, error) {
	release, err := handler.acquirePermit(inspectWorkflow.request.Context())
	if err != nil {
		return "", nil, fmt.Errorf("%w: %w", errAdmissionFailure, err)
	}
	defer release()

	source, err := inspectWorkflow.objectStorage.DownloadSource(inspectWorkflow.request.Context(), inspectWorkflow.fileID, "")
	if err != nil {
		return "", nil, err
	}
	if !sniff.IsPDFCandidate(source.PDFBytes) {
		handler.logStage(pipelineLogEvent{ctx: inspectWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: inspectWorkflow.storageKey, outcome: pipelineOutcomeRejected, startedAt: inspectWorkflow.startedAt})
		return "", nil, errNotPDF
	}
	handler.logStage(pipelineLogEvent{ctx: inspectWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: inspectWorkflow.storageKey, outcome: pipelineOutcomeAccepted, startedAt: inspectWorkflow.startedAt})

	fields, err := handler.inspect(source.PDFBytes)
	if err != nil {
		return "", nil, err
	}
	return source.ETag, fields, nil
}
