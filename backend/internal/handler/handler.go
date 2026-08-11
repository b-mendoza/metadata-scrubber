// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	// ProcessingPermitCount is the fixed, non-configurable capacity of the
	// server-owned PDF-processing admission gate.
	ProcessingPermitCount = 2

	maxJSONBodyBytes = 4 << 10
	maxFileNameBytes = 255

	storageKeyPrefix = "uploads/"

	uploadGrantExpiry       = 5 * time.Minute
	downloadGrantExpiry     = 15 * time.Minute
	defaultAdmissionTimeout = 2 * time.Second
	admissionRetryAfter     = "2"

	admissionTimeoutMessage = "processing capacity temporarily unavailable"
	cancellationMessage     = "request canceled"
)

var (
	errAdmissionTimeout = errors.New("admission timeout")
	storageKeyPattern   = regexp.MustCompile("^" + storageKeyPrefix + `([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`)
)

type (
	inspectPDFOperation func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error)
	cleanPDFOperation   func([]byte) ([]byte, error)
	entropyOperation    func([]byte) (int, error)
)

// Handler owns the process-lifetime dependencies shared by the JSON workflow.
type Handler struct {
	logger              *slog.Logger
	permits             chan struct{}
	inspect             inspectPDFOperation
	clean               cleanPDFOperation
	entropy             entropyOperation
	admissionTimeout    time.Duration
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
	Name             string `json:"name"`
	Label            string `json:"label"`
	Preview          string `json:"preview"`
	OriginalByteSize int    `json:"originalByteSize"`
	Action           string `json:"action"`
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

// New constructs the JSON workflow handler around one server-owned admission gate.
func New(logger *slog.Logger, permits chan struct{}) *Handler {
	return newHandler(logger, permits, scrub.InspectPDF, scrub.CleanPDF, rand.Read)
}

func newHandler(
	logger *slog.Logger,
	permits chan struct{},
	inspect inspectPDFOperation,
	clean cleanPDFOperation,
	entropy entropyOperation,
) *Handler {
	if logger == nil {
		logger = slog.Default()
	}
	if permits == nil || cap(permits) != ProcessingPermitCount {
		panic("handler admission gate must have capacity 2")
	}

	return &Handler{
		logger:              logger,
		permits:             permits,
		inspect:             inspect,
		clean:               clean,
		entropy:             entropy,
		admissionTimeout:    defaultAdmissionTimeout,
		beforeAcquireSelect: func() {},
	}
}

// Reachability gives callers a cheap way to verify the backend HTTP API is reachable.
func Reachability(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, reachabilityResponse{Status: "reachable"})
}

// Upload creates a private direct-upload grant for one generated logical file ID.
func (handler *Handler) Upload(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	var input uploadRequest
	if !decodeJSONRequest(w, request, &input) {
		return
	}
	if !validFileName(input.FileName) || input.FileSizeBytes <= 0 || input.FileSizeBytes > storage.MaxSourceObjectBytes {
		httpx.WriteError(w, http.StatusBadRequest, "invalid upload request")
		return
	}

	fileID, err := handler.newFileID()
	if err != nil {
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
		if writeCancellation(w, err) {
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "could not create upload")
		return
	}

	handler.logStage(request.Context(), "upload-created", storageKey, "success", startedAt)
	httpx.WriteJSON(w, http.StatusOK, uploadResponse{StorageKey: storageKey, UploadURL: grant.URL})
}
