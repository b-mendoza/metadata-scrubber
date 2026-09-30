package storage

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// DeleteFlow removes the source and every sanitized revision for one file ID.
func (r2 *R2) DeleteFlow(ctx context.Context, fileID string) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s: %w", operationDeleteFlow, err)
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
		return fmt.Errorf("%s: %w", operationDeleteFlow, ErrDependency)
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
			return nil, fmt.Errorf("%s: %w", operationDeleteFlow, ErrDependency)
		}
		if !strings.HasPrefix(*object.Key, sanitizedPrefix) {
			return nil, fmt.Errorf("%s: %w", operationDeleteFlow, ErrDependency)
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
		return fmt.Errorf("%s: %w", operationDeleteFlow, ErrFlowObjectsRemain)
	}
	return nil
}
