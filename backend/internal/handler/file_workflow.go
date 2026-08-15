package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/sniff"
	"metadata-scrubber/internal/storage"
)

func decodeDryRunRequest(w http.ResponseWriter, request *http.Request) (dryRunRequest, bool) {
	var input dryRunRequest
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err != nil || contentType != mediatype.JSON {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return dryRunRequest{}, false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return dryRunRequest{}, false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return dryRunRequest{}, false
	}
	return input, true
}

// DryRun inspects the current source revision while holding shared admission.
func (handler *Handler) DryRun(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeDryRunRequest(w, request)
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

	etag, inspectedFields, err := handler.inspectSource(sourceWorkflowRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		storageKey: input.StorageKey, startedAt: startedAt,
	})
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

	fields := convertPublicFields(inspectedFields)
	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	httpx.WriteJSON(w, http.StatusOK, dryRunResponse{ETag: etag, Fields: fields})
}

type sourceWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	storageKey    string
	expectedETag  string
	startedAt     time.Time
}

func (handler *Handler) inspectSource(input sourceWorkflowRequest) (string, []scrub.Field, error) {
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
	input, fileID, ok := decodeScrubRequest(w, request)
	if !ok {
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

	cleanedBytes, err := handler.cleanSource(sourceWorkflowRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		storageKey: input.StorageKey, startedAt: startedAt, expectedETag: input.ETag,
	})
	if errors.Is(err, errAdmissionFailure) {
		writeAdmissionFailure(w, err)
		return
	}
	if err != nil {
		failure := classifyPipelineFailure(err, "could not scrub PDF")
		handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageScrubbed, storageKey: input.StorageKey, outcome: failure.outcome, startedAt: startedAt})
		httpx.WriteError(w, failure.status, failure.message)
		return
	}
	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageScrubbed, storageKey: input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})

	if err := objectStorage.UploadSanitized(request.Context(), fileID, input.ETag, cleanedBytes); err != nil {
		writeUnexpectedFailure(w, err, "could not store scrubbed file")
		return
	}
	handler.presignScrubbed(w, scrubDownloadRequest{
		request: request, objectStorage: objectStorage, fileID: fileID,
		input: input, outcome: pipelineOutcomeSuccess, startedAt: startedAt,
	})
}

func decodeScrubRequest(w http.ResponseWriter, request *http.Request) (scrubRequest, string, bool) {
	var input scrubRequest
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err != nil || contentType != mediatype.JSON {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return scrubRequest{}, "", false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return scrubRequest{}, "", false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return scrubRequest{}, "", false
	}

	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid storage key")
		return scrubRequest{}, "", false
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid ETag")
		return scrubRequest{}, "", false
	}
	return input, fileID, true
}

func (handler *Handler) cleanSource(input sourceWorkflowRequest) ([]byte, error) {
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
	httpx.WriteJSON(w, http.StatusOK, scrubResponse{
		Status: "done",
		Result: scrubResponseResult{DownloadURL: grant.URL},
	})
}
