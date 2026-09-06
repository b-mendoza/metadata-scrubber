package handler

import (
	"bufio"
	"bytes"
	"context"
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

func TestPipelineLogsShortCircuitFailuresAndDescribeCacheHitsTruthfully(t *testing.T) {
	uploadFailureBody, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	sniffRejectionBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	inspectionFailureBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	cleanFailureBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	uploadFailureAfterScrubBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	presignFailureBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: canonicalETagOne})
	require.NoError(t, err)
	cacheHitBody, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "0123456789abcdef0123456789abcdef"})
	require.NoError(t, err)

	tests := []struct {
		name        string
		method      handlerMethod
		configure   func(t *testing.T, fake *storage.Fake)
		inspect     inspectPDFOperation
		clean       cleanPDFOperation
		body        string
		wantStatus  int
		wantRecords []pipelineLogRecord
	}{
		{
			name:   "upload failure emits no created success stage",
			method: uploadMethod,
			configure: func(_ *testing.T, fake *storage.Fake) {
				fake.SetFailure(storage.FakePresignSourceUpload, errors.New("upload failure"))
			},
			body:       string(uploadFailureBody),
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:   "sniff rejection records terminal outcomes without later success",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("not-pdf"), ETag: "0123456789abcdef0123456789abcdef"}))
			},
			body:       string(sniffRejectionBody),
			wantStatus: http.StatusUnsupportedMediaType,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "rejected"},
				{Message: "dry-run", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "not-pdf"},
			},
		},
		{
			name:   "inspection failure records dry run failure",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				return nil, errors.New("inspect failed")
			},
			body:       string(inspectionFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "dry-run", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"},
			},
		},
		{
			name:   "clean failure records scrub failure without presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			clean:      func([]byte) ([]byte, error) { return nil, errors.New("clean failed") },
			body:       string(cleanFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "ERROR", StorageKeyDigest: storageKeyDigestOne, Outcome: "failed"},
			},
		},
		{
			name:   "upload failure after scrub emits no presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakeUploadSanitized, errors.New("upload failed"))
			},
			body:       string(uploadFailureAfterScrubBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"},
			},
		},
		{
			name:   "presign failure emits no presigned success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakePresignSanitizedDownload, errors.New("presign failed"))
			},
			body:       string(presignFailureBody),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted"},
				{Message: "scrubbed", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "success"},
			},
		},
		{
			name:   "cache hit records presign reuse without scrub work",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
			},
			body:       string(cacheHitBody),
			wantStatus: http.StatusOK,
			wantRecords: []pipelineLogRecord{
				{Message: "presigned", Level: "INFO", StorageKeyDigest: storageKeyDigestOne, Outcome: "cache-hit"},
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			testCase.configure(t, fake)
			var logs bytes.Buffer
			handler := newTestHandlerWithLogger(t, testHandlerOptions{
				permits: make(chan struct{}, ProcessingPermitCount),
				logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
				inspect: testCase.inspect,
				clean:   testCase.clean,
			})

			recorder := serveRequest(t, handlerRequest{ctx: context.Background(), handler: handler, objectStorage: fake, method: testCase.method, contentType: mediatype.JSON, body: testCase.body})

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			records := readLogRecords(t, logs.Bytes())
			require.Equal(t, testCase.wantRecords, records)
		})
	}
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
