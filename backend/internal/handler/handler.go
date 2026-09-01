// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math/big"
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

	inspectPDFOperation      func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error)
	cleanPDFOperation        func([]byte) ([]byte, error)
	entropyOperation         func([]byte) (int, error)
	admissionJitterOperation func() (int, error)
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
	admissionTimeout time.Duration
	// beforeAcquireSelect must stay a non-nil no-op in production: acquirePermit calls it
	// unconditionally, and only a test replaces it to observe the admission select.
	beforeAcquireSelect func()
}

type reachabilityResponse struct {
	Status string `json:"status"`
}

type workflowConfigResponse struct {
	MaxFileSizeBytes int `json:"maxFileSizeBytes"`
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

func writeJSON[T reachabilityResponse | workflowConfigResponse | uploadResponse | dryRunResponse | scrubResponse](
	w http.ResponseWriter,
	status int,
	body T,
) error {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(body)
}

func decodeJSONRequest[T uploadRequest | dryRunRequest | scrubRequest](
	logger *slog.Logger,
	w http.ResponseWriter,
	request *http.Request,
) (T, bool) {
	var zero T
	if !requestHasJSONMediaType(logger, w, request) {
		return zero, false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	stage := jsonDecodeStage{logger: logger, writer: w, request: request, decoder: decoder}
	var input T
	if !decodeJSONBody(stage, &input) {
		return zero, false
	}
	if !requestHasSingleJSONValue(logger, w, request, decoder) {
		return zero, false
	}
	return input, true
}

func requestHasJSONMediaType(logger *slog.Logger, w http.ResponseWriter, request *http.Request) bool {
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err == nil && contentType == mediatype.JSON {
		return true
	}
	if writeErr := httpx.WriteError(w, http.StatusUnsupportedMediaType, "Content-Type must be application/json"); writeErr != nil {
		logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
	return false
}

type jsonDecodeStage struct {
	logger  *slog.Logger
	writer  http.ResponseWriter
	request *http.Request
	decoder *json.Decoder
}

func decodeJSONBody[T uploadRequest | dryRunRequest | scrubRequest](stage jsonDecodeStage, destination *T) bool {
	if err := stage.decoder.Decode(destination); err == nil {
		return true
	}
	if writeErr := httpx.WriteError(stage.writer, http.StatusBadRequest, "invalid JSON request"); writeErr != nil {
		stage.logger.ErrorContext(stage.request.Context(), "could not write JSON response", "error", writeErr)
	}
	return false
}

func requestHasSingleJSONValue(
	logger *slog.Logger,
	w http.ResponseWriter,
	request *http.Request,
	decoder *json.Decoder,
) bool {
	if err := decoder.Decode(&struct{}{}); errors.Is(err, io.EOF) {
		return true
	}
	if writeErr := httpx.WriteError(w, http.StatusBadRequest, "invalid JSON request"); writeErr != nil {
		logger.ErrorContext(request.Context(), "could not write JSON response", "error", writeErr)
	}
	return false
}

type handlerOperations struct {
	inspect         inspectPDFOperation
	clean           cleanPDFOperation
	entropy         entropyOperation
	admissionJitter admissionJitterOperation
}

// New constructs the JSON workflow handler around one server-owned admission gate.
func New(logger *slog.Logger, permits chan struct{}) *Handler {
	return newHandler(logger, permits, handlerOperations{
		inspect:         scrub.InspectPDF,
		clean:           scrub.CleanPDF,
		entropy:         rand.Read,
		admissionJitter: randomAdmissionJitter,
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

	return &Handler{
		logger:              logger,
		permits:             permits,
		inspect:             operations.inspect,
		clean:               operations.clean,
		entropy:             operations.entropy,
		admissionJitter:     operations.admissionJitter,
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
	if validFileName(input.FileName) && input.FileSizeBytes > 0 && input.FileSizeBytes <= storage.MaxSourceObjectBytes {
		return true
	}
	if err := httpx.WriteError(w, http.StatusBadRequest, "invalid upload request"); err != nil {
		handler.logger.ErrorContext(request.Context(), "could not write JSON response", "error", err)
	}
	return false
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
