package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
	"metadata-scrubber/internal/scrub"
)

const (
	testAccessKey = "test-access-key-sentinel"
	testSecretKey = "test-secret-key-sentinel"
	testBucket    = "test-bucket-sentinel"
)

func TestR2PresignsOperationSpecificExactKeysAndExpiry(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.NotFoundHandler())
	presignMethods := capturePresignMethods(adapter)

	uploadExpiry := time.Minute
	uploadSizeBytes := int64(1024)
	upload, err := adapter.PresignSourceUpload(context.Background(), "file-1", uploadSizeBytes, uploadExpiry)
	require.NoError(t, err)
	require.Equal(t, http.MethodPut, <-presignMethods)
	assertPresignedRequest(t, upload, "/"+testBucket+"/source/file-1", uploadExpiry)
	require.Equal(t, PDFContentType, upload.RequiredHeaders.Get("Content-Type"))
	require.Equal(t, "1024", upload.RequiredHeaders.Get("Content-Length"))
	require.Empty(t, upload.RequiredHeaders.Get("Host"))
	signedHeaders := strings.Split(parsePresignedURL(t, upload.URL).Query().Get("X-Amz-SignedHeaders"), ";")
	require.Contains(t, signedHeaders, "content-type")
	require.Contains(t, signedHeaders, "content-length")

	downloadExpiry := 2 * time.Minute
	download, err := adapter.PresignSanitizedDownload(
		context.Background(),
		"file-1",
		"revision-1",
		downloadExpiry,
	)
	require.NoError(t, err)
	revisionKey, err := SanitizedObjectKey("file-1", "revision-1")
	require.NoError(t, err)
	require.Equal(t, http.MethodGet, <-presignMethods)
	assertPresignedRequest(t, download, "/"+testBucket+"/"+revisionKey, downloadExpiry)
	require.Empty(t, download.RequiredHeaders)
}

func TestR2SourceReadsReturnCopiedMetadataAndRoundTripIfMatch(t *testing.T) {
	t.Parallel()

	requests := make(chan observedStorageRequest, 2)
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("ETag", `"revision-1"`)
		response.Header().Set("X-Amz-Meta-Author", "synthetic-author")
		response.Header().Set("X-Amz-Meta-Document-Type", "report")
		_, writeErr := io.WriteString(response, "source-pdf")
		requests <- observedStorageRequest{
			method:  request.Method,
			path:    request.URL.Path,
			ifMatch: request.Header.Get("If-Match"),
			err:     writeErr,
		}
	}))

	dryRun, err := adapter.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, []byte("source-pdf"), dryRun.PDFBytes)
	require.Equal(t, "revision-1", dryRun.ETag)
	require.Equal(t, map[string]string{
		"author":        "synthetic-author",
		"document-type": "report",
	}, dryRun.Metadata)

	_, err = adapter.DownloadSource(context.Background(), "file-1", dryRun.ETag)
	require.NoError(t, err)

	dryRunRequest := <-requests
	matchedRequest := <-requests
	for _, request := range []observedStorageRequest{dryRunRequest, matchedRequest} {
		require.NoError(t, request.err)
		require.Equal(t, http.MethodGet, request.method)
		require.Equal(t, "/"+testBucket+"/source/file-1", request.path)
	}
	require.Empty(t, dryRunRequest.ifMatch)
	require.Equal(t, `"revision-1"`, matchedRequest.ifMatch)
}

func TestR2EnforcesTheSourceObjectMemoryBoundary(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		size    int
		wantErr bool
	}{
		{name: "exactly 10 MB", size: MaxSourceObjectBytes},
		{name: "10 MB plus one byte", size: MaxSourceObjectBytes + 1, wantErr: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			body := &observedReadCloser{Reader: bytes.NewReader(make([]byte, testCase.size))}
			adapter := newTestR2("https://storage.invalid", &http.Client{Transport: roundTripFunc(
				func(request *http.Request) (*http.Response, error) {
					return &http.Response{
						Status:     "200 OK",
						StatusCode: http.StatusOK,
						Proto:      "HTTP/1.1",
						ProtoMajor: 1,
						ProtoMinor: 1,
						Header: http.Header{
							"Etag":              []string{`"revision-1"`},
							"X-Amz-Meta-Author": []string{"synthetic-author"},
						},
						Body:          body,
						ContentLength: int64(testCase.size),
						Request:       request,
					}, nil
				},
			)})

			source, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

			require.True(t, body.closed.Load())
			if testCase.wantErr {
				require.ErrorIs(t, err, ErrSourceObjectTooLarge)
				require.NotErrorIs(t, err, ErrDependency)
				require.NotErrorIs(t, err, ErrSourceRevisionConflict)
				require.Empty(t, source)
				assertSafeStorageError(t, err)
				return
			}

			require.NoError(t, err)
			require.Len(t, source.PDFBytes, MaxSourceObjectBytes)
			require.Equal(t, "revision-1", source.ETag)
			require.Equal(t, "synthetic-author", source.Metadata["author"])
		})
	}
}

func TestR2MapsOnlyConditionalSourcePreconditionFailureToConflict(t *testing.T) {
	t.Parallel()

	adapter := newTestR2StatusServer(t, http.StatusPreconditionFailed)

	_, err := adapter.DownloadSource(context.Background(), "file-1", "revision-1")
	require.ErrorIs(t, err, ErrSourceRevisionConflict)
	require.NotErrorIs(t, err, ErrDependency)

	_, err = adapter.DownloadSource(context.Background(), "file-1", "")
	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
	assertSafeStorageError(t, err)
}

func TestR2KeepsOrdinarySourceFailuresDistinctFromRevisionConflict(t *testing.T) {
	t.Parallel()

	adapter := newTestR2StatusServer(t, http.StatusForbidden)

	_, err := adapter.DownloadSource(context.Background(), "file-1", "revision-1")

	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
	assertSafeStorageError(t, err)
}

func TestR2TreatsMalformedProviderETagsAsOrdinaryFailures(t *testing.T) {
	t.Parallel()

	for _, providerETag := range []string{"", "revision-1"} {
		t.Run(providerETag, func(t *testing.T) {
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				if providerETag != "" {
					response.Header().Set("ETag", providerETag)
				}
				_, err := io.WriteString(response, "source-pdf")
				assert.NoError(t, err)
			}))

			_, err := adapter.DownloadSource(context.Background(), "file-1", "")

			require.ErrorIs(t, err, ErrDependency)
			require.NotErrorIs(t, err, ErrSourceRevisionConflict)
		})
	}
}

func TestR2ReportsAMissingSourceAsSourceNotFound(t *testing.T) {
	t.Parallel()

	adapter := newTestR2StatusServer(t, http.StatusNotFound)

	_, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")
	require.ErrorIs(t, err, ErrSourceNotFound)
	require.NotErrorIs(t, err, ErrDependency)
	assertSafeStorageError(t, err)

	_, err = adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "revision-1")
	require.ErrorIs(t, err, ErrSourceNotFound)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
}

func TestR2SanitizedExistenceUsesOnlyTheExactRevisionKey(t *testing.T) {
	t.Parallel()

	revisionOneKey, err := SanitizedObjectKey("file-1", "revision-1")
	require.NoError(t, err)
	revisionTwoKey, err := SanitizedObjectKey("file-1", "revision-2")
	require.NoError(t, err)

	requests := make(chan observedStorageRequest, 2)
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/" + testBucket + "/" + revisionOneKey:
			response.Header().Set("ETag", `"ignored-output-etag"`)
			response.Header().Set("X-Amz-Meta-Source-Etag", "ignored-metadata")
		case "/" + testBucket + "/" + revisionTwoKey:
			response.WriteHeader(http.StatusNotFound)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
		requests <- observedStorageRequest{method: request.Method, path: request.URL.Path}
	}))

	exists, err := adapter.SanitizedExists(context.Background(), "file-1", "revision-1")
	require.NoError(t, err)
	require.True(t, exists)

	exists, err = adapter.SanitizedExists(context.Background(), "file-1", "revision-2")
	require.NoError(t, err)
	require.False(t, exists)

	revisionOneRequest := <-requests
	revisionTwoRequest := <-requests
	require.Equal(t, http.MethodHead, revisionOneRequest.method)
	require.Equal(t, http.MethodHead, revisionTwoRequest.method)
	require.Equal(t, "/"+testBucket+"/"+revisionOneKey, revisionOneRequest.path)
	require.Equal(t, "/"+testBucket+"/"+revisionTwoKey, revisionTwoRequest.path)
}

func TestR2SanitizedExistenceMapsOnlyNotFoundToAbsence(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusForbidden)
	}))

	exists, err := adapter.SanitizedExists(context.Background(), "file-1", "revision-1")

	require.False(t, exists)
	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
}

func TestR2SanitizedUploadPinsPDFContentTypeAndPerformsNoFollowUp(t *testing.T) {
	t.Parallel()

	revisionKey, err := SanitizedObjectKey("file-1", "revision-1")
	require.NoError(t, err)
	oversizedPDF := []byte(strings.Repeat("x", scrub.MaxInputBytes+1))
	var requestCount atomic.Int64
	requests := make(chan observedStorageRequest, 2)

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requestCount.Add(1)
		body, readErr := io.ReadAll(request.Body)
		requests <- observedStorageRequest{
			method:             request.Method,
			path:               request.URL.Path,
			contentType:        request.Header.Get("Content-Type"),
			sourceETagMetadata: request.Header.Get("X-Amz-Meta-Source-Etag"),
			body:               body,
			err:                readErr,
		}
		response.WriteHeader(http.StatusOK)
	}))

	err = adapter.UploadSanitized(context.Background(), "file-1", "revision-1", oversizedPDF)

	require.NoError(t, err)
	request := <-requests
	require.NoError(t, request.err)
	require.Equal(t, http.MethodPut, request.method)
	require.Equal(t, "/"+testBucket+"/"+revisionKey, request.path)
	require.Equal(t, PDFContentType, request.contentType)
	require.Empty(t, request.sourceETagMetadata)
	require.Equal(t, oversizedPDF, request.body)
	require.Equal(t, int64(1), requestCount.Load())
}

func TestR2SanitizedUploadReturnsASanitizedDependencyError(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("X-Amz-Request-Id", "request-id-sentinel")
		response.WriteHeader(http.StatusInternalServerError)
		_, err := io.WriteString(response, "provider-body-sentinel")
		assert.NoError(t, err)
	}))

	err := adapter.UploadSanitized(
		context.Background(),
		"file-identifier-sentinel",
		"revision-1",
		[]byte("pdf"),
	)

	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
	assertSafeStorageError(t, err)
}

func TestR2RejectsInvalidInputsBeforeStorageRequests(t *testing.T) {
	t.Parallel()

	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requestCount.Add(1)
	}))

	_, err := adapter.PresignSourceUpload(context.Background(), "folder/file", 1024, time.Minute)
	require.ErrorIs(t, err, ErrInvalidFileID)
	_, err = adapter.PresignSanitizedDownload(context.Background(), "file-1", `"revision-1"`, time.Minute)
	require.ErrorIs(t, err, ErrInvalidETag)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", 1024, 0)
	require.ErrorIs(t, err, ErrInvalidPresignExpiry)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", 0, time.Minute)
	require.ErrorIs(t, err, ErrInvalidSourceSize)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", MaxSourceObjectBytes+1, time.Minute)
	require.ErrorIs(t, err, ErrSourceObjectTooLarge)
	_, err = adapter.DownloadSource(context.Background(), "file-1", `"revision-1"`)
	require.ErrorIs(t, err, ErrInvalidETag)
	_, err = adapter.SanitizedExists(context.Background(), "file-1", "")
	require.ErrorIs(t, err, ErrInvalidETag)
	err = adapter.UploadSanitized(context.Background(), "../file", "revision-1", []byte("pdf"))
	require.ErrorIs(t, err, ErrInvalidFileID)
	require.Zero(t, requestCount.Load())
}

func TestR2CanceledContextTakesPriorityOverInvalidInput(t *testing.T) {
	t.Parallel()

	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requestCount.Add(1)
	}))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := adapter.PresignSourceUpload(ctx, "folder/file", 0, 0)

	require.ErrorIs(t, err, context.Canceled)
	require.NotErrorIs(t, err, ErrInvalidFileID)
	require.Zero(t, requestCount.Load())
}

func TestR2ProductionRequestsHaveABoundedOverallDuration(t *testing.T) {
	t.Parallel()

	adapter := NewR2(config.Config{
		R2AccessKeyID:     testAccessKey,
		R2SecretAccessKey: testSecretKey,
		R2Bucket:          testBucket,
	})

	// Intentionally exact: this constant is the only bound on a stalled R2
	// exchange, so a silent change to it must fail the suite.
	httpClient, ok := adapter.client.Options().HTTPClient.(*http.Client)
	require.True(t, ok)
	require.Equal(t, 30*time.Second, httpClient.Timeout)
}

func TestR2MapsProviderTimeoutsToDependencyFailures(t *testing.T) {
	t.Parallel()

	adapter := newTestR2FailingTransport(fmt.Errorf("transport stall: %w", context.DeadlineExceeded))

	_, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, context.DeadlineExceeded)
	assertSafeStorageError(t, err)
}

func TestR2PropagatesContextAndSanitizesProviderFailures(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	adapter := newTestR2FailingTransport(errors.New("transport-provider-body-sentinel"))

	_, err := adapter.PresignSourceUpload(ctx, "file-1", 1024, time.Minute)
	require.ErrorIs(t, err, context.Canceled)
	_, err = adapter.PresignSanitizedDownload(ctx, "file-1", "revision-1", time.Minute)
	require.ErrorIs(t, err, context.Canceled)
	_, err = adapter.DownloadSource(ctx, "file-1", "")
	require.ErrorIs(t, err, context.Canceled)
	_, err = adapter.SanitizedExists(ctx, "file-1", "revision-1")
	require.ErrorIs(t, err, context.Canceled)
	err = adapter.UploadSanitized(ctx, "file-1", "revision-1", []byte("pdf"))
	require.ErrorIs(t, err, context.Canceled)

	deadlineCtx, deadlineCancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer deadlineCancel()
	_, err = adapter.SanitizedExists(deadlineCtx, "file-1", "revision-1")
	require.ErrorIs(t, err, context.DeadlineExceeded)

	adapter = newTestR2FailingTransport(errors.New("transport-provider-body-sentinel"))
	_, err = adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")
	require.ErrorIs(t, err, ErrDependency)
	assertSafeStorageError(t, err)

	var operationError *smithy.OperationError
	require.NotErrorAs(t, err, &operationError)
}

func newTestR2Server(t *testing.T, handler http.Handler) *R2 {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return newTestR2(server.URL, server.Client())
}

func newTestR2StatusServer(t *testing.T, status int) *R2 {
	t.Helper()

	return newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(status)
		_, err := io.WriteString(response, "provider-body-sentinel")
		assert.NoError(t, err)
	}))
}

func newTestR2FailingTransport(transportErr error) *R2 {
	return newTestR2("https://endpoint-sentinel.invalid", &http.Client{Transport: roundTripFunc(
		func(*http.Request) (*http.Response, error) {
			return nil, transportErr
		},
	)})
}

func newTestR2(endpoint string, httpClient *http.Client) *R2 {
	return newR2(config.Config{
		R2AccessKeyID:     testAccessKey,
		R2SecretAccessKey: testSecretKey,
		R2Bucket:          testBucket,
	}, r2Options{
		endpoint:   endpoint,
		httpClient: httpClient,
		retryer: func() aws.Retryer {
			return retry.NewStandard(func(retryOptions *retry.StandardOptions) {
				retryOptions.MaxAttempts = 1
			})
		},
	})
}

func assertPresignedRequest(
	t *testing.T,
	request PresignedRequest,
	path string,
	expiry time.Duration,
) {
	t.Helper()

	parsed := parsePresignedURL(t, request.URL)
	require.Equal(t, path, parsed.Path)
	require.Equal(t, strconv.FormatInt(int64(expiry/time.Second), 10), parsed.Query().Get("X-Amz-Expires"))
	require.Equal(t, testAccessKey, strings.Split(parsed.Query().Get("X-Amz-Credential"), "/")[0])
}

func capturePresignMethods(adapter *R2) <-chan string {
	methods := make(chan string, 4)
	options := adapter.client.Options()
	options.APIOptions = append(options.APIOptions, func(stack *middleware.Stack) error {
		return stack.Build.Add(middleware.BuildMiddlewareFunc(
			"CapturePresignMethod",
			func(
				ctx context.Context,
				input middleware.BuildInput,
				next middleware.BuildHandler,
			) (middleware.BuildOutput, middleware.Metadata, error) {
				request, ok := input.Request.(*smithyhttp.Request)
				if !ok {
					methods <- ""
					return next.HandleBuild(ctx, input)
				}
				methods <- request.Method
				return next.HandleBuild(ctx, input)
			},
		), middleware.After)
	})
	adapter.presigner = s3.NewPresignClient(s3.New(options))
	return methods
}

func parsePresignedURL(t *testing.T, rawURL string) *url.URL {
	t.Helper()

	parsed, err := url.Parse(rawURL)
	require.NoError(t, err)
	return parsed
}

func assertSafeStorageError(t *testing.T, err error) {
	t.Helper()

	for _, sensitiveValue := range []string{
		testAccessKey,
		testSecretKey,
		"endpoint-sentinel",
		testBucket,
		"file-identifier-sentinel",
		"revision-1",
		"synthetic-author",
		"provider-body-sentinel",
		"request-id-sentinel",
		"X-Amz-Signature",
	} {
		require.NotContains(t, err.Error(), sensitiveValue)
	}
}

type observedStorageRequest struct {
	method             string
	path               string
	ifMatch            string
	contentType        string
	sourceETagMetadata string
	body               []byte
	err                error
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (roundTrip roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

type observedReadCloser struct {
	io.Reader
	closed atomic.Bool
}

func (body *observedReadCloser) Close() error {
	body.closed.Store(true)
	return nil
}
