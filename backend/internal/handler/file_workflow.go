package handler

import (
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
	var input dryRunRequest
	if !decodeJSONRequest(w, request, &input) {
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

	release, err := acquirePermit(request.Context(), handler.permits, handler.admissionTimeout, handler.beforeAcquireSelect)
	if err != nil {
		handler.writeAdmissionFailure(w, err)
		return
	}

	etag, inspectedFields, err := func() (string, []scrub.Field, error) {
		defer release()

		source, downloadErr := objectStorage.DownloadSource(request.Context(), fileID, "")
		if downloadErr != nil {
			return "", nil, downloadErr
		}
		if !sniff.IsPDFCandidate(source.PDFBytes) {
			handler.logStage(request.Context(), "sniffed", input.StorageKey, "rejected", startedAt)
			return "", nil, errNotPDF
		}
		handler.logStage(request.Context(), "sniffed", input.StorageKey, "accepted", startedAt)

		fields, inspectErr := handler.inspect(source.PDFBytes, scrub.PublicInput)
		if inspectErr != nil {
			return "", nil, inspectErr
		}
		return source.ETag, fields, nil
	}()
	if err != nil {
		failure := classifyPipelineFailure(err, "could not inspect PDF")
		handler.logStage(request.Context(), "dry-run", input.StorageKey, failure.outcome, startedAt)
		httpx.WriteError(w, failure.status, failure.message)
		return
	}

	fields := make([]publicField, 0, len(inspectedFields))
	for _, field := range inspectedFields {
		fields = append(fields, publicField{
			Name:             field.Name,
			Label:            field.Label,
			Preview:          field.Preview,
			OriginalByteSize: field.OriginalByteSize,
			Action:           string(field.Action),
		})
	}

	handler.logStage(request.Context(), "dry-run", input.StorageKey, "success", startedAt)
	httpx.WriteJSON(w, http.StatusOK, dryRunResponse{ETag: etag, Fields: fields})
}

// Scrub cleans the exact reviewed source revision and returns its private download grant.
func (handler *Handler) Scrub(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	var input scrubRequest
	if !decodeJSONRequest(w, request, &input) {
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
		handler.presignScrubbed(w, request, objectStorage, fileID, input, "cache-hit", startedAt)
		return
	}

	release, err := acquirePermit(request.Context(), handler.permits, handler.admissionTimeout, handler.beforeAcquireSelect)
	if err != nil {
		handler.writeAdmissionFailure(w, err)
		return
	}

	cleanedBytes, err := func() ([]byte, error) {
		defer release()

		source, downloadErr := objectStorage.DownloadSource(request.Context(), fileID, input.ETag)
		if downloadErr != nil {
			return nil, downloadErr
		}
		if !sniff.IsPDFCandidate(source.PDFBytes) {
			handler.logStage(request.Context(), "sniffed", input.StorageKey, "rejected", startedAt)
			return nil, errNotPDF
		}
		handler.logStage(request.Context(), "sniffed", input.StorageKey, "accepted", startedAt)

		return handler.clean(source.PDFBytes)
	}()
	if err != nil {
		failure := classifyPipelineFailure(err, "could not scrub PDF")
		handler.logStage(request.Context(), "scrubbed", input.StorageKey, failure.outcome, startedAt)
		httpx.WriteError(w, failure.status, failure.message)
		return
	}
	handler.logStage(request.Context(), "scrubbed", input.StorageKey, "success", startedAt)

	if err := objectStorage.UploadSanitized(request.Context(), fileID, input.ETag, cleanedBytes); err != nil {
		writeUnexpectedFailure(w, err, "could not store scrubbed file")
		return
	}
	handler.presignScrubbed(w, request, objectStorage, fileID, input, "success", startedAt)
}

func (handler *Handler) presignScrubbed(
	w http.ResponseWriter,
	request *http.Request,
	objectStorage storage.Storage,
	fileID string,
	input scrubRequest,
	outcome string,
	startedAt time.Time,
) {
	grant, err := objectStorage.PresignSanitizedDownload(
		request.Context(),
		fileID,
		input.ETag,
		downloadGrantExpiry,
	)
	if err != nil {
		writeUnexpectedFailure(w, err, "could not create download")
		return
	}

	handler.logStage(request.Context(), "presigned", input.StorageKey, outcome, startedAt)
	httpx.WriteJSON(w, http.StatusOK, scrubResponse{
		Status: "done",
		Result: scrubResponseResult{DownloadURL: grant.URL},
	})
}
