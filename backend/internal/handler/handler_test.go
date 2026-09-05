package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	fileIDOne                 = "00000000-0000-4000-8000-000000000001"
	fileIDTwo                 = "00000000-0000-4000-8000-000000000002"
	fileIDThree               = "00000000-0000-4000-8000-000000000003"
	generatedFileID           = "00010203-0405-4607-8809-0a0b0c0d0e0f"
	storageKeyDigestOne       = "77376c868b92"
	storageKeyDigestTwo       = "8fb905d391d9"
	generatedStorageKeyDigest = "1e8eaec2a78b"
	canonicalETagOne          = "0123456789abcdef0123456789abcdef"
	canonicalETagTwo          = "fedcba9876543210fedcba9876543210"
	canonicalETagThree        = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

func TestPipelineLogsExcludeSeededSensitiveValues(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
		PDFBytes: []byte("%PDF-source-bytes-secret"),
		Metadata: map[string]string{"private-object-marker": "private-metadata-marker"},
		ETag:     "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	}))
	objectStorage := &sensitiveGrantStorage{Storage: fake}
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewJSONHandler(&logs, nil)),
		inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
			return []scrub.Field{{Name: "title", Preview: "metadata-preview-secret", Action: scrub.ActionRemove}}, nil
		},
	})

	uploadBody, err := json.Marshal(uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1})
	require.NoError(t, err)
	uploadRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: uploadMethod, contentType: mediatype.JSON,
		body: string(uploadBody),
	})
	dryRunBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	dryRunRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: dryRunMethod, contentType: mediatype.JSON,
		body: string(dryRunBody),
	})
	fake.SetFailure(storage.FakeDownloadSource, errors.New("dependency-error-sensitive-marker"))
	dependencyFailureBody, err := json.Marshal(dryRunRequest{StorageKey: formatStorageKey(fileIDTwo)})
	require.NoError(t, err)
	dependencyFailureRecorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), handler: handler, objectStorage: objectStorage,
		method: dryRunMethod, contentType: mediatype.JSON,
		body: string(dependencyFailureBody),
	})

	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())
	require.Equal(t, http.StatusInternalServerError, dependencyFailureRecorder.Code, dependencyFailureRecorder.Body.String())
	rawLogs := logs.String()
	require.Contains(t, rawLogs, `"storage_key_digest":"`+storageKeyDigestOne+`"`)
	for _, secret := range []string{
		formatStorageKey(generatedFileID),
		formatStorageKey(fileIDOne),
		formatStorageKey(fileIDTwo),
		"source-bytes-secret",
		"private-object-marker",
		"private-metadata-marker",
		"metadata-preview-secret",
		"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		"request-name-secret",
		"upload-url-secret",
		"credential-secret",
		"dependency-error-sensitive-marker",
	} {
		require.NotContains(t, rawLogs, secret)
	}
}

type handlerMethod int

const (
	uploadMethod handlerMethod = iota
	dryRunMethod
	scrubMethod
	downloadGrantMethod
	deleteFlowMethod
)

func assertAcceptedResponse(t *testing.T, method handlerMethod, recorder *httptest.ResponseRecorder) {
	t.Helper()

	switch method {
	case uploadMethod:
		var response uploadResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, formatStorageKey(generatedFileID), response.StorageKey)
		require.NotEmpty(t, response.UploadURL)
	case dryRunMethod:
		var response dryRunResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, canonicalETagOne, response.ETag)
		require.Empty(t, response.Fields)
	case scrubMethod:
		var response scrubResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "done", response.Status)
		require.NotEmpty(t, response.Result.DownloadURL)
	case downloadGrantMethod:
		var response downloadGrantResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.NotEmpty(t, response.DownloadURL)
		require.NotEmpty(t, response.ExpiresAt)
	case deleteFlowMethod:
		var response deleteResponse
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
		require.Equal(t, "deleted", response.Status)
	default:
		t.Fatalf("unknown handler method %d", method)
	}
}

func newTestHandler(
	t *testing.T,
	inspect inspectPDFOperation,
	clean cleanPDFOperation,
	entropy entropyOperation,
) *Handler {
	t.Helper()
	return newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		inspect: inspect,
		clean:   clean,
		entropy: entropy,
	})
}

type testHandlerOptions struct {
	permits         chan struct{}
	logger          *slog.Logger
	inspect         inspectPDFOperation
	clean           cleanPDFOperation
	entropy         entropyOperation
	admissionJitter admissionJitterOperation
	now             clockOperation
}

func newTestHandlerWithLogger(t *testing.T, options testHandlerOptions) *Handler {
	t.Helper()
	if options.inspect == nil {
		options.inspect = func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) { return nil, nil }
	}
	if options.clean == nil {
		options.clean = func(input []byte) ([]byte, error) { return bytes.Clone(input), nil }
	}
	if options.entropy == nil {
		options.entropy = func(destination []byte) (int, error) {
			for index := range destination {
				destination[index] = byte(index)
			}
			return len(destination), nil
		}
	}
	if options.admissionJitter == nil {
		options.admissionJitter = func() (int, error) { return 0, nil }
	}
	if options.now == nil {
		options.now = time.Now
	}
	handler := New(options.logger, options.permits)
	handler.inspect = options.inspect
	handler.clean = options.clean
	handler.entropy = options.entropy
	handler.admissionJitter = options.admissionJitter
	handler.now = options.now
	return handler
}

type handlerRequest struct {
	ctx           context.Context
	handler       *Handler
	objectStorage storage.Storage
	method        handlerMethod
	contentType   string
	body          string
}

func serveRequest(t *testing.T, input handlerRequest) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(input.body)).WithContext(input.ctx)
	if input.contentType != "" {
		request.Header.Set(header.ContentType, input.contentType)
	}
	recorder := httptest.NewRecorder()

	var endpoint http.HandlerFunc
	switch input.method {
	case uploadMethod:
		endpoint = input.handler.Upload
	case dryRunMethod:
		endpoint = input.handler.DryRun
	case scrubMethod:
		endpoint = input.handler.Scrub
	case downloadGrantMethod:
		endpoint = input.handler.DownloadGrant
	case deleteFlowMethod:
		endpoint = input.handler.DeleteFlow
	default:
		t.Fatalf("unknown handler method %d", input.method)
		return recorder
	}
	bindings.Inject(bindings.Bindings{Storage: input.objectStorage})(endpoint).ServeHTTP(recorder, request)
	return recorder
}

func errorMessage(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body.Error
}

func callOperations(calls []storage.FakeCall) []storage.FakeOperation {
	operations := make([]storage.FakeOperation, 0, len(calls))
	for _, call := range calls {
		operations = append(operations, call.Operation)
	}
	return operations
}

func callOperationsFor(calls []storage.FakeCall, fileID string) []storage.FakeOperation {
	var operations []storage.FakeOperation
	for _, call := range calls {
		if call.FileID == fileID {
			operations = append(operations, call.Operation)
		}
	}
	return operations
}

func seedCandidateSources(t *testing.T, fake *storage.Fake, fileIDs ...string) {
	t.Helper()
	for _, fileID := range fileIDs {
		require.NoError(t, fake.SetSource(fileID, storage.SourceObject{
			PDFBytes: []byte("%PDF-" + fileID),
			ETag:     canonicalETagsByFileID[fileID],
		}))
	}
}

var canonicalETagsByFileID = map[string]string{
	fileIDOne:   canonicalETagOne,
	fileIDTwo:   canonicalETagTwo,
	fileIDThree: canonicalETagThree,
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
