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
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	inspectWorkflow := inspectWorkflowRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
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
	}
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

	fields, err := handler.inspect(source.PDFBytes, scrub.PublicInput)
	if err != nil {
		return "", nil, err
	}
	return source.ETag, fields, nil
}

// Scrub cleans the exact reviewed source revision and returns its private download grant.
func (handler *Handler) Scrub(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[scrubRequest](handler.logger, w, request)
	if !ok {
		return
	}
	fileID, ok := handler.scrubFileID(w, request, input)
	if !ok {
		return
	}
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}
	scrubWorkflow := scrubWorkflowRequest{
		request: request, objectStorage: objectStorage, fileID: fileID, input: input, startedAt: startedAt,
	}

	if !handler.scrubSourceAvailable(w, request, objectStorage, fileID) {
		return
	}

	sanitizedExists, err := objectStorage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check scrubbed file")
		return
	}
	if sanitizedExists {
		handler.presignScrubbed(w, scrubWorkflow, pipelineOutcomeCacheHit)
		return
	}

	if !handler.materializeScrubbed(w, scrubWorkflow) {
		return
	}
	handler.presignScrubbed(w, scrubWorkflow, pipelineOutcomeSuccess)
}

func (handler *Handler) scrubSourceAvailable(w http.ResponseWriter, request *http.Request, objectStorage storage.Storage, fileID string) bool {
	sourceExists, err := objectStorage.SourceExists(request.Context(), fileID)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check source file")
		return false
	}
	if sourceExists {
		return true
	}
	if writeErr := httpx.WriteError(w, http.StatusNotFound, "source file not found"); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
	return false
}

func (handler *Handler) scrubFileID(w http.ResponseWriter, request *http.Request, input scrubRequest) (string, bool) {
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

type scrubWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	input         scrubRequest
	startedAt     time.Time
}

func (handler *Handler) materializeScrubbed(w http.ResponseWriter, scrubWorkflow scrubWorkflowRequest) bool {
	cleanedBytes, err := handler.cleanSource(scrubWorkflow)
	if errors.Is(err, errAdmissionFailure) {
		handler.writeAdmissionFailure(w, scrubWorkflow.request, err)
		return false
	}
	if err != nil {
		failure := classifyPipelineFailure(err, "could not scrub PDF")
		handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageScrubbed, storageKey: scrubWorkflow.input.StorageKey, outcome: failure.outcome, startedAt: scrubWorkflow.startedAt})
		if writeErr := httpx.WriteError(w, failure.status, failure.message); writeErr != nil {
			handler.logger.ErrorContext(scrubWorkflow.request.Context(), "could not write JSON response", "error", writeErr)
		}
		return false
	}
	handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageScrubbed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: scrubWorkflow.startedAt})

	if err := scrubWorkflow.objectStorage.UploadSanitized(scrubWorkflow.request.Context(), scrubWorkflow.fileID, scrubWorkflow.input.ETag, cleanedBytes); err != nil {
		handler.writeUnexpectedFailure(w, scrubWorkflow.request, err, "could not store scrubbed file")
		return false
	}
	return true
}

func (handler *Handler) cleanSource(scrubWorkflow scrubWorkflowRequest) ([]byte, error) {
	release, err := handler.acquirePermit(scrubWorkflow.request.Context())
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errAdmissionFailure, err)
	}
	defer release()

	source, err := scrubWorkflow.objectStorage.DownloadSource(scrubWorkflow.request.Context(), scrubWorkflow.fileID, scrubWorkflow.input.ETag)
	if err != nil {
		return nil, err
	}
	if !sniff.IsPDFCandidate(source.PDFBytes) {
		handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeRejected, startedAt: scrubWorkflow.startedAt})
		return nil, errNotPDF
	}
	handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeAccepted, startedAt: scrubWorkflow.startedAt})

	return handler.clean(source.PDFBytes)
}

func (handler *Handler) presignScrubbed(w http.ResponseWriter, scrubWorkflow scrubWorkflowRequest, outcome pipelineOutcome) {
	grant, err := scrubWorkflow.objectStorage.PresignSanitizedDownload(
		scrubWorkflow.request.Context(),
		scrubWorkflow.fileID,
		scrubWorkflow.input.ETag,
		downloadGrantExpiry,
	)
	if err != nil {
		handler.writeUnexpectedFailure(w, scrubWorkflow.request, err, "could not create download")
		return
	}

	handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStagePresigned, storageKey: scrubWorkflow.input.StorageKey, outcome: outcome, startedAt: scrubWorkflow.startedAt})
	if err := writeJSON(w, http.StatusOK, scrubResponse{
		Status: "done",
		Result: scrubResponseResult{DownloadURL: grant.URL},
	}); err != nil {
		handler.logger.ErrorContext(scrubWorkflow.request.Context(), "could not write JSON response", "error", err)
	}
}
