package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/sniff"
	"metadata-scrubber/internal/storage"
)

// DryRun inspects the current source revision while holding shared admission.
func (handler *Handler) DryRun(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[dryRunRequest](handler, w, request)
	if !ok {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		handler.writeError(w, request, http.StatusBadRequest, "invalid storage key")
		return
	}
	requestBindings, _ := bindings.FromContext(request.Context())

	inspectWorkflow := inspectWorkflowRequest{
		request: request, objectStorage: requestBindings.Storage, fileID: fileID,
		storageKey: input.StorageKey, startedAt: startedAt,
	}
	release, err := handler.acquirePermit(request.Context())
	if err != nil {
		handler.writeAdmissionFailure(w, request, err)
		return
	}
	etag, inspectedFields, err := handler.inspectSource(inspectWorkflow, release)
	var fields []publicField
	if err == nil {
		fields, err = convertPublicFields(inspectedFields)
	}
	if err != nil {
		failure := classifyPipelineFailure(err, "could not inspect PDF")
		handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: failure.outcome, startedAt: startedAt})
		handler.writeError(w, request, failure.status, failure.message)
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageDryRun, storageKey: input.StorageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	if err := writeJSON(w, http.StatusOK, dryRunResponse{ETag: etag, Fields: fields}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		return
	}
	requestBindings.Events(request.Context(), "dry run completed")
}

type inspectWorkflowRequest struct {
	request       *http.Request
	objectStorage storage.Storage
	fileID        string
	storageKey    storageKey
	startedAt     time.Time
}

func (handler *Handler) inspectSource(inspectWorkflow inspectWorkflowRequest, release func()) (string, []scrub.Field, error) {
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

	fields, err := handler.inspect(inspectWorkflow.request.Context(), source.PDFBytes)
	if err != nil {
		return "", nil, err
	}
	return source.ETag, fields, nil
}

func convertPublicFields(inspectedFields []scrub.Field) ([]publicField, error) {
	fields := make([]publicField, 0, len(inspectedFields))
	for _, field := range inspectedFields {
		var action publicFieldAction
		switch field.Action {
		case scrub.ActionRemove:
			action = publicFieldActionRemove
		case scrub.ActionReplace:
			action = publicFieldActionReplace
		default:
			return nil, fmt.Errorf("unsupported field action %q", field.Action)
		}
		fields = append(fields, publicField{
			Name:             field.Name,
			Label:            field.Label,
			Preview:          field.Preview,
			OriginalByteSize: field.OriginalByteSize,
			Action:           action,
		})
	}
	return fields, nil
}
