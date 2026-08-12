package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func (handler *Handler) newFileID() (string, bool) {
	var uuidBytes [16]byte
	n, err := handler.entropy(uuidBytes[:])
	if err != nil || n != len(uuidBytes) {
		return "", false
	}
	uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40
	uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80

	return fmt.Sprintf("%x-%x-%x-%x-%x",
		uuidBytes[0:4], uuidBytes[4:6], uuidBytes[6:8], uuidBytes[8:10], uuidBytes[10:16]), true
}

func decodeJSONRequest(w http.ResponseWriter, request *http.Request, destination any) bool {
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err != nil || contentType != mediatype.JSON {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return false
	}
	return true
}

func validFileName(fileName string) bool {
	return len(fileName) <= maxFileNameBytes &&
		!strings.ContainsRune(fileName, utf8.RuneError) &&
		strings.TrimSpace(fileName) != "" &&
		!strings.ContainsAny(fileName, `/\`) &&
		!strings.ContainsFunc(fileName, unicode.IsControl)
}

func formatStorageKey(fileID string) string {
	return storageKeyPrefix + fileID
}

func parseStorageKey(storageKey string) (string, bool) {
	matches := storageKeyPattern.FindStringSubmatch(storageKey)
	if len(matches) != 2 {
		return "", false
	}
	return matches[1], true
}

func storageFromRequest(w http.ResponseWriter, request *http.Request) storage.Storage {
	requestBindings, ok := bindings.FromContext(request.Context())
	if !ok || requestBindings.Storage == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
		return nil
	}
	return requestBindings.Storage
}

func (handler *Handler) acquirePermit(ctx context.Context) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	admissionContext, cancel := context.WithTimeout(ctx, handler.admissionTimeout)
	defer cancel()
	handler.beforeAcquireSelect()
	select {
	case handler.permits <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-handler.permits
			return nil, err
		}
		return func() { <-handler.permits }, nil
	case <-admissionContext.Done():
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return nil, errAdmissionTimeout
	}
}

func writeAdmissionFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, errAdmissionTimeout) {
		w.Header().Set(header.RetryAfter, admissionRetryAfter)
		httpx.WriteError(w, http.StatusServiceUnavailable, admissionTimeoutMessage)
		return
	}
	writeUnexpectedFailure(w, err, "could not start PDF processing")
}

func writeUnexpectedFailure(w http.ResponseWriter, err error, internalMessage string) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage)
		return
	}
	httpx.WriteError(w, http.StatusInternalServerError, internalMessage)
}

type pipelineFailure struct {
	status  int
	message string
	outcome pipelineOutcome
}

func classifyPipelineFailure(err error, internalMessage string) pipelineFailure {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return pipelineFailure{http.StatusRequestTimeout, cancellationMessage, pipelineOutcomeCanceled}
	case errors.Is(err, storage.ErrSourceNotFound):
		return pipelineFailure{http.StatusNotFound, "source file not found", pipelineOutcomeNotFound}
	case errors.Is(err, storage.ErrSourceObjectTooLarge), errors.Is(err, scrub.ErrInputTooLarge):
		return pipelineFailure{http.StatusRequestEntityTooLarge, "source file exceeds 10 MB limit", pipelineOutcomeTooLarge}
	case errors.Is(err, storage.ErrSourceRevisionConflict):
		return pipelineFailure{http.StatusConflict, "source file changed since review", pipelineOutcomeConflict}
	case errors.Is(err, errNotPDF):
		return pipelineFailure{http.StatusUnsupportedMediaType, "file is not a PDF", pipelineOutcomeNotPDF}
	case errors.Is(err, scrub.ErrMalformedPDF):
		return pipelineFailure{http.StatusBadRequest, "invalid PDF", pipelineOutcomeMalformed}
	case errors.Is(err, scrub.ErrSignedPDF):
		return pipelineFailure{http.StatusUnprocessableEntity, "signed PDFs are not supported in v1", pipelineOutcomeSigned}
	case errors.Is(err, scrub.ErrInspectionLimit):
		return pipelineFailure{http.StatusBadRequest, "PDF metadata exceeds inspection limits", pipelineOutcomeInspectionLimit}
	default:
		return pipelineFailure{http.StatusInternalServerError, internalMessage, pipelineOutcomeFailed}
	}
}

func (handler *Handler) logStage(
	ctx context.Context,
	stage pipelineStage,
	storageKey string,
	outcome pipelineOutcome,
	startedAt time.Time,
) {
	// "failed" marks unclassified internal errors; every other outcome is expected traffic.
	level := slog.LevelInfo
	if outcome == pipelineOutcomeFailed {
		level = slog.LevelError
	}
	handler.logger.Log(
		ctx,
		level,
		string(stage),
		"storage_key", storageKey,
		"outcome", string(outcome),
		"duration_ms", time.Since(startedAt).Milliseconds(),
	)
}
