package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

const (
	testAccessKey      = "test-access-key-sentinel"
	testSecretKey      = "test-secret-key-sentinel"
	testBucket         = "test-bucket-sentinel"
	canonicalR2ETagOne = "0123456789abcdef0123456789abcdef"
	canonicalR2ETagTwo = "fedcba9876543210fedcba9876543210"
)

func TestR2DeleteFlowDeletesEveryListedPageAndVerifiesBothLocations(t *testing.T) {
	t.Parallel()

	firstKey, err := SanitizedObjectKey("file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	secondKey, err := SanitizedObjectKey("file-1", canonicalR2ETagTwo)
	require.NoError(t, err)

	requests := make(chan observedStorageRequest, 7)
	responses := []func(http.ResponseWriter, *observedStorageRequest){
		func(response http.ResponseWriter, _ *observedStorageRequest) {
			response.WriteHeader(http.StatusNoContent)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse(firstKey, true, "next-page"))
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse(secondKey, false, ""))
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)
		},
		func(response http.ResponseWriter, _ *observedStorageRequest) {
			response.WriteHeader(http.StatusNotFound)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse("", false, ""))
		},
	}
	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		responseIndex := int(requestCount.Add(1)) - 1
		body, readErr := io.ReadAll(request.Body)
		record := observedStorageRequest{
			method:   request.Method,
			path:     request.URL.Path,
			rawQuery: request.URL.RawQuery,
			body:     body,
			err:      readErr,
		}
		if responseIndex >= len(responses) {
			response.WriteHeader(http.StatusInternalServerError)
		} else {
			responses[responseIndex](response, &record)
		}
		requests <- record
	}))

	require.NoError(t, adapter.DeleteFlow(context.Background(), "file-1"))

	observed := make([]observedStorageRequest, 7)
	for index := range observed {
		observed[index] = <-requests
		require.NoError(t, observed[index].err)
	}
	require.Len(t, observed, 7)
	require.Equal(t, http.MethodDelete, observed[0].method)
	require.Equal(t, "/"+testBucket+"/source/file-1", observed[0].path)
	require.Equal(t, http.MethodGet, observed[1].method)
	require.Contains(t, observed[1].rawQuery, "list-type=2")
	require.Contains(t, observed[1].rawQuery, "prefix=sanitized%2Ffile-1%2F")
	require.Equal(t, http.MethodPost, observed[2].method)
	require.Contains(t, string(observed[2].body), firstKey)
	require.Equal(t, http.MethodGet, observed[3].method)
	require.Contains(t, observed[3].rawQuery, "continuation-token=next-page")
	require.Equal(t, http.MethodPost, observed[4].method)
	require.Contains(t, string(observed[4].body), secondKey)
	require.Equal(t, http.MethodHead, observed[5].method)
	require.Equal(t, "/"+testBucket+"/source/file-1", observed[5].path)
	require.Equal(t, http.MethodGet, observed[6].method)
	require.Contains(t, observed[6].rawQuery, "max-keys=1")
}

func TestR2DeleteFlowRejectsListedObjectOutsideTheRequestedPrefix(t *testing.T) {
	t.Parallel()

	foreignObjectKey, err := SanitizedObjectKey("other-file-identifier-sentinel", canonicalR2ETagOne)
	require.NoError(t, err)
	var requestCount atomic.Int64
	var deleteObjectsRequestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodPost {
			deleteObjectsRequestCount.Add(1)
		}
		switch requestCount.Add(1) {
		case 1:
			response.WriteHeader(http.StatusNoContent)
		case 2:
			response.Header().Set("Content-Type", "application/xml")
			_, writeErr := io.WriteString(response, listObjectsResponse(foreignObjectKey, false, ""))
			assert.NoError(t, writeErr)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
	}))

	err = adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

	require.ErrorIs(t, err, ErrDependency)
	assertSafeStorageError(t, err)
	require.Equal(t, int64(2), requestCount.Load())
	require.Zero(t, deleteObjectsRequestCount.Load())
}

func TestR2DeleteFlowVerifiesAfterAPartialProviderResult(t *testing.T) {
	t.Parallel()

	objectKey, err := SanitizedObjectKey("file-identifier-sentinel", canonicalR2ETagOne)
	require.NoError(t, err)
	for _, testCase := range []struct {
		name          string
		finalListKey  string
		assertOutcome func(*testing.T, error)
	}{
		{
			name: "verification is empty",
			assertOutcome: func(t *testing.T, err error) {
				require.NoError(t, err)
			},
		},
		{
			name:         "object remains",
			finalListKey: objectKey,
			assertOutcome: func(t *testing.T, err error) {
				require.ErrorIs(t, err, ErrFlowObjectsRemain)
				require.NotErrorIs(t, err, ErrDependency)
				assertSafeStorageError(t, err)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var requestCount atomic.Int64
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				switch requestCount.Add(1) {
				case 1:
					response.WriteHeader(http.StatusNoContent)
				case 2:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(objectKey, false, ""))
					assert.NoError(t, writeErr)
				case 3:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Error><Key>`+objectKey+`</Key><Code>AccessDenied</Code><Message>provider-body-sentinel</Message></Error></DeleteResult>`)
					assert.NoError(t, writeErr)
				case 4:
					response.WriteHeader(http.StatusNotFound)
				case 5:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(testCase.finalListKey, false, ""))
					assert.NoError(t, writeErr)
				default:
					response.WriteHeader(http.StatusInternalServerError)
				}
			}))

			err = adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

			testCase.assertOutcome(t, err)
			require.Equal(t, int64(5), requestCount.Load())
		})
	}
}

func TestR2DeleteFlowReturnsTypedFailureWhenFinalVerificationFindsAnObject(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		finalHeadCode int
		finalListKey  string
	}{
		{name: "source remains", finalHeadCode: http.StatusOK},
		{name: "sanitized revision remains", finalHeadCode: http.StatusNotFound, finalListKey: "sanitized/file-identifier-sentinel/remaining-object-sentinel"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var requestCount atomic.Int64
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				switch requestCount.Add(1) {
				case 1:
					response.WriteHeader(http.StatusNoContent)
				case 2:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse("", false, ""))
					assert.NoError(t, writeErr)
				case 3:
					response.WriteHeader(testCase.finalHeadCode)
				case 4:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(testCase.finalListKey, false, ""))
					assert.NoError(t, writeErr)
				default:
					response.WriteHeader(http.StatusInternalServerError)
				}
			}))

			err := adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

			require.ErrorIs(t, err, ErrFlowObjectsRemain)
			require.NotErrorIs(t, err, ErrDependency)
			assertSafeStorageError(t, err)
			require.Equal(t, int64(4), requestCount.Load())
		})
	}
}

func TestR2DeleteFlowTreatsMissingObjectsAsSuccess(t *testing.T) {
	t.Parallel()

	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch requestCount.Add(1) {
		case 1, 3:
			response.WriteHeader(http.StatusNotFound)
		case 2, 4:
			response.Header().Set("Content-Type", "application/xml")
			_, writeErr := io.WriteString(response, listObjectsResponse("", false, ""))
			assert.NoError(t, writeErr)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
	}))

	require.NoError(t, adapter.DeleteFlow(context.Background(), "file-1"))
	require.Equal(t, int64(4), requestCount.Load())
}

func TestR2RejectsInvalidInputsBeforeStorageRequests(t *testing.T) {
	t.Parallel()

	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requestCount.Add(1)
	}))

	_, err := adapter.SourceExists(context.Background(), "folder/file")
	require.ErrorIs(t, err, ErrInvalidFileID)
	err = adapter.DeleteFlow(context.Background(), "folder/file")
	require.ErrorIs(t, err, ErrInvalidFileID)
	_, err = adapter.PresignSourceUpload(context.Background(), "folder/file", 1024, time.Minute)
	require.ErrorIs(t, err, ErrInvalidFileID)
	_, err = adapter.PresignSanitizedDownload(context.Background(), "file-1", `"`+canonicalR2ETagOne+`"`, time.Minute)
	require.ErrorIs(t, err, ErrInvalidETag)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", 1024, 0)
	require.ErrorIs(t, err, ErrInvalidPresignExpiry)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", 0, time.Minute)
	require.ErrorIs(t, err, ErrInvalidSourceSize)
	_, err = adapter.PresignSourceUpload(context.Background(), "file-1", MaxSourceObjectBytes+1, time.Minute)
	require.ErrorIs(t, err, ErrSourceObjectTooLarge)
	_, err = adapter.DownloadSource(context.Background(), "file-1", `"`+canonicalR2ETagOne+`"`)
	require.ErrorIs(t, err, ErrInvalidETag)
	_, err = adapter.SanitizedExists(context.Background(), "file-1", "")
	require.ErrorIs(t, err, ErrInvalidETag)
	err = adapter.UploadSanitized(context.Background(), "../file", canonicalR2ETagOne, []byte("pdf"))
	require.ErrorIs(t, err, ErrInvalidFileID)
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

	transportErr := fmt.Errorf("transport stall: %w", context.DeadlineExceeded)
	adapter := newTestR2("https://endpoint-sentinel.invalid", &http.Client{Transport: roundTripFunc(
		func(*http.Request) (*http.Response, error) {
			return nil, transportErr
		},
	)})

	_, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, context.DeadlineExceeded)
	assertSafeStorageError(t, err)
}

func TestR2PropagatesCallerContextErrors(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.NotFoundHandler())
	for _, testCase := range []struct {
		name       string
		contextErr error
		invoke     func(context.Context, *R2) error
	}{
		{
			name:       "presign source upload after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				_, err := adapter.PresignSourceUpload(ctx, "file-1", 1024, time.Minute)
				return err
			},
		},
		{
			name:       "presign sanitized download after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				_, err := adapter.PresignSanitizedDownload(ctx, "file-1", canonicalR2ETagOne, time.Minute)
				return err
			},
		},
		{
			name:       "check source object after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				_, err := adapter.SourceExists(ctx, "file-1")
				return err
			},
		},
		{
			name:       "download source object after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				_, err := adapter.DownloadSource(ctx, "file-1", "")
				return err
			},
		},
		{
			name:       "check sanitized object after expired deadline",
			contextErr: context.DeadlineExceeded,
			invoke: func(ctx context.Context, adapter *R2) error {
				_, err := adapter.SanitizedExists(ctx, "file-1", canonicalR2ETagOne)
				return err
			},
		},
		{
			name:       "upload sanitized object after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				return adapter.UploadSanitized(ctx, "file-1", canonicalR2ETagOne, []byte("pdf"))
			},
		},
		{
			name:       "delete file flow after cancellation",
			contextErr: context.Canceled,
			invoke: func(ctx context.Context, adapter *R2) error {
				return adapter.DeleteFlow(ctx, "file-1")
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var ctx context.Context
			var cancel context.CancelFunc
			if errors.Is(testCase.contextErr, context.DeadlineExceeded) {
				ctx, cancel = context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
			} else {
				ctx, cancel = context.WithCancel(context.Background())
				cancel()
			}
			defer cancel()

			err := testCase.invoke(ctx, adapter)

			require.ErrorIs(t, err, testCase.contextErr)
		})
	}
}

func TestR2RedactsProviderTransportFailures(t *testing.T) {
	t.Parallel()

	transportErr := errors.New("transport-provider-body-sentinel")
	adapter := newTestR2("https://endpoint-sentinel.invalid", &http.Client{Transport: roundTripFunc(
		func(*http.Request) (*http.Response, error) {
			return nil, transportErr
		},
	)})

	_, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

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

func listObjectsResponse(objectKey string, truncated bool, nextToken string) string {
	contents := ""
	keyCount := 0
	if objectKey != "" {
		contents = "<Contents><Key>" + objectKey + "</Key></Contents>"
		keyCount = 1
	}
	nextTokenElement := ""
	if nextToken != "" {
		nextTokenElement = "<NextContinuationToken>" + nextToken + "</NextContinuationToken>"
	}
	return fmt.Sprintf(
		`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>%s</Name><KeyCount>%d</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>%t</IsTruncated>%s%s</ListBucketResult>`,
		testBucket,
		keyCount,
		truncated,
		contents,
		nextTokenElement,
	)
}

func assertSafeStorageError(t *testing.T, err error) {
	t.Helper()

	for _, sensitiveValue := range []string{
		testAccessKey,
		testSecretKey,
		"endpoint-sentinel",
		testBucket,
		"file-identifier-sentinel",
		canonicalR2ETagOne,
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
	rawQuery           string
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
	closed   atomic.Bool
	closeErr error
}

func (body *observedReadCloser) Close() error {
	body.closed.Store(true)
	return body.closeErr
}
