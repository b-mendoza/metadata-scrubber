// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"crypto/rand"
	"errors"
	"log/slog"
	"math/big"
	"net/http"
	"regexp"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

type (
	pipelineStage     string
	pipelineOutcome   string
	publicFieldAction string

	inspectPDFOperation      func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error)
	cleanPDFOperation        func([]byte) ([]byte, error)
	entropyOperation         func([]byte) (int, error)
	admissionJitterOperation func() (int, error)
	clockOperation           func() time.Time
)

const (
	// ProcessingPermitCount is the fixed, non-configurable capacity of the
	// server-owned PDF-processing admission gate.
	ProcessingPermitCount = 2

	maxJSONBodyBytes = 4 << 10
	maxFileNameBytes = 255

	uuidVersionMask = 0x0f
	uuidVersionFour = 0x40
	uuidVariantMask = 0x3f
	uuidVariantRFC  = 0x80

	storageKeyPrefix = "uploads/"

	uploadGrantExpiry         = 5 * time.Minute
	downloadGrantExpiry       = 15 * time.Minute
	defaultAdmissionTimeout   = 2 * time.Second
	admissionRetryBaseSeconds = 2
	admissionJitterValues     = 3

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
	errAdmissionFailure = errors.New("admission failure")
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
	inspect          inspectPDFOperation
	clean            cleanPDFOperation
	entropy          entropyOperation
	admissionJitter  admissionJitterOperation
	now              clockOperation
	admissionTimeout time.Duration
	// beforeAcquireSelect must stay a non-nil no-op in production: acquirePermit calls it
	// unconditionally, and only a test replaces it to observe the admission select.
	beforeAcquireSelect func()
}

type handlerOperations struct {
	inspect         inspectPDFOperation
	clean           cleanPDFOperation
	entropy         entropyOperation
	admissionJitter admissionJitterOperation
	now             clockOperation
}

// New constructs the JSON workflow handler around one server-owned admission gate.
func New(logger *slog.Logger, permits chan struct{}) *Handler {
	return newHandler(logger, permits, handlerOperations{
		inspect:         scrub.InspectPDF,
		clean:           scrub.CleanPDF,
		entropy:         rand.Read,
		admissionJitter: randomAdmissionJitter,
		now:             time.Now,
	})
}

func randomAdmissionJitter() (int, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(admissionJitterValues))
	if err != nil {
		return 0, err
	}
	return int(value.Int64()), nil
}

func newHandler(logger *slog.Logger, permits chan struct{}, operations handlerOperations) *Handler {
	if logger == nil {
		logger = slog.Default()
	}
	if permits == nil || cap(permits) != ProcessingPermitCount {
		panic("handler admission gate must have capacity 2")
	}
	if operations.admissionJitter == nil {
		operations.admissionJitter = randomAdmissionJitter
	}
	if operations.now == nil {
		operations.now = time.Now
	}

	return &Handler{
		logger:              logger,
		permits:             permits,
		inspect:             operations.inspect,
		clean:               operations.clean,
		entropy:             operations.entropy,
		admissionJitter:     operations.admissionJitter,
		now:                 operations.now,
		admissionTimeout:    defaultAdmissionTimeout,
		beforeAcquireSelect: func() {},
	}
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func (handler *Handler) Reachability(w http.ResponseWriter, request *http.Request) {
	if err := writeJSON(w, http.StatusOK, reachabilityResponse{Status: "reachable"}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

// Upload creates a private direct-upload grant for one generated logical file ID.
func (handler *Handler) Upload(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeJSONRequest[uploadRequest](handler.logger, w, request)
	if !ok {
		return
	}
	if !handler.validateUploadRequest(w, request, input) {
		return
	}

	fileID, ok := handler.generateUploadFileID(w, request)
	if !ok {
		return
	}
	storageKey := formatStorageKey(fileID)
	objectStorage := handler.storageFromRequest(w, request)
	if objectStorage == nil {
		return
	}

	grant, err := objectStorage.PresignSourceUpload(
		request.Context(),
		fileID,
		input.FileSizeBytes,
		uploadGrantExpiry,
	)
	if err != nil {
		handler.writeUnexpectedFailure(w, request, err, "could not create upload")
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageUploadCreated, storageKey: storageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	if err := writeJSON(w, http.StatusOK, uploadResponse{StorageKey: storageKey, UploadURL: grant.URL}); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
}

func (handler *Handler) validateUploadRequest(w http.ResponseWriter, request *http.Request, input uploadRequest) bool {
	if !validFileName(input.FileName) || input.FileSizeBytes <= 0 {
		if err := httpx.WriteError(w, http.StatusBadRequest, "invalid upload request"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return false
	}
	if input.FileSizeBytes > storage.MaxSourceObjectBytes {
		if err := httpx.WriteError(w, http.StatusRequestEntityTooLarge, "source file exceeds 10 MiB limit"); err != nil {
			handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
		}
		return false
	}
	return true
}

func (handler *Handler) generateUploadFileID(w http.ResponseWriter, request *http.Request) (string, bool) {
	fileID, ok := handler.newFileID()
	if ok {
		return fileID, true
	}
	if err := httpx.WriteError(w, http.StatusInternalServerError, "could not create upload"); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
	return "", false
}
