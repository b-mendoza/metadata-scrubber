package storage

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// PresignSourceUpload returns a private PDF PUT grant scoped to the source key.
func (r2 *R2) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (PresignedRequest, error) {
	if err := ctx.Err(); err != nil {
		return PresignedRequest{}, fmt.Errorf("%s: %w", operationPresignSourceUpload, err)
	}
	objectKey, err := validateSourceUploadInput(fileID, sizeBytes, expiry)
	if err != nil {
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
		return PresignedRequest{}, r2OperationError(ctx, operationPresignSourceUpload)
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
	if err := ctx.Err(); err != nil {
		return PresignedRequest{}, fmt.Errorf("%s: %w", operationPresignSanitizedDownload, err)
	}
	objectKey, err := validateSanitizedDownloadInput(fileID, sourceETag, expiry)
	if err != nil {
		return PresignedRequest{}, err
	}

	presigned, err := r2.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r2.bucket),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(expiry))
	if err != nil {
		return PresignedRequest{}, r2OperationError(ctx, operationPresignSanitizedDownload)
	}

	return PresignedRequest{
		URL:             presigned.URL,
		RequiredHeaders: browserRequestHeaders(presigned.SignedHeader),
	}, nil
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
