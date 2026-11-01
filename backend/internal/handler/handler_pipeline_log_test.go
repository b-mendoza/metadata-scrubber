package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
	logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
	handler := newTestHandler(t)
	handler.logger = slog.New(logs)

	uploadBody, err := json.Marshal(uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(uploadBody))
	uploadRequest.Header.Set(header.ContentType, mediatype.JSON)
	uploadRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(uploadRecorder, uploadRequest)
	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
	var grantedUpload uploadResponse
	require.NoError(t, json.Unmarshal(uploadRecorder.Body.Bytes(), &grantedUpload))

	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
	require.NoError(t, err)
	dryRunRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dryRunBody))
	dryRunRequest.Header.Set(header.ContentType, mediatype.JSON)
	dryRunRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dryRunRecorder, dryRunRequest)
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())

	scrubBody, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDTwo, ETag: canonicalETagTwo})
	require.NoError(t, err)
	scrubRequest := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(scrubBody))
	scrubRequest.Header.Set(header.ContentType, mediatype.JSON)
	scrubRecorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(scrubRecorder, scrubRequest)
	require.Equal(t, http.StatusOK, scrubRecorder.Code, scrubRecorder.Body.String())

	require.Equal(t, []pipelineLogRecord{
		{Message: "pipeline stage", Stage: "upload-created", Level: slog.LevelInfo, StorageKeyDigest: grantedUpload.StorageKey.digest(), Outcome: "success", DurationRecorded: true},
		{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted", DurationRecorded: true},
		{Message: "pipeline stage", Stage: "dry-run", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "success", DurationRecorded: true},
		{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestTwo, Outcome: "accepted", DurationRecorded: true},
		{Message: "pipeline stage", Stage: "scrubbed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestTwo, Outcome: "success", DurationRecorded: true},
		{Message: "pipeline stage", Stage: "presigned", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestTwo, Outcome: "success", DurationRecorded: true},
	}, logs.records)
}

func TestPipelineLogsRecordFailureCacheHitAndShortCircuitFacts(t *testing.T) {
	t.Run("sniff rejection records terminal facts and omits later success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("not-pdf"), ETag: canonicalETagOne}))
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.logger = slog.New(logs)
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusUnsupportedMediaType, recorder.Code)
		require.Equal(t, []pipelineLogRecord{
			{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "rejected", DurationRecorded: true},
			{Message: "pipeline stage", Stage: "dry-run", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "not-pdf", DurationRecorded: true},
		}, logs.records)
	})

	t.Run("inspection failure records error and omits success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.inspect = func(context.Context, []byte) ([]scrub.Field, error) {
			return nil, errors.New("inspect failed")
		}
		handler.logger = slog.New(logs)
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		require.Equal(t, []pipelineLogRecord{
			{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted", DurationRecorded: true},
			{Message: "pipeline stage", Stage: "dry-run", Level: slog.LevelError, StorageKeyDigest: storageKeyDigestOne, Outcome: "failed", DurationRecorded: true},
		}, logs.records)
	})

	t.Run("clean failure records error and omits presign success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.clean = func(context.Context, []byte) ([]byte, error) {
			return nil, errors.New("clean failed")
		}
		handler.logger = slog.New(logs)
		body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		require.Equal(t, []pipelineLogRecord{
			{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted", DurationRecorded: true},
			{Message: "pipeline stage", Stage: "scrubbed", Level: slog.LevelError, StorageKeyDigest: storageKeyDigestOne, Outcome: "failed", DurationRecorded: true},
		}, logs.records)
	})

	t.Run("presign failure records scrub success and omits presign success", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		fake.SetFailure(storage.FakePresignSanitizedDownload, errors.New("presign failed"))
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.logger = slog.New(logs)
		body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusInternalServerError, recorder.Code)
		require.Equal(t, []pipelineLogRecord{
			{Message: "pipeline stage", Stage: "sniffed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "accepted", DurationRecorded: true},
			{Message: "pipeline stage", Stage: "scrubbed", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "success", DurationRecorded: true},
			{Message: "request failed", Level: slog.LevelError, Failure: "could not create download"},
		}, logs.records)
	})

	t.Run("cache hit records reuse and omits scrub facts", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
		require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.logger = slog.New(logs)
		body, err := json.Marshal(scrubRequest{StorageKey: storageKeyPrefix + fileIDOne, ETag: canonicalETagOne})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/scrub", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		recorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Scrub)).ServeHTTP(recorder, request)

		require.Equal(t, http.StatusOK, recorder.Code)
		require.Equal(t, []pipelineLogRecord{
			{Message: "pipeline stage", Stage: "presigned", Level: slog.LevelInfo, StorageKeyDigest: storageKeyDigestOne, Outcome: "cache-hit", DurationRecorded: true},
		}, logs.records)
	})
}

func TestPipelineLogsExcludeSeededSensitiveValues(t *testing.T) {
	t.Run("successful requests", func(t *testing.T) {
		fake := storage.NewFake()
		require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
			PDFBytes: []byte("%PDF-source-bytes-secret"),
			Metadata: map[string]string{"private-object-marker": "private-metadata-marker"},
			ETag:     "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		}))
		objectStorage := &sensitiveGrantStorage{Storage: fake}
		var logs bytes.Buffer
		handler := newTestHandler(t)
		handler.inspect = func(context.Context, []byte) ([]scrub.Field, error) {
			return []scrub.Field{{Name: "title", Preview: "metadata-preview-secret", Action: scrub.ActionRemove}}, nil
		}
		handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
		uploadBody, err := json.Marshal(uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1})
		require.NoError(t, err)
		uploadRequest := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(uploadBody))
		uploadRequest.Header.Set(header.ContentType, mediatype.JSON)
		uploadRecorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: objectStorage})(http.HandlerFunc(handler.Upload)).ServeHTTP(uploadRecorder, uploadRequest)
		dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDOne})
		require.NoError(t, err)
		dryRunHTTPRequest := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(dryRunBody))
		dryRunHTTPRequest.Header.Set(header.ContentType, mediatype.JSON)
		dryRunRecorder := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: objectStorage})(http.HandlerFunc(handler.DryRun)).ServeHTTP(dryRunRecorder, dryRunHTTPRequest)

		require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
		var grantedUpload uploadResponse
		require.NoError(t, json.Unmarshal(uploadRecorder.Body.Bytes(), &grantedUpload))
		require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())
		rawLogs := logs.String()
		require.Contains(t, rawLogs, `"storage_key_digest":"`+storageKeyDigestOne+`"`)
		for _, secret := range []string{
			string(grantedUpload.StorageKey),
			storageKeyPrefix + fileIDOne,
			"source-bytes-secret",
			"private-object-marker",
			"private-metadata-marker",
			"metadata-preview-secret",
			"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			"request-name-secret",
			"upload-url-secret",
			"credential-secret",
		} {
			require.NotContains(t, rawLogs, secret)
		}
	})

	t.Run("dependency failure", func(t *testing.T) {
		fake := storage.NewFake()
		fake.SetFailure(storage.FakeDownloadSource, errors.New("dependency-error-sensitive-marker"))
		var logs bytes.Buffer
		handler := newTestHandler(t)
		handler.logger = slog.New(slog.NewJSONHandler(&logs, nil))
		body, err := json.Marshal(dryRunRequest{StorageKey: storageKeyPrefix + fileIDTwo})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		response := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DryRun)).ServeHTTP(response, request)

		require.Equal(t, http.StatusInternalServerError, response.Code, response.Body.String())
		require.NotContains(t, logs.String(), storageKeyPrefix+fileIDTwo)
		require.NotContains(t, logs.String(), "dependency-error-sensitive-marker")
		require.NotContains(t, logs.String(), `"error":`)
	})

	t.Run("upload failure", func(t *testing.T) {
		fake := storage.NewFake()
		fake.SetFailure(storage.FakePresignSourceUpload, errors.New("sensitive-provider-url-object-key-marker"))
		var rawLogs bytes.Buffer
		logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
		handler := newTestHandler(t)
		handler.logger = slog.New(slog.NewMultiHandler(logs, slog.NewJSONHandler(&rawLogs, nil)))
		body, err := json.Marshal(uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, "/api/files/upload", bytes.NewReader(body))
		request.Header.Set(header.ContentType, mediatype.JSON)
		response := httptest.NewRecorder()
		bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload)).ServeHTTP(response, request)

		require.Equal(t, http.StatusInternalServerError, response.Code)
		require.Equal(t, []pipelineLogRecord{{Message: "request failed", Level: slog.LevelError, Failure: "could not create upload"}}, logs.records)
		require.NotContains(t, rawLogs.String(), `"stage":"upload-created"`)
		require.NotContains(t, rawLogs.String(), "sensitive-provider-url-object-key-marker")
		require.NotContains(t, rawLogs.String(), "request-name-secret")
		require.NotContains(t, rawLogs.String(), `"error":`)
	})
}

type pipelineLogRecord struct {
	Message          string
	Level            slog.Level
	Stage            string
	Failure          string
	StorageKeyDigest string
	Outcome          string
	DurationRecorded bool
}

type pipelineLogHandler struct {
	slog.Handler
	records []pipelineLogRecord
}

func (*pipelineLogHandler) Enabled(context.Context, slog.Level) bool { return true }

func (logs *pipelineLogHandler) Handle(_ context.Context, record slog.Record) error {
	entry := pipelineLogRecord{Message: record.Message, Level: record.Level}
	record.Attrs(func(attr slog.Attr) bool {
		switch attr.Key {
		case "stage":
			entry.Stage = attr.Value.String()
		case "failure":
			entry.Failure = attr.Value.String()
		case "storage_key_digest":
			entry.StorageKeyDigest = attr.Value.String()
		case "outcome":
			entry.Outcome = attr.Value.String()
		case "duration_ms":
			entry.DurationRecorded = attr.Value.Kind() == slog.KindInt64 && attr.Value.Int64() >= 0
		}
		return true
	})
	logs.records = append(logs.records, entry)
	return nil
}

func TestStorageCancellationLogsNone(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name       string
		failure    error
		wantStatus int
	}{
		{name: "canceled", failure: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "deadline exceeded", failure: context.DeadlineExceeded, wantStatus: http.StatusRequestTimeout},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			fake := storage.NewFake()
			fake.SetFailure(storage.FakePresignSourceUpload, testCase.failure)
			logs := &pipelineLogHandler{Handler: slog.DiscardHandler}
			handler := newTestHandler(t)
			handler.logger = slog.New(logs)
			body, err := json.Marshal(uploadRequest{FileName: "private-file.pdf", FileSizeBytes: 1})
			require.NoError(t, err)
			request := httptest.NewRequest(http.MethodPost, "/api/uploads", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			response := httptest.NewRecorder()
			bound := bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.Upload))

			bound.ServeHTTP(response, request)

			require.Equal(t, testCase.wantStatus, response.Code)
			require.Empty(t, logs.records)
		})
	}
}

type sensitiveGrantStorage struct {
	storage.Storage
}

func (objectStorage *sensitiveGrantStorage) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (storage.PresignedRequest, error) {
	grant, err := objectStorage.Storage.PresignSourceUpload(ctx, fileID, sizeBytes, expiry)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	grant.URL = "https://upload-url-secret.invalid/source?credential=credential-secret"
	return grant, nil
}
