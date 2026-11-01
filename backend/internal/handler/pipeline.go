package handler

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func (handler *Handler) writeUnexpectedFailure(w http.ResponseWriter, request *http.Request, err error, internalMessage string) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		handler.writeError(w, request, http.StatusRequestTimeout, cancellationMessage)
		return
	}
	// Provider error text can contain private object URLs and storage keys.
	handler.logger.ErrorContext(request.Context(), "request failed", slog.String(logkey.Failure, internalMessage))
	handler.writeError(w, request, http.StatusInternalServerError, internalMessage)
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
