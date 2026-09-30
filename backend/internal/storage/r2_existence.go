package storage

import (
	"context"
	"fmt"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// SourceExists reports whether the exact source object exists.
func (r2 *R2) SourceExists(ctx context.Context, fileID string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("%s: %w", operationCheckSourceObject, err)
	}
	objectKey, err := SourceObjectKey(fileID)
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
	if statusCode, hasStatusCode := httpStatusCode(err); hasStatusCode && statusCode == http.StatusNotFound {
		return false, nil
	}

	return false, r2OperationError(ctx, operationCheckSourceObject)
}

// SanitizedExists reports whether the exact immutable sanitized revision exists.
func (r2 *R2) SanitizedExists(
	ctx context.Context,
	fileID string,
	sourceETag string,
) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, fmt.Errorf("%s: %w", operationCheckSanitizedObject, err)
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
	if statusCode, hasStatusCode := httpStatusCode(err); hasStatusCode && statusCode == http.StatusNotFound {
		return false, nil
	}

	return false, r2OperationError(ctx, operationCheckSanitizedObject)
}
