package storage

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/config"
)

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
