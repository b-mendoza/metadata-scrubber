package storage

import (
	"bytes"
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// UploadSanitized writes PDF bytes to the exact immutable revision key.
func (r2 *R2) UploadSanitized(
	ctx context.Context,
	fileID string,
	sourceETag string,
	pdfBytes []byte,
) error {
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("%s: %w", operationUploadSanitized, err)
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
	})
	if err != nil {
		return r2OperationError(ctx, operationUploadSanitized)
	}

	return nil
}
