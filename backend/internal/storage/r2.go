package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"maps"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"

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
	endpoint    string
	httpClient  *http.Client
	maxAttempts int
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
	}
	if options.maxAttempts > 0 {
		awsConfig.Retryer = func() aws.Retryer {
			return retry.NewStandard(func(retryOptions *retry.StandardOptions) {
				retryOptions.MaxAttempts = options.maxAttempts
			})
		}
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

// PresignSourceUpload returns a private PDF PUT grant scoped to the source key.
func (r2 *R2) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (PresignedRequest, error) {
	const operation = "presigning source upload"

	if err := contextError(ctx, operation); err != nil {
		return PresignedRequest{}, err
	}
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return PresignedRequest{}, err
	}
	if err := validateSourceUploadSize(sizeBytes); err != nil {
		return PresignedRequest{}, err
	}
	if err := validatePresignExpiry(expiry); err != nil {
		return PresignedRequest{}, err
	}

	presigned, err := r2.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(r2.bucket),
		Key:           aws.String(objectKey),
		ContentType:   aws.String(PDFContentType),
		ContentLength: aws.Int64(sizeBytes),
	},
		s3.WithPresignExpires(expiry),
		s3.WithPresignClientFromClientOptions(func(options *s3.Options) {
			options.APIOptions = append(options.APIOptions, pinPDFContentType)
		}),
	)
	if err != nil {
		return PresignedRequest{}, r2OperationError(ctx, operation)
	}

	requiredHeaders := browserRequestHeaders(presigned.SignedHeader)
	requiredHeaders.Set("Content-Type", PDFContentType)

	return PresignedRequest{
		URL:             presigned.URL,
		RequiredHeaders: requiredHeaders,
	}, nil
}

// PresignSanitizedDownload returns a private GET grant for one exact source revision.
func (r2 *R2) PresignSanitizedDownload(
	ctx context.Context,
	fileID string,
	sourceETag string,
	expiry time.Duration,
) (PresignedRequest, error) {
	const operation = "presigning sanitized download"

	if err := contextError(ctx, operation); err != nil {
		return PresignedRequest{}, err
	}
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return PresignedRequest{}, err
	}
	if err := validatePresignExpiry(expiry); err != nil {
		return PresignedRequest{}, err
	}

	presigned, err := r2.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(expiry))
	if err != nil {
		return PresignedRequest{}, r2OperationError(ctx, operation)
	}

	return PresignedRequest{
		URL:             presigned.URL,
		RequiredHeaders: browserRequestHeaders(presigned.SignedHeader),
	}, nil
}

// DownloadSource reads the current source revision and optionally enforces an expected ETag.
func (r2 *R2) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (SourceObject, error) {
	const operation = "downloading source object"

	if err := contextError(ctx, operation); err != nil {
		return SourceObject{}, err
	}
	objectKey, err := SourceObjectKey(fileID)
	if err != nil {
		return SourceObject{}, err
	}

	input := &s3.GetObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(objectKey),
	}
	if expectedETag != "" {
		if err := validateCanonicalETag(expectedETag); err != nil {
			return SourceObject{}, err
		}
		input.IfMatch = aws.String("\"" + expectedETag + "\"")
	}

	output, err := r2.client.GetObject(ctx, input)
	if err != nil {
		statusCode := httpStatusCode(err)
		if expectedETag != "" && statusCode == http.StatusPreconditionFailed {
			return SourceObject{}, operationError(operation, ErrSourceRevisionConflict)
		}
		if statusCode == http.StatusNotFound {
			return SourceObject{}, operationError(operation, ErrSourceNotFound)
		}
		return SourceObject{}, r2OperationError(ctx, operation)
	}
	if output.Body == nil || output.ETag == nil {
		if output.Body != nil {
			_ = output.Body.Close()
		}
		return SourceObject{}, operationError(operation, ErrDependency)
	}

	pdfBytes, readErr := io.ReadAll(io.LimitReader(output.Body, MaxSourceObjectBytes+1))
	closeErr := output.Body.Close()
	if readErr != nil || closeErr != nil {
		if err := contextError(ctx, operation); err != nil {
			return SourceObject{}, err
		}
		return SourceObject{}, operationError(operation, ErrDependency)
	}
	if len(pdfBytes) > MaxSourceObjectBytes {
		return SourceObject{}, operationError(operation, ErrSourceObjectTooLarge)
	}

	normalizedETag, err := NormalizeProviderETag(*output.ETag)
	if err != nil {
		return SourceObject{}, operationError(operation, ErrDependency)
	}

	return SourceObject{
		PDFBytes: copyBytes(pdfBytes),
		Metadata: maps.Clone(output.Metadata),
		ETag:     normalizedETag,
	}, nil
}

// SanitizedExists reports whether the exact immutable sanitized revision exists.
func (r2 *R2) SanitizedExists(
	ctx context.Context,
	fileID string,
	sourceETag string,
) (bool, error) {
	const operation = "checking sanitized object"

	if err := contextError(ctx, operation); err != nil {
		return false, err
	}
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return false, err
	}

	_, err = r2.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(objectKey),
	})
	if err == nil {
		return true, nil
	}
	if httpStatusCode(err) == http.StatusNotFound {
		return false, nil
	}

	return false, r2OperationError(ctx, operation)
}

// UploadSanitized writes PDF bytes to the exact immutable revision key.
func (r2 *R2) UploadSanitized(
	ctx context.Context,
	fileID string,
	sourceETag string,
	pdfBytes []byte,
) error {
	const operation = "uploading sanitized object"

	if err := contextError(ctx, operation); err != nil {
		return err
	}
	objectKey, err := SanitizedObjectKey(fileID, sourceETag)
	if err != nil {
		return err
	}

	_, err = r2.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r2.bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(pdfBytes),
		ContentType: aws.String(PDFContentType),
		IfNoneMatch: aws.String("*"),
	})
	if err != nil {
		// The revision key is immutable, so a precondition failure means the
		// exact sanitized revision already exists: an idempotent success.
		if httpStatusCode(err) == http.StatusPreconditionFailed {
			return nil
		}
		return r2OperationError(ctx, operation)
	}

	return nil
}

func browserRequestHeaders(signedHeaders http.Header) http.Header {
	requiredHeaders := signedHeaders.Clone()
	if requiredHeaders == nil {
		requiredHeaders = make(http.Header)
	}
	requiredHeaders.Del("Host")
	return requiredHeaders
}

func pinPDFContentType(stack *middleware.Stack) error {
	return stack.Build.Add(middleware.BuildMiddlewareFunc(
		"PinPDFContentType",
		func(
			ctx context.Context,
			input middleware.BuildInput,
			next middleware.BuildHandler,
		) (middleware.BuildOutput, middleware.Metadata, error) {
			request, ok := input.Request.(*smithyhttp.Request)
			if !ok {
				return middleware.BuildOutput{}, middleware.Metadata{}, errors.New("unexpected presign transport")
			}
			request.Header.Set("Content-Type", PDFContentType)
			return next.HandleBuild(ctx, input)
		},
	), middleware.After)
}

// r2OperationError sanitizes a provider failure. Cancellation and deadline are
// propagated only when the caller's own context ended; a provider-side stall or
// timeout is a dependency failure, not a caller signal.
func r2OperationError(ctx context.Context, operation string) error {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return operationError(operation, ctxErr)
	}

	return operationError(operation, ErrDependency)
}

func httpStatusCode(err error) int {
	var responseError interface{ HTTPStatusCode() int }
	if errors.As(err, &responseError) {
		return responseError.HTTPStatusCode()
	}

	return 0
}
