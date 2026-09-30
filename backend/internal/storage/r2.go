package storage

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

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

func (r2 *R2) DeleteFlow(ctx context.Context, fileID string) error {
	if err := contextError(ctx, operationDeleteFlow); err != nil {
		return err
	}
	sourceKey, err := SourceObjectKey(fileID)
	if err != nil {
		return err
	}
	sanitizedPrefix, err := SanitizedObjectPrefix(fileID)
	if err != nil {
		return err
	}

	if err := r2.deleteSource(ctx, sourceKey); err != nil {
		return err
	}
	if err := r2.deleteSanitizedRevisions(ctx, sanitizedPrefix); err != nil {
		return err
	}
	return r2.verifyFlowEmpty(ctx, sourceKey, sanitizedPrefix)
}

func (r2 *R2) deleteSource(ctx context.Context, sourceKey string) error {
	_, err := r2.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(sourceKey),
	})
	if err == nil {
		return nil
	}
	if statusCode, hasStatusCode := httpStatusCode(err); hasStatusCode && statusCode == http.StatusNotFound {
		return nil
	}
	return r2OperationError(ctx, operationDeleteFlow)
}

func (r2 *R2) deleteSanitizedRevisions(ctx context.Context, sanitizedPrefix string) error {
	paginator := s3.NewListObjectsV2Paginator(r2.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(r2.bucket),
		Prefix: aws.String(sanitizedPrefix),
	})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return r2OperationError(ctx, operationDeleteFlow)
		}
		if err := r2.deleteSanitizedPage(ctx, page.Contents, sanitizedPrefix); err != nil {
			return err
		}
	}
	return nil
}

func (r2 *R2) deleteSanitizedPage(
	ctx context.Context,
	contents []s3types.Object,
	sanitizedPrefix string,
) error {
	if len(contents) == 0 {
		return nil
	}
	objects, err := sanitizedObjectIdentifiers(contents, sanitizedPrefix)
	if err != nil {
		return err
	}
	output, err := r2.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(r2.bucket),
		Delete: &s3types.Delete{Objects: objects, Quiet: aws.Bool(true)},
	})
	if err != nil {
		return r2OperationError(ctx, operationDeleteFlow)
	}
	if output == nil {
		return operationError(operationDeleteFlow, ErrDependency)
	}
	return nil
}

func sanitizedObjectIdentifiers(
	contents []s3types.Object,
	sanitizedPrefix string,
) ([]s3types.ObjectIdentifier, error) {
	objects := make([]s3types.ObjectIdentifier, len(contents))
	for index, object := range contents {
		if object.Key == nil {
			return nil, operationError(operationDeleteFlow, ErrDependency)
		}
		if !strings.HasPrefix(*object.Key, sanitizedPrefix) {
			return nil, operationError(operationDeleteFlow, ErrDependency)
		}
		objects[index] = s3types.ObjectIdentifier{Key: object.Key}
	}
	return objects, nil
}

func (r2 *R2) verifyFlowEmpty(ctx context.Context, sourceKey string, sanitizedPrefix string) error {
	_, err := r2.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(sourceKey),
	})
	sourceRemains := err == nil
	if err != nil {
		if statusCode, hasStatusCode := httpStatusCode(err); !hasStatusCode || statusCode != http.StatusNotFound {
			return r2OperationError(ctx, operationDeleteFlow)
		}
	}

	output, err := r2.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(r2.bucket),
		Prefix:  aws.String(sanitizedPrefix),
		MaxKeys: aws.Int32(1),
	})
	if err != nil {
		return r2OperationError(ctx, operationDeleteFlow)
	}
	if sourceRemains || len(output.Contents) != 0 {
		return operationError(operationDeleteFlow, ErrFlowObjectsRemain)
	}
	return nil
}

func r2OperationError(ctx context.Context, operation string) error {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return operationError(operation, ctxErr)
	}

	return operationError(operation, ErrDependency)
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
