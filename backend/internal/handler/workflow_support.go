package handler

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

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
	if len(fileName) > maxFileNameBytes ||
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

func storageFromRequest(w http.ResponseWriter, request *http.Request) storage.Storage {
	requestBindings, ok := bindings.FromContext(request.Context())
	if !ok || requestBindings.Storage == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "service unavailable")
		return nil
	}
	return requestBindings.Storage
}

func acquirePermit(ctx context.Context, permits chan struct{}, timeout time.Duration, beforeSelect func()) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	admissionContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	beforeSelect()
	select {
	case permits <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-permits
			return nil, err
		}
		return func() { <-permits }, nil
	case <-admissionContext.Done():
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return nil, errAdmissionTimeout
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

type pipelineFailure struct {
	status  int
	message string
	outcome string
}

func classifyPipelineFailure(err error, internalMessage string) pipelineFailure {
	switch {
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return pipelineFailure{http.StatusRequestTimeout, cancellationMessage, "canceled"}
	case errors.Is(err, storage.ErrSourceNotFound):
		return pipelineFailure{http.StatusNotFound, "source file not found", "not-found"}
	case errors.Is(err, storage.ErrSourceObjectTooLarge), errors.Is(err, scrub.ErrInputTooLarge):
		return pipelineFailure{http.StatusRequestEntityTooLarge, "source file exceeds 10 MB limit", "too-large"}
	case errors.Is(err, storage.ErrSourceRevisionConflict):
		return pipelineFailure{http.StatusConflict, "source file changed since review", "conflict"}
	case errors.Is(err, errNotPDF):
		return pipelineFailure{http.StatusUnsupportedMediaType, "file is not a PDF", "not-pdf"}
	case errors.Is(err, scrub.ErrMalformedPDF):
		return pipelineFailure{http.StatusBadRequest, "invalid PDF", "malformed"}
	case errors.Is(err, scrub.ErrSignedPDF):
		return pipelineFailure{http.StatusUnprocessableEntity, "signed PDFs are not supported in v1", "signed"}
	case errors.Is(err, scrub.ErrInspectionLimit):
		return pipelineFailure{http.StatusBadRequest, "PDF metadata exceeds inspection limits", "inspection-limit"}
	default:
		return pipelineFailure{http.StatusInternalServerError, internalMessage, "failed"}
	}
}

func (handler *Handler) logStage(
	ctx context.Context,
	stage string,
	storageKey string,
	outcome string,
	startedAt time.Time,
) {
	// "failed" marks unclassified internal errors; every other outcome is expected traffic.
	level := slog.LevelInfo
	if outcome == "failed" {
		level = slog.LevelError
	}
	handler.logger.Log(
		ctx,
		level,
		stage,
		"storage_key", storageKey,
		"outcome", outcome,
		"duration_ms", time.Since(startedAt).Milliseconds(),
	)
}
