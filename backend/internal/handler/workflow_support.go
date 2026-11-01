package handler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func validFileName(fileName string) bool {
	return len(fileName) <= maxFileNameBytes &&
		!strings.ContainsRune(fileName, utf8.RuneError) &&
		strings.TrimSpace(fileName) != "" &&
		!strings.ContainsAny(fileName, `/\`) &&
		!strings.ContainsFunc(fileName, unicode.IsControl)
}

const storageKeyDigestBytes = 6

// storageKey is the public file reference. It can identify a stored object, so
// logs must record its digest and not its value.
type storageKey string

// digest returns a short hash that lets logs follow one file without exposing its key.
func (key storageKey) digest() string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:storageKeyDigestBytes])
}

func parseStorageKey(key storageKey) (string, bool) {
	matches := storageKeyPattern.FindStringSubmatch(string(key))
	if len(matches) != 2 {
		return "", false
	}
	return matches[1], true
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

// bindingsFromRequest writes a server failure and returns false when the
// bindings middleware did not run.
func (handler *Handler) bindingsFromRequest(w http.ResponseWriter, request *http.Request) (bindings.Bindings, bool) {
	requestBindings, ok := bindings.FromContext(request.Context())
	if !ok {
		if err := httpx.WriteError(w, http.StatusInternalServerError, "service unavailable"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
		}
		return bindings.Bindings{}, false
	}
	return requestBindings, true
}

func (handler *Handler) acquirePermit(ctx context.Context) (func(), error) {
	admissionContext, cancel := context.WithTimeout(ctx, handler.admissionTimeout)
	defer cancel()
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
		w.Header().Set(header.RetryAfter, strconv.Itoa(admissionRetryBaseSeconds+handler.admissionJitter()))
		if writeErr := httpx.WriteError(w, http.StatusServiceUnavailable, admissionTimeoutMessage); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
		}
		return
	}
	if writeErr := httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
	}
}

func (handler *Handler) writeUnexpectedFailure(w http.ResponseWriter, request *http.Request, err error, internalMessage string) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		if writeErr := httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage); writeErr != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
		}
		return
	}
	// Provider error text can contain private object URLs and storage keys.
	handler.logger.ErrorContext(request.Context(), "request failed", slog.String(logkey.Failure, internalMessage))
	if writeErr := httpx.WriteError(w, http.StatusInternalServerError, internalMessage); writeErr != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, writeErr))
	}
}

type pipelineFailure struct {
	status  int
	message string
	outcome pipelineOutcome
}

type pipelineFailureClassification struct {
	sentinel error
	failure  pipelineFailure
}

var pipelineFailureClassifications = []pipelineFailureClassification{
	{
		sentinel: context.Canceled,
		failure:  pipelineFailure{status: http.StatusRequestTimeout, message: cancellationMessage, outcome: pipelineOutcomeCanceled},
	},
	{
		sentinel: context.DeadlineExceeded,
		failure:  pipelineFailure{status: http.StatusRequestTimeout, message: cancellationMessage, outcome: pipelineOutcomeCanceled},
	},
	{
		sentinel: storage.ErrSourceNotFound,
		failure:  pipelineFailure{status: http.StatusNotFound, message: "source file not found", outcome: pipelineOutcomeNotFound},
	},
	{
		sentinel: storage.ErrSourceObjectTooLarge,
		failure:  pipelineFailure{status: http.StatusRequestEntityTooLarge, message: "source file exceeds 10 MiB limit", outcome: pipelineOutcomeTooLarge},
	},
	{
		sentinel: scrub.ErrInputTooLarge,
		failure:  pipelineFailure{status: http.StatusRequestEntityTooLarge, message: "source file exceeds 10 MiB limit", outcome: pipelineOutcomeTooLarge},
	},
	{
		sentinel: storage.ErrSourceRevisionConflict,
		failure:  pipelineFailure{status: http.StatusConflict, message: "source file changed since review", outcome: pipelineOutcomeConflict},
	},
	{
		sentinel: errNotPDF,
		failure:  pipelineFailure{status: http.StatusUnsupportedMediaType, message: "file is not a PDF", outcome: pipelineOutcomeNotPDF},
	},
	{
		sentinel: scrub.ErrMalformedPDF,
		failure:  pipelineFailure{status: http.StatusBadRequest, message: "invalid PDF", outcome: pipelineOutcomeMalformed},
	},
	{
		sentinel: scrub.ErrSignedPDF,
		failure:  pipelineFailure{status: http.StatusUnprocessableEntity, message: "signed PDFs are not supported in v1", outcome: pipelineOutcomeSigned},
	},
	{
		sentinel: scrub.ErrInspectionLimit,
		failure:  pipelineFailure{status: http.StatusBadRequest, message: "PDF metadata exceeds inspection limits", outcome: pipelineOutcomeInspectionLimit},
	},
}

func classifyPipelineFailure(err error, internalMessage string) pipelineFailure {
	for _, classification := range pipelineFailureClassifications {
		if errors.Is(err, classification.sentinel) {
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
	storageKey storageKey
	outcome    pipelineOutcome
	startedAt  time.Time
}

func (handler *Handler) logStage(event pipelineLogEvent) {
	// "failed" marks unclassified internal errors; every other outcome is expected traffic.
	level := slog.LevelInfo
	if event.outcome == pipelineOutcomeFailed {
		level = slog.LevelError
	}
	handler.logger.LogAttrs(
		event.ctx,
		level,
		"pipeline stage",
		slog.String(logkey.Stage, string(event.stage)),
		slog.String(logkey.StorageKeyDigest, event.storageKey.digest()),
		slog.String(logkey.Outcome, string(event.outcome)),
		slog.Int64(logkey.DurationMS, time.Since(event.startedAt).Milliseconds()),
	)
}
