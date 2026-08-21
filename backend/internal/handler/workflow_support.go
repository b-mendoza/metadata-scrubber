package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func (handler *Handler) newFileID() (string, bool) {
	var uuidBytes [16]byte
	n, err := handler.entropy(uuidBytes[:])
	if err != nil || n != len(uuidBytes) {
		return "", false
	}
	// The RFC 9562 version and variant bits are the contract with storageKeyPattern, which admits only UUIDv4 keys.
	uuidBytes[6] = (uuidBytes[6] & uuidVersionMask) | uuidVersionFour
	uuidBytes[8] = (uuidBytes[8] & uuidVariantMask) | uuidVariantRFC

	return fmt.Sprintf("%x-%x-%x-%x-%x",
		uuidBytes[0:4], uuidBytes[4:6], uuidBytes[6:8], uuidBytes[8:10], uuidBytes[10:16]), true
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

func convertPublicFieldAction(action scrub.FieldAction) (publicFieldAction, error) {
	switch action {
	case scrub.ActionRemove:
		return publicFieldActionRemove, nil
	case scrub.ActionReplace:
		return publicFieldActionReplace, nil
	default:
		return "", fmt.Errorf("unsupported field action %q", action)
	}
}

func convertPublicFields(inspectedFields []scrub.Field) ([]publicField, error) {
	fields := make([]publicField, 0, len(inspectedFields))
	for _, field := range inspectedFields {
		action, err := convertPublicFieldAction(field.Action)
		if err != nil {
			return nil, err
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
	classifications := [...]struct {
		matches func() bool
		failure pipelineFailure
	}{
		{
			matches: func() bool {
				return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
			},
			failure: pipelineFailure{status: http.StatusRequestTimeout, message: cancellationMessage, outcome: pipelineOutcomeCanceled},
		},
		{
			matches: func() bool { return errors.Is(err, storage.ErrSourceNotFound) },
			failure: pipelineFailure{status: http.StatusNotFound, message: "source file not found", outcome: pipelineOutcomeNotFound},
		},
		{
			matches: func() bool {
				return errors.Is(err, storage.ErrSourceObjectTooLarge) || errors.Is(err, scrub.ErrInputTooLarge)
			},
			failure: pipelineFailure{status: http.StatusRequestEntityTooLarge, message: "source file exceeds 10 MB limit", outcome: pipelineOutcomeTooLarge},
		},
		{
			matches: func() bool { return errors.Is(err, storage.ErrSourceRevisionConflict) },
			failure: pipelineFailure{status: http.StatusConflict, message: "source file changed since review", outcome: pipelineOutcomeConflict},
		},
		{
			matches: func() bool { return errors.Is(err, errNotPDF) },
			failure: pipelineFailure{status: http.StatusUnsupportedMediaType, message: "file is not a PDF", outcome: pipelineOutcomeNotPDF},
		},
		{
			matches: func() bool { return errors.Is(err, scrub.ErrMalformedPDF) },
			failure: pipelineFailure{status: http.StatusBadRequest, message: "invalid PDF", outcome: pipelineOutcomeMalformed},
		},
		{
			matches: func() bool { return errors.Is(err, scrub.ErrSignedPDF) },
			failure: pipelineFailure{status: http.StatusUnprocessableEntity, message: "signed PDFs are not supported in v1", outcome: pipelineOutcomeSigned},
		},
		{
			matches: func() bool { return errors.Is(err, scrub.ErrInspectionLimit) },
			failure: pipelineFailure{status: http.StatusBadRequest, message: "PDF metadata exceeds inspection limits", outcome: pipelineOutcomeInspectionLimit},
		},
	}
	for _, classification := range classifications {
		if classification.matches() {
			return classification.failure
		}
	}
	return pipelineFailure{
		status:  http.StatusInternalServerError,
		message: internalMessage,
		outcome: pipelineOutcomeFailed,
	}
}

type pipelineLogEvent struct {
	ctx        context.Context
	stage      pipelineStage
	storageKey string
	outcome    pipelineOutcome
	startedAt  time.Time
}

func (handler *Handler) logStage(event pipelineLogEvent) {
	// "failed" marks unclassified internal errors; every other outcome is expected traffic.
	level := slog.LevelInfo
	if event.outcome == pipelineOutcomeFailed {
		level = slog.LevelError
	}
	handler.logger.Log(
		event.ctx,
		level,
		string(event.stage),
		"storage_key", event.storageKey,
		"outcome", string(event.outcome),
		"duration_ms", time.Since(event.startedAt).Milliseconds(),
	)
}
