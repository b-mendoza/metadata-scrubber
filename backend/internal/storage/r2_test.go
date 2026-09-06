package storage

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
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
