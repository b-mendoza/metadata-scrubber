package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestPipelineLogsRecordRequiredSuccessFacts(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSource(fileIDTwo, storage.SourceObject{PDFBytes: []byte("%PDF-two"), ETag: canonicalETagTwo}))
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
	})

	uploadBody, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(uploadBody))
	uploadRequest.Header.Set(header.ContentType, mediatype.JSON)
	uploadRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(uploadRecorder, uploadRequest)
	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())

	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	dryRunRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dryRunBody))
	dryRunRequest.Header.Set(header.ContentType, mediatype.JSON)
	dryRunRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dryRunRecorder, dryRunRequest)
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())

	scrubBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDTwo), ETag: canonicalETagTwo})
	require.NoError(t, err)
	scrubRequest := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(scrubBody))
	scrubRequest.Header.Set(header.ContentType, mediatype.JSON)
	scrubRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(scrubRecorder, scrubRequest)
	require.Equal(t, http.StatusOK, scrubRecorder.Code, scrubRecorder.Body.String())

	records := readLogRecords(t, logs.Bytes())
	require.Contains(t, records, pipelineLogRecord{Message: "upload-created", Level: "INFO", StorageKeyDigest: generatedStorageKeyDigest, Outcome: "success"})
	require.Contains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"})
	require.Contains(t, records, pipelineLogRecord{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	require.Contains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "accepted"})
	require.Contains(t, records, pipelineLogRecord{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "success"})
	require.Contains(t, records, pipelineLogRecord{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestTwo, Outcome: "success"})
}

func TestPipelineLogsRecordFailureCacheHitAndShortCircuitFacts(t *testing.T) {
	t.Run("upload failure omits created success", func(t *testing.T) {
		fake := storage.NewFake()
		fake.SetFailure(storage.FakePresignSourceUpload, errors.New("upload failure"))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		})
		body, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.NotContains(t, records, pipelineLogRecord{Message: "upload-created", Level: "INFO", StorageKeyDigest: generatedStorageKeyDigest, Outcome: "success"})
	})

	t.Run("sniff rejection records terminal facts and omits later success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("not-pdf"), ETag: canonicalETagOne}))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		})
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusUnsupportedMediaType, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "rejected"})
		require.Contains(t, records, pipelineLogRecord{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "not-pdf"})
		require.NotContains(t, records, pipelineLogRecord{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	})

	t.Run("inspection failure records error and omits success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
			inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				return nil, errors.New("inspect failed")
			},
		})
		body, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"})
		require.Contains(t, records, pipelineLogRecord{Message: "dry-run", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"})
		require.NotContains(t, records, pipelineLogRecord{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	})

	t.Run("clean failure records error and omits presign success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
			clean:   func([]byte) ([]byte, error) { return nil, errors.New("clean failed") },
		})
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"})
		require.Contains(t, records, pipelineLogRecord{Message: "scrubbed", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"})
		require.NotContains(t, records, pipelineLogRecord{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	})

	t.Run("sanitized upload failure records scrub success and omits presign success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		fake.SetFailure(storage.FakeUploadSanitized, errors.New("upload failed"))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		})
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
		require.NotContains(t, records, pipelineLogRecord{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	})

	t.Run("presign failure records scrub success and omits presign success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		fake.SetFailure(storage.FakePresignSanitizedDownload, errors.New("presign failed"))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		})
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
		require.NotContains(t, records, pipelineLogRecord{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
	})

	t.Run("cache hit records reuse and omits scrub facts", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
		var logs bytes.Buffer
		handler := newTestHandlerWithLogger(t, testHandlerOptions{
			permits: make(chan struct{}, ProcessingPermitCount),
			logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		})
		body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		records := readLogRecords(t, logs.Bytes())
		require.Contains(t, records, pipelineLogRecord{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "cache-hit"})
		require.NotContains(t, records, pipelineLogRecord{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"})
		require.NotContains(t, records, pipelineLogRecord{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"})
	})
}

type pipelineLogRecord struct {
	Message              string `json:"msg"`
	Level                string `json:"level"`
	StorageKeyDigest     string `json:"storage_key_digest"`
	Outcome              string `json:"outcome"`
	DurationMilliseconds *int64 `json:"duration_ms"`
}

func readLogRecords(t *testing.T, data []byte) []pipelineLogRecord {
	t.Helper()
	var records []pipelineLogRecord
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record pipelineLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		require.NotNil(t, record.DurationMilliseconds)
		require.GreaterOrEqual(t, *record.DurationMilliseconds, int64(0))
		record.DurationMilliseconds = nil
		records = append(records, record)
	}
	require.NoError(t, scanner.Err())
	return records
}
