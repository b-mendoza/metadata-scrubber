package storage

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"metadata-scrubber/internal/config"
)

const (
	r2SigningRegion = "auto"

	// r2RequestTimeout bounds each storage HTTP exchange end to end; the SDK's
	// default client bounds only dialing and the TLS handshake, so a stalled
	// response would otherwise hang until the caller's context ends.
	r2RequestTimeout = 30 * time.Second
)

// R2 implements Storage for a private Cloudflare R2 bucket.
type R2 struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
}

var _ Storage = (*R2)(nil)

type r2Options struct {
	endpoint   string
	httpClient *http.Client
	retryer    func() aws.Retryer
}

// NewR2 constructs an R2 adapter without contacting the object store.
func NewR2(cfg config.Config) *R2 {
	return newR2(cfg, r2Options{
		endpoint:   cfg.R2Endpoint(),
		httpClient: &http.Client{Timeout: r2RequestTimeout},
	})
}

func newR2(cfg config.Config, options r2Options) *R2 {
	awsConfig := aws.Config{
		Region:      r2SigningRegion,
		Credentials: credentials.NewStaticCredentialsProvider(cfg.R2AccessKeyID, cfg.R2SecretAccessKey, ""),
		HTTPClient:  options.httpClient,
		Retryer:     options.retryer,
	}

	client := s3.NewFromConfig(awsConfig, func(s3Options *s3.Options) {
		s3Options.BaseEndpoint = aws.String(options.endpoint)
		s3Options.UsePathStyle = true
	})

	return &R2{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    cfg.R2Bucket,
	}
}

// r2OperationError sanitizes a provider failure. Cancellation and deadline are
// propagated only when the caller's own context ended; a provider-side stall or
// timeout is a dependency failure, not a caller signal.
func r2OperationError(ctx context.Context, operation string) error {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return fmt.Errorf("%s: %w", operation, ctxErr)
	}

	return fmt.Errorf("%s: %w", operation, ErrDependency)
}

// httpStatusCode reports the provider status code carried by err. The second
// result separates "no status code" from a status code that happens to be zero,
// so a transport failure can never match a status comparison.
func httpStatusCode(err error) (int, bool) {
	var responseError interface{ HTTPStatusCode() int }
	if errors.As(err, &responseError) {
		return responseError.HTTPStatusCode(), true
	}

	return 0, false
}
