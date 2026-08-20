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
	input, ok := decodeJSONRequest[dryRunRequest](w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid storage key")
		return
	}
	objectStorage := storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	etag, inspectedFields, err := handler.inspectSource(inspectWorkflowRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		storageKey: input.StorageKey, startedAt: startedAt,
	})
	var fields []publicField
	if err == nil {
		fields, err = convertPublicFields(inspectedFields)
	}
	if errors.Is(err, errAdmissionFailure) {
		writeAdmissionFailure(w, err)
		return
	}
	if err != nil {
		failure := classifyPipelineFailure(err, "could not inspect PDF")
		handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: failure.outcome, startedAt: startedAt})
		httpx.WriteError(w, failure.status, failure.message)
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	writeJSON(w, http.StatusOK, dryRunResponse{ETag: etag, Fields: fields})
}

type inspectWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	storageKey    string
	startedAt     time.Time
}

func (handler *Handler) inspectSource(input inspectWorkflowRequest) (string, []scrub.Field, error) {
	release, err := handler.acquirePermit(input.request.Context())
	if err != nil {
		return "", nil, fmt.Errorf("%w: %w", errAdmissionFailure, err)
	}
	defer release()

	source, err := input.objectStorage.DownloadSource(input.request.Context(), input.fileID, "")
	if err != nil {
		return "", nil, err
	}
	if !sniff.IsPDFCandidate(source.PDFBytes) {
		handler.logStage(pipelineLogEvent{ctx: input.request.Context(), stage: pipelineStageSniffed, storageKey: input.storageKey, outcome: pipelineOutcomeRejected, startedAt: input.startedAt})
		return "", nil, errNotPDF
	}
	handler.logStage(pipelineLogEvent{ctx: input.request.Context(), stage: pipelineStageSniffed, storageKey: input.storageKey, outcome: pipelineOutcomeAccepted, startedAt: input.startedAt})

	fields, err := handler.inspect(source.PDFBytes, scrub.PublicInput)
	if err != nil {
		return "", nil, err
	}
	return source.ETag, fields, nil
}

// Scrub cleans the exact reviewed source revision and returns its private download grant.
func (handler *Handler) Scrub(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[scrubRequest](w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid storage key")
		return
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid ETag")
		return
	}
	objectStorage := storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	exists, err := objectStorage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		writeUnexpectedFailure(w, err, "could not check scrubbed file")
		return
	}
	if exists {
		handler.presignScrubbed(w, scrubDownloadRequest{
			request: request, objectStorage: objectStorage, fileID: fileID,
			input: input, outcome: pipelineOutcomeCacheHit, startedAt: startedAt,
		})
		return
	}

	if !handler.materializeScrubbed(w, scrubMaterializeRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		input: input, startedAt: startedAt,
	}) {
		return
	}
	handler.presignScrubbed(w, scrubDownloadRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		input: input, outcome: pipelineOutcomeSuccess, startedAt: startedAt,
	})
}

type scrubMaterializeRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	input         scrubRequest
	startedAt     time.Time
}

// materializeScrubbed cleans the reviewed source revision and stores the scrubbed copy.
// It writes the failure response and reports false when a stage fails.
func (handler *Handler) materializeScrubbed(w http.ResponseWriter, materializeRequest scrubMaterializeRequest) bool {
	cleanedBytes, err := handler.cleanSource(cleanWorkflowRequest{
		request: materializeRequest.request, objectStorage: materializeRequest.objectStorage, fileID: materializeRequest.fileID,
		storageKey: materializeRequest.input.StorageKey, startedAt: materializeRequest.startedAt, expectedETag: materializeRequest.input.ETag,
	})
	if errors.Is(err, errAdmissionFailure) {
		writeAdmissionFailure(w, err)
		return false
	}
	if err != nil {
		failure := classifyPipelineFailure(err, "could not scrub PDF")
		handler.logStage(pipelineLogEvent{ctx: materializeRequest.request.Context(), stage: pipelineStageScrubbed, storageKey: materializeRequest.input.StorageKey, outcome: failure.outcome, startedAt: materializeRequest.startedAt})
		httpx.WriteError(w, failure.status, failure.message)
		return false
	}
	handler.logStage(pipelineLogEvent{ctx: materializeRequest.request.Context(), stage: pipelineStageScrubbed, storageKey: materializeRequest.input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: materializeRequest.startedAt})

	if err := materializeRequest.objectStorage.UploadSanitized(materializeRequest.request.Context(), materializeRequest.fileID, materializeRequest.input.ETag, cleanedBytes); err != nil {
		writeUnexpectedFailure(w, err, "could not store scrubbed file")
		return false
	}
	return true
}

type cleanWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	storageKey    string
	expectedETag  string
	startedAt     time.Time
}

func (handler *Handler) cleanSource(input cleanWorkflowRequest) ([]byte, error) {
	release, err := handler.acquirePermit(input.request.Context())
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errAdmissionFailure, err)
	}
	defer release()

	source, err := input.objectStorage.DownloadSource(input.request.Context(), input.fileID, input.expectedETag)
	if err != nil {
		return nil, err
	}
	if !sniff.IsPDFCandidate(source.PDFBytes) {
		handler.logStage(pipelineLogEvent{ctx: input.request.Context(), stage: pipelineStageSniffed, storageKey: input.storageKey, outcome: pipelineOutcomeRejected, startedAt: input.startedAt})
		return nil, errNotPDF
	}
	handler.logStage(pipelineLogEvent{ctx: input.request.Context(), stage: pipelineStageSniffed, storageKey: input.storageKey, outcome: pipelineOutcomeAccepted, startedAt: input.startedAt})

	return handler.clean(source.PDFBytes)
}

type scrubDownloadRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	input         scrubRequest
	outcome       pipelineOutcome
	startedAt     time.Time
}

func (handler *Handler) presignScrubbed(w http.ResponseWriter, downloadRequest scrubDownloadRequest) {
	grant, err := downloadRequest.objectStorage.PresignSanitizedDownload(
		downloadRequest.request.Context(),
		downloadRequest.fileID,
		downloadRequest.input.ETag,
		downloadGrantExpiry,
	)
	if err != nil {
		writeUnexpectedFailure(w, err, "could not create download")
		return
	}

	handler.logStage(pipelineLogEvent{ctx: downloadRequest.request.Context(), stage: pipelineStagePresigned, storageKey: downloadRequest.input.StorageKey, outcome: downloadRequest.outcome, startedAt: downloadRequest.startedAt})
	writeJSON(w, http.StatusOK, scrubResponse{
		Status: "done",
		Result: scrubResponseResult{DownloadURL: grant.URL},
	})
}
