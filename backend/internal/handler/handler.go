// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

type (
	pipelineStage     string
	pipelineOutcome   string
	publicFieldAction string

	inspectPDFOperation func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error)
	cleanPDFOperation   func([]byte) ([]byte, error)
	entropyOperation    func([]byte) (int, error)
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

	uploadGrantExpiry       = 5 * time.Minute
	downloadGrantExpiry     = 15 * time.Minute
	defaultAdmissionTimeout = 2 * time.Second
	admissionRetryAfter     = "2"

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
	admissionTimeout time.Duration
	// beforeAcquireSelect must stay a non-nil no-op in production: acquirePermit calls it
	// unconditionally, and only a test replaces it to observe the admission select.
	beforeAcquireSelect func()
}

type reachabilityResponse struct {
	Status string `json:"status"`
}

type uploadRequest struct {
	FileName      string `json:"fileName"`
	FileSizeBytes int64  `json:"fileSizeBytes"`
}

type uploadResponse struct {
	StorageKey string `json:"storageKey"`
	UploadURL  string `json:"uploadUrl"`
}

type dryRunRequest struct {
	StorageKey string `json:"storageKey"`
}

type publicField struct {
	Name             string            `json:"name"`
	Label            string            `json:"label"`
	Preview          string            `json:"preview"`
	OriginalByteSize int               `json:"originalByteSize"`
	Action           publicFieldAction `json:"action"`
}

type dryRunResponse struct {
	ETag   string        `json:"etag"`
	Fields []publicField `json:"fields"`
}

type scrubRequest struct {
	StorageKey string `json:"storageKey"`
	ETag       string `json:"etag"`
}

type scrubResponse struct {
	Status string              `json:"status"`
	Result scrubResponseResult `json:"result"`
}

type scrubResponseResult struct {
	DownloadURL string `json:"downloadUrl"`
}

func writeJSON[T reachabilityResponse | uploadResponse | dryRunResponse | scrubResponse](
	w http.ResponseWriter,
	status int,
	body T,
) {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type handlerOperations struct {
	inspect inspectPDFOperation
	clean   cleanPDFOperation
	entropy entropyOperation
}

// New constructs the JSON workflow handler around one server-owned admission gate.
func New(logger *slog.Logger, permits chan struct{}) *Handler {
	return newHandler(logger, permits, handlerOperations{
		inspect: scrub.InspectPDF,
		clean:   scrub.CleanPDF,
		entropy: rand.Read,
	})
}

func newHandler(logger *slog.Logger, permits chan struct{}, operations handlerOperations) *Handler {
	if logger == nil {
		logger = slog.Default()
	}
	if permits == nil || cap(permits) != ProcessingPermitCount {
		panic("handler admission gate must have capacity 2")
	}
	if operations.inspect == nil {
		panic("handler inspect operation must not be nil")
	}
	if operations.clean == nil {
		panic("handler clean operation must not be nil")
	}
	if operations.entropy == nil {
		panic("handler entropy operation must not be nil")
	}

	return &Handler{
		logger:              logger,
		permits:             permits,
		inspect:             operations.inspect,
		clean:               operations.clean,
		entropy:             operations.entropy,
		admissionTimeout:    defaultAdmissionTimeout,
		beforeAcquireSelect: func() {},
	}
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, reachabilityResponse{Status: "reachable"})
}

func decodeUploadRequest(w http.ResponseWriter, request *http.Request) (uploadRequest, bool) {
	var input uploadRequest
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err != nil || contentType != mediatype.JSON {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
		return uploadRequest{}, false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return uploadRequest{}, false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request")
		return uploadRequest{}, false
	}
	return input, true
}

// Upload creates a private direct-upload grant for one generated logical file ID.
func (handler *Handler) Upload(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	input, ok := decodeUploadRequest(w, request)
	if !ok {
		return
	}
	if !validFileName(input.FileName) || input.FileSizeBytes <= 0 || input.FileSizeBytes > storage.MaxSourceObjectBytes {
		httpx.WriteError(w, http.StatusBadRequest, "invalid upload request")
		return
	}

	fileID, ok := handler.newFileID()
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "could not create upload")
		return
	}
	storageKey := formatStorageKey(fileID)
	objectStorage := storageFromRequest(w, request)
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
		writeUnexpectedFailure(w, err, "could not create upload")
		return
	}

	handler.logStage(pipelineLogEvent{ctx: request.Context(), stage: pipelineStageUploadCreated, storageKey: storageKey, outcome: pipelineOutcomeSuccess, startedAt: startedAt})
	writeJSON(w, http.StatusOK, uploadResponse{StorageKey: storageKey, UploadURL: grant.URL})
}
