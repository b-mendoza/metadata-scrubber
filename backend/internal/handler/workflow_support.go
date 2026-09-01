package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

const storageKeyDigestBytes = 6

func storageKeyDigest(storageKey string) string {
	digest := sha256.Sum256([]byte(storageKey))
	return hex.EncodeToString(digest[:storageKeyDigestBytes])
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

func (handler *Handler) storageFromRequest(w http.ResponseWriter, request *http.Request) storage.Storage {
	requestBindings, ok := bindings.FromContext(request.Context())
	if !ok || requestBindings.Storage == nil {
		if err := httpx.WriteError(w, http.StatusInternalServerError, "service unavailable"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
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

func (handler *Handler) writeAdmissionFailure(w http.ResponseWriter, request *http.Request, err error) {
	if errors.Is(err, errAdmissionTimeout) {
		w.Header().Set(header.RetryAfter, admissionRetryAfter)
		if writeErr := httpx.WriteError(w, http.StatusServiceUnavailable, admissionTimeoutMessage); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return
	}
	handler.writeUnexpectedFailure(w, request, err, "could not start PDF processing")
}

func (handler *Handler) writeUnexpectedFailure(w http.ResponseWriter, request *http.Request, err error, internalMessage string) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		if writeErr := httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
		}
		return
	}
	if writeErr := httpx.WriteError(w, http.StatusInternalServerError, internalMessage); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
}

type pipelineFailure struct {
	status  int
	message string
	outcome pipelineOutcome
}

type pipelineFailureClassification struct {
	matches func(error) bool
	failure pipelineFailure
}

var pipelineFailureClassifications = []pipelineFailureClassification{
	{
		matches: func(err error) bool {
			return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
		},
		failure: pipelineFailure{status: http.StatusRequestTimeout, message: cancellationMessage, outcome: pipelineOutcomeCanceled},
	},
	{
		matches: func(err error) bool { return errors.Is(err, storage.ErrSourceNotFound) },
		failure: pipelineFailure{status: http.StatusNotFound, message: "source file not found", outcome: pipelineOutcomeNotFound},
	},
	{
		matches: func(err error) bool {
			return errors.Is(err, storage.ErrSourceObjectTooLarge) || errors.Is(err, scrub.ErrInputTooLarge)
		},
		failure: pipelineFailure{status: http.StatusRequestEntityTooLarge, message: "source file exceeds 10 MiB limit", outcome: pipelineOutcomeTooLarge},
	},
	{
		matches: func(err error) bool { return errors.Is(err, storage.ErrSourceRevisionConflict) },
		failure: pipelineFailure{status: http.StatusConflict, message: "source file changed since review", outcome: pipelineOutcomeConflict},
	},
	{
		matches: func(err error) bool { return errors.Is(err, errNotPDF) },
		failure: pipelineFailure{status: http.StatusUnsupportedMediaType, message: "file is not a PDF", outcome: pipelineOutcomeNotPDF},
	},
	{
		matches: func(err error) bool { return errors.Is(err, scrub.ErrMalformedPDF) },
		failure: pipelineFailure{status: http.StatusBadRequest, message: "invalid PDF", outcome: pipelineOutcomeMalformed},
	},
	{
		matches: func(err error) bool { return errors.Is(err, scrub.ErrSignedPDF) },
		failure: pipelineFailure{status: http.StatusUnprocessableEntity, message: "signed PDFs are not supported in v1", outcome: pipelineOutcomeSigned},
	},
	{
		matches: func(err error) bool { return errors.Is(err, scrub.ErrInspectionLimit) },
		failure: pipelineFailure{status: http.StatusBadRequest, message: "PDF metadata exceeds inspection limits", outcome: pipelineOutcomeInspectionLimit},
	},
}

func classifyPipelineFailure(err error, internalMessage string) pipelineFailure {
	for _, classification := range pipelineFailureClassifications {
		if classification.matches(err) {
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
		"storage_key_digest", storageKeyDigest(event.storageKey),
		"outcome", string(event.outcome),
		"duration_ms", time.Since(event.startedAt).Milliseconds(),
	)
}
