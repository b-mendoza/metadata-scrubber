package storage

import (
	"context"
	"fmt"
	"io"
	"maps"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// DownloadSource reads the current source revision and optionally enforces an expected ETag.
func (r2 *R2) DownloadSource(
	ctx context.Context,
	fileID string,
	expectedETag string,
) (SourceObject, error) {
	if err := ctx.Err(); err != nil {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, err)
	}
	objectKey, err := validateSourceReadInput(fileID, expectedETag)
	if err != nil {
		return SourceObject{}, err
	}

	input := &s3.GetObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(objectKey),
	}
	if expectedETag != "" {
		input.IfMatch = aws.String("\"" + expectedETag + "\"")
	}

	output, err := r2.client.GetObject(ctx, input)
	if err != nil {
		return SourceObject{}, classifySourceDownloadError(ctx, err, expectedETag)
	}
	return readSourceObject(ctx, output)
}

func classifySourceDownloadError(ctx context.Context, err error, expectedETag string) error {
	statusCode, hasStatusCode := httpStatusCode(err)
	if hasStatusCode && expectedETag != "" && statusCode == http.StatusPreconditionFailed {
		return fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceRevisionConflict)
	}
	if hasStatusCode && statusCode == http.StatusNotFound {
		return fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceNotFound)
	}
	return r2OperationError(ctx, operationDownloadSource)
}

func readSourceObject(ctx context.Context, output *s3.GetObjectOutput) (SourceObject, error) {
	if output.Body == nil {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrDependency)
	}
	if output.ETag == nil {
		if err := output.Body.Close(); err != nil {
			return SourceObject{}, r2OperationError(ctx, operationDownloadSource)
		}
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrDependency)
	}

	pdfBytes, readErr := io.ReadAll(io.LimitReader(output.Body, MaxSourceObjectBytes+1))
	closeErr := output.Body.Close()
	if readErr != nil || closeErr != nil {
		return SourceObject{}, r2OperationError(ctx, operationDownloadSource)
	}
	if len(pdfBytes) > MaxSourceObjectBytes {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrSourceObjectTooLarge)
	}

	normalizedETag, err := NormalizeProviderETag(*output.ETag)
	if err != nil {
		return SourceObject{}, fmt.Errorf("%s: %w", operationDownloadSource, ErrDependency)
	}
	return SourceObject{PDFBytes: pdfBytes, Metadata: maps.Clone(output.Metadata), ETag: normalizedETag}, nil
}
