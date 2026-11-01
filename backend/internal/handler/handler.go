// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/logkey"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

type (
	pipelineStage     string
	pipelineOutcome   string
	publicFieldAction string
)

const (
	// ProcessingPermitCount is the fixed, non-configurable capacity of the
	// server-owned PDF-processing admission gate.
	ProcessingPermitCount = 2

	maxJSONBodyBytes = 4 << 10
	maxFileNameBytes = 255

	storageKeyPrefix = "uploads/"

	uploadGrantExpiry         = 5 * time.Minute
	downloadGrantExpiry       = 15 * time.Minute
	defaultAdmissionTimeout   = 2 * time.Second
	admissionRetryBaseSeconds = 2
	admissionJitterMask       = 0b11
	admissionJitterRejected   = 3

	admissionTimeoutMessage = "processing capacity temporarily unavailable"
	cancellationMessage     = "request canceled"

	pipelineStageUploadCreated pipelineStage = "upload-created"
	pipelineStageSniffed       pipelineStage = "sniffed"
	pipelineStageDryRun        pipelineStage = "dry-run"
	pipelineStageScrubbed      pipelineStage = "scrubbed"
	pipelineStagePresigned     pipelineStage = "presigned"

	pipelineOutcomeSuccess         pipelineOutcome = "success"
	pipelineOutcomeAccepted        pipelineOutcome = "accepted"
	pipelineOutcomeRejected        pipelineOutcome = "rejected"
	pipelineOutcomeCacheHit        pipelineOutcome = "cache-hit"
	pipelineOutcomeCanceled        pipelineOutcome = "canceled"
	pipelineOutcomeNotFound        pipelineOutcome = "not-found"
	pipelineOutcomeTooLarge        pipelineOutcome = "too-large"
	pipelineOutcomeConflict        pipelineOutcome = "conflict"
	pipelineOutcomeNotPDF          pipelineOutcome = "not-pdf"
	pipelineOutcomeMalformed       pipelineOutcome = "malformed"
	pipelineOutcomeSigned          pipelineOutcome = "signed"
	pipelineOutcomeInspectionLimit pipelineOutcome = "inspection-limit"
	pipelineOutcomeFailed          pipelineOutcome = "failed"

	publicFieldActionRemove  publicFieldAction = "remove"
	publicFieldActionReplace publicFieldAction = "replace"
)

var (
	errAdmissionTimeout = errors.New("admission timeout")
	errNotPDF           = errors.New("not a PDF candidate")
	storageKeyPattern   = regexp.MustCompile("^" + storageKeyPrefix + `([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`)
)

// Handler owns the process-lifetime dependencies shared by the JSON workflow.
type Handler struct {
	logger *slog.Logger
	// An empty channel means every permit was returned.
	// A length of ProcessingPermitCount means the admission gate is saturated.
	permits          chan struct{}
	inspect          func(context.Context, []byte) ([]scrub.Field, error)
	clean            func(context.Context, []byte) ([]byte, error)
	admissionJitter  func() int
	now              func() time.Time
	admissionTimeout time.Duration
}

// New constructs the JSON workflow handler around one server-owned admission gate.
func New(logger *slog.Logger) *Handler {
	return &Handler{
		logger:           logger,
		permits:          make(chan struct{}, ProcessingPermitCount),
		inspect:          scrub.InspectPDF,
		clean:            scrub.CleanPDF,
		admissionJitter:  randomAdmissionJitter,
		now:              time.Now,
		admissionTimeout: defaultAdmissionTimeout,
	}
}

func randomAdmissionJitter() int {
	var randomByte [1]byte
	for {
		rand.Read(randomByte[:])
		value := randomByte[0] & admissionJitterMask
		if value != admissionJitterRejected {
			return int(value)
		}
	}
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func (handler *Handler) Reachability(w http.ResponseWriter, request *http.Request) {
	if err := writeJSON(w, http.StatusOK, reachabilityResponse{Status: "reachable"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
	}
}

// WorkflowConfig returns the backend-owned limits for the small-JSON workflow.
func (handler *Handler) WorkflowConfig(w http.ResponseWriter, request *http.Request) {
	if err := writeJSON(w, http.StatusOK, workflowConfigResponse{
		MaxFileSizeBytes: storage.MaxSourceObjectBytes,
	}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
	}
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
		handler.writeError(w, request, http.StatusServiceUnavailable, admissionTimeoutMessage)
		return
	}
	handler.writeError(w, request, http.StatusRequestTimeout, cancellationMessage)
}

func (handler *Handler) writeError(w http.ResponseWriter, request *http.Request, status int, message string) {
	if err := httpx.WriteError(w, status, message); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", slog.Any(logkey.Error, err))
	}
}
