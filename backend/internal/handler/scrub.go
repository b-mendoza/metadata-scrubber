package handler

import (
	"log/slog"
	"net/http"
	"time"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/sniff"
	"metadata-scrubber/internal/storage"
)

// Scrub cleans the exact reviewed source revision and returns its private download grant.
func (handler *Handler) Scrub(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[scrubRequest](handler, w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		handler.writeError(w, request, http.StatusBadRequest, "invalid storage key")
		return
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err != nil {
		handler.writeError(w, request, http.StatusBadRequest, "invalid ETag")
		return
	}
	requestBindings, _ := bindings.FromContext(request.Context())
	scrubWorkflow := scrubWorkflowRequest{
		request: request, requestBindings: requestBindings, fileID: fileID, input: input, startedAt: startedAt,
	}

	sourceExists, err := requestBindings.Storage.SourceExists(request.Context(), fileID)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check source file")
		return
	}
	if !sourceExists {
		handler.writeError(w, request, http.StatusNotFound, "source file not found")
		return
	}

	sanitizedExists, err := requestBindings.Storage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not check scrubbed file")
		return
	}
	if sanitizedExists {
		handler.presignScrubbed(w, scrubWorkflow, pipelineOutcomeCacheHit)
		return
	}

	handler.materializeScrubbed(w, scrubWorkflow)
}

type scrubWorkflowRequest struct {
	request         *http.Request
	requestBindings bindings.Bindings
	fileID          string
	input           scrubRequest
	startedAt       time.Time
}

func (handler *Handler) materializeScrubbed(w http.ResponseWriter, scrubWorkflow scrubWorkflowRequest) {
	release, err := handler.acquirePermit(scrubWorkflow.request.Context())
	if err != nil {
		handler.writeAdmissionFailure(w, scrubWorkflow.request, err)
		return
	}
	cleanedBytes, err := handler.cleanSource(scrubWorkflow, release)
	if err != nil {
		failure := classifyPipelineFailure(err, "could not scrub PDF")
		handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageScrubbed, storageKey: scrubWorkflow.input.StorageKey, outcome: failure.outcome, startedAt: scrubWorkflow.startedAt})
		handler.writeError(w, scrubWorkflow.request, failure.status, failure.message)
		return
	}
	handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageScrubbed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: scrubWorkflow.startedAt})

	if err := scrubWorkflow.requestBindings.Storage.UploadSanitized(scrubWorkflow.request.Context(), scrubWorkflow.fileID, scrubWorkflow.input.ETag, cleanedBytes); err != nil {
		handler.writeUnexpectedFailure(w, scrubWorkflow.request, err, "could not store scrubbed file")
		return
	}
	handler.presignScrubbed(w, scrubWorkflow, pipelineOutcomeSuccess)
}

func (handler *Handler) cleanSource(scrubWorkflow scrubWorkflowRequest, release func()) ([]byte, error) {
	defer release()

	source, err := scrubWorkflow.requestBindings.Storage.DownloadSource(scrubWorkflow.request.Context(), scrubWorkflow.fileID, scrubWorkflow.input.ETag)
	if err != nil {
		return nil, err
	}
	if !sniff.IsPDFCandidate(source.PDFBytes) {
		handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeRejected, startedAt: scrubWorkflow.startedAt})
		return nil, errNotPDF
	}
	handler.logStage(pipelineLogEvent{ctx: scrubWorkflow.request.Context(), stage: pipelineStageSniffed, storageKey: scrubWorkflow.input.StorageKey, outcome: pipelineOutcomeAccepted, startedAt: scrubWorkflow.startedAt})

	return handler.clean(scrubWorkflow.request.Context(), source.PDFBytes)
}

func (handler *Handler) presignScrubbed(w http.ResponseWriter, scrubWorkflow scrubWorkflowRequest, outcome pipelineOutcome) {
	grant, err := scrubWorkflow.requestBindings.Storage.PresignSanitizedDownload(
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
		handler.logger.ErrorContext(scrubWorkflow.request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	scrubWorkflow.requestBindings.Events(scrubWorkflow.request.Context(), "file scrubbed")
}
