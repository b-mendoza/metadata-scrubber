// Package handler implements the HTTP endpoints for the metadata scrubber API.
package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/sniff"
	"metadata-scrubber/internal/storage"
)

const (
	maxJSONBodyBytes = 4 << 10
	maxFileNameBytes = 255

	uploadGrantExpiry   = 5 * time.Minute
	downloadGrantExpiry = 15 * time.Minute
	admissionTimeout    = 2 * time.Second
	admissionRetryAfter = "2"

	admissionTimeoutMessage = "processing capacity temporarily unavailable"
	cancellationMessage     = "request canceled"
)

var (
	errAdmissionTimeout = errors.New("admission timeout")
	storageKeyPattern   = regexp.MustCompile(`^uploads/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`)
)

type (
	inspectPDFOperation func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error)
	cleanPDFOperation   func([]byte) ([]byte, error)
	entropyOperation    func([]byte) (int, error)
	acquireOperation    func(context.Context, chan struct{}, func()) (func(), error)
)

// Handler owns the process-lifetime dependencies shared by the JSON workflow.
type Handler struct {
	logger              *slog.Logger
	permits             chan struct{}
	inspect             inspectPDFOperation
	clean               cleanPDFOperation
	entropy             entropyOperation
	acquire             acquireOperation
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

type guardedDryRunResult struct {
	etag   string
	fields []scrub.Field
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
	if permits == nil || cap(permits) != 2 {
		panic("handler admission gate must have capacity 2")
	}

	return &Handler{
		logger:              logger,
		permits:             permits,
		inspect:             inspect,
		clean:               clean,
		entropy:             entropy,
		acquire:             acquirePermit,
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
	objectStorage, ok := storageFromRequest(request)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
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

// DryRun inspects the current source revision while holding shared admission.
func (handler *Handler) DryRun(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	var input dryRunRequest
	if !decodeJSONRequest(w, request, &input) {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid storage key")
		return
	}
	objectStorage, ok := storageFromRequest(request)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
		return
	}

	release, err := handler.acquire(request.Context(), handler.permits, handler.beforeAcquireSelect)
	if err != nil {
		handler.writeAdmissionFailure(w, err)
		return
	}

	result, err := func() (guardedDryRunResult, error) {
		defer release()

		source, downloadErr := objectStorage.DownloadSource(request.Context(), fileID, "")
		if downloadErr != nil {
			return guardedDryRunResult{}, downloadErr
		}
		if !sniff.IsPDFCandidate(source.PDFBytes) {
			handler.logStage(request.Context(), "sniffed", input.StorageKey, "rejected", startedAt)
			return guardedDryRunResult{}, errNotPDF
		}
		handler.logStage(request.Context(), "sniffed", input.StorageKey, "accepted", startedAt)

		fields, inspectErr := handler.inspect(source.PDFBytes, scrub.PublicInput)
		if inspectErr != nil {
			return guardedDryRunResult{}, inspectErr
		}
		return guardedDryRunResult{etag: source.ETag, fields: fields}, nil
	}()
	if err != nil {
		handler.logStage(request.Context(), "dry-run", input.StorageKey, pdfOutcome(err), startedAt)
		writePipelineFailure(w, err, "could not inspect PDF")
		return
	}

	fields := make([]publicField, 0, len(result.fields))
	for _, field := range result.fields {
		fields = append(fields, publicField{
			Name:             field.Name,
			Label:            field.Label,
			Preview:          field.Preview,
			OriginalByteSize: field.OriginalByteSize,
			Action:           string(field.Action),
		})
	}

	handler.logStage(request.Context(), "dry-run", input.StorageKey, "success", startedAt)
	httpx.WriteJSON(w, http.StatusOK, dryRunResponse{ETag: result.etag, Fields: fields})
}

// Scrub cleans the exact reviewed source revision and returns its private download grant.
func (handler *Handler) Scrub(w http.ResponseWriter, request *http.Request) {
	startedAt := time.Now()
	var input scrubRequest
	if !decodeJSONRequest(w, request, &input) {
		return
	}
	fileID, ok := parseStorageKey(input.StorageKey)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "invalid storage key")
		return
	}
	if _, err := storage.SanitizedObjectKey(fileID, input.ETag); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid ETag")
		return
	}
	objectStorage, ok := storageFromRequest(request)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
		return
	}

	exists, err := objectStorage.SanitizedExists(request.Context(), fileID, input.ETag)
	if err != nil {
		if writeCancellation(w, err) {
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "could not check scrubbed file")
		return
	}
	if exists {
		handler.presignScrubbed(w, request, fileID, input, "cache-hit", startedAt)
		return
	}

	release, err := handler.acquire(request.Context(), handler.permits, handler.beforeAcquireSelect)
	if err != nil {
		handler.writeAdmissionFailure(w, err)
		return
	}

	cleanedBytes, err := func() ([]byte, error) {
		defer release()

		source, downloadErr := objectStorage.DownloadSource(request.Context(), fileID, input.ETag)
		if downloadErr != nil {
			return nil, downloadErr
		}
		if !sniff.IsPDFCandidate(source.PDFBytes) {
			handler.logStage(request.Context(), "sniffed", input.StorageKey, "rejected", startedAt)
			return nil, errNotPDF
		}
		handler.logStage(request.Context(), "sniffed", input.StorageKey, "accepted", startedAt)

		return handler.clean(source.PDFBytes)
	}()
	if err != nil {
		handler.logStage(request.Context(), "scrubbed", input.StorageKey, pdfOutcome(err), startedAt)
		writePipelineFailure(w, err, "could not scrub PDF")
		return
	}
	handler.logStage(request.Context(), "scrubbed", input.StorageKey, "success", startedAt)

	if err := objectStorage.UploadSanitized(request.Context(), fileID, input.ETag, cleanedBytes); err != nil {
		if writeCancellation(w, err) {
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "could not store scrubbed file")
		return
	}
	handler.presignScrubbed(w, request, fileID, input, "success", startedAt)
}

var errNotPDF = errors.New("not a PDF candidate")

func (handler *Handler) presignScrubbed(
	w http.ResponseWriter,
	request *http.Request,
	fileID string,
	input scrubRequest,
	outcome string,
	startedAt time.Time,
) {
	objectStorage, ok := storageFromRequest(request)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
		return
	}
	grant, err := objectStorage.PresignSanitizedDownload(
		request.Context(),
		fileID,
		input.ETag,
		downloadGrantExpiry,
	)
	if err != nil {
		if writeCancellation(w, err) {
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "could not create download")
		return
	}

	handler.logStage(request.Context(), "presigned", input.StorageKey, outcome, startedAt)
	httpx.WriteJSON(w, http.StatusOK, scrubResponse{
		Status: "done",
		Result: scrubResponseResult{DownloadURL: grant.URL},
	})
}

func (handler *Handler) newFileID() (string, error) {
	var uuidBytes [16]byte
	n, err := handler.entropy(uuidBytes[:])
	if err != nil || n != len(uuidBytes) {
		return "", errors.New("could not generate file ID")
	}
	uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40
	uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80

	encoded := make([]byte, 36)
	hex.Encode(encoded[0:8], uuidBytes[0:4])
	encoded[8] = '-'
	hex.Encode(encoded[9:13], uuidBytes[4:6])
	encoded[13] = '-'
	hex.Encode(encoded[14:18], uuidBytes[6:8])
	encoded[18] = '-'
	hex.Encode(encoded[19:23], uuidBytes[8:10])
	encoded[23] = '-'
	hex.Encode(encoded[24:36], uuidBytes[10:16])
	return string(encoded), nil
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
	if fileName == "" ||
		len(fileName) > maxFileNameBytes ||
		!utf8.ValidString(fileName) ||
		strings.ContainsRune(fileName, utf8.RuneError) {
		return false
	}
	if strings.TrimSpace(fileName) == "" || strings.ContainsAny(fileName, `/\`) {
		return false
	}
	return strings.IndexFunc(fileName, unicode.IsControl) < 0
}

func formatStorageKey(fileID string) string {
	return "uploads/" + fileID
}

func parseStorageKey(storageKey string) (string, bool) {
	matches := storageKeyPattern.FindStringSubmatch(storageKey)
	if len(matches) != 2 {
		return "", false
	}
	return matches[1], true
}

func storageFromRequest(request *http.Request) (storage.Storage, bool) {
	requestBindings, ok := bindings.FromContext(request.Context())
	return requestBindings.Storage, ok && requestBindings.Storage != nil
}

func acquirePermit(ctx context.Context, permits chan struct{}, beforeSelect func()) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	timer := time.NewTimer(admissionTimeout)
	beforeSelect()
	select {
	case permits <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-permits
			stopTimer(timer)
			return nil, err
		}
		if !timer.Stop() {
			select {
			case <-timer.C:
				<-permits
				return nil, errAdmissionTimeout
			default:
			}
		}
		return func() { <-permits }, nil
	case <-timer.C:
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return nil, errAdmissionTimeout
	case <-ctx.Done():
		stopTimer(timer)
		return nil, ctx.Err()
	}
}

func stopTimer(timer *time.Timer) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
}

func (handler *Handler) writeAdmissionFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, errAdmissionTimeout) {
		w.Header().Set(header.RetryAfter, admissionRetryAfter)
		httpx.WriteError(w, http.StatusServiceUnavailable, admissionTimeoutMessage)
		return
	}
	if writeCancellation(w, err) {
		return
	}
	httpx.WriteError(w, http.StatusInternalServerError, "could not start PDF processing")
}

func writeCancellation(w http.ResponseWriter, err error) bool {
	if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	httpx.WriteError(w, http.StatusRequestTimeout, cancellationMessage)
	return true
}

func writePipelineFailure(w http.ResponseWriter, err error, internalMessage string) {
	switch {
	case writeCancellation(w, err):
	case errors.Is(err, storage.ErrSourceNotFound):
		httpx.WriteError(w, http.StatusNotFound, "source file not found")
	case errors.Is(err, storage.ErrSourceObjectTooLarge), errors.Is(err, scrub.ErrInputTooLarge):
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "source file exceeds 10 MB limit")
	case errors.Is(err, storage.ErrSourceRevisionConflict):
		httpx.WriteError(w, http.StatusConflict, "source file changed since review")
	case errors.Is(err, errNotPDF):
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "file is not a PDF")
	case errors.Is(err, scrub.ErrMalformedPDF):
		httpx.WriteError(w, http.StatusBadRequest, "invalid PDF")
	case errors.Is(err, scrub.ErrSignedPDF):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "signed PDFs are not supported in v1")
	case errors.Is(err, scrub.ErrInspectionLimit):
		httpx.WriteError(w, http.StatusBadRequest, "PDF metadata exceeds inspection limits")
	default:
		httpx.WriteError(w, http.StatusInternalServerError, internalMessage)
	}
}

func pdfOutcome(err error) string {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return "canceled"
	case errors.Is(err, storage.ErrSourceNotFound):
		return "not-found"
	case errors.Is(err, storage.ErrSourceObjectTooLarge), errors.Is(err, scrub.ErrInputTooLarge):
		return "too-large"
	case errors.Is(err, storage.ErrSourceRevisionConflict):
		return "conflict"
	case errors.Is(err, errNotPDF):
		return "not-pdf"
	case errors.Is(err, scrub.ErrMalformedPDF):
		return "malformed"
	case errors.Is(err, scrub.ErrSignedPDF):
		return "signed"
	case errors.Is(err, scrub.ErrInspectionLimit):
		return "inspection-limit"
	default:
		return "failed"
	}
}

func (handler *Handler) logStage(
	ctx context.Context,
	stage string,
	storageKey string,
	outcome string,
	startedAt time.Time,
) {
	handler.logger.InfoContext(
		ctx,
		stage,
		"storage_key", storageKey,
		"outcome", outcome,
		"duration_ms", time.Since(startedAt).Milliseconds(),
	)
}
