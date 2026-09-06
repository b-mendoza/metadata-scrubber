package storage

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
	"github.com/stretchr/testify/require"
)

func TestR2PresignsOperationSpecificExactKeysAndExpiry(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.NotFoundHandler())
	presignMethods := make(chan string, 4)
	options := adapter.client.Options()
	options.APIOptions = append(options.APIOptions, func(stack *middleware.Stack) error {
		return stack.Build.Add(middleware.BuildMiddlewareFunc(
			"CapturePresignMethod",
			func(
				ctx context.Context,
				input middleware.BuildInput,
				next middleware.BuildHandler,
			) (middleware.BuildOutput, middleware.Metadata, error) {
				request, ok := input.Request.(*smithyhttp.Request)
				if !ok {
					presignMethods <- ""
					return next.HandleBuild(ctx, input)
				}
				presignMethods <- request.Method
				return next.HandleBuild(ctx, input)
			},
		), middleware.After)
	})
	adapter.presigner = s3.NewPresignClient(s3.New(options))

	uploadExpiry := time.Minute
	uploadSizeBytes := int64(1024)
	upload, err := adapter.PresignSourceUpload(context.Background(), "file-1", uploadSizeBytes, uploadExpiry)
	require.NoError(t, err)
	require.Equal(t, http.MethodPut, <-presignMethods)
	uploadURL, err := url.Parse(upload.URL)
	require.NoError(t, err)
	require.Equal(t, "/"+testBucket+"/source/file-1", uploadURL.Path)
	require.Equal(t, strconv.FormatInt(int64(uploadExpiry/time.Second), 10), uploadURL.Query().Get("X-Amz-Expires"))
	require.Equal(t, testAccessKey, strings.Split(uploadURL.Query().Get("X-Amz-Credential"), "/")[0])
	require.Equal(t, PDFContentType, upload.RequiredHeaders.Get("Content-Type"))
	require.Equal(t, "1024", upload.RequiredHeaders.Get("Content-Length"))
	require.Empty(t, upload.RequiredHeaders.Get("Host"))
	signedHeaders := strings.Split(uploadURL.Query().Get("X-Amz-SignedHeaders"), ";")
	require.Contains(t, signedHeaders, "content-type")
	require.Contains(t, signedHeaders, "content-length")

	downloadExpiry := 2 * time.Minute
	download, err := adapter.PresignSanitizedDownload(
		context.Background(),
		"file-1",
		canonicalR2ETagOne,
		downloadExpiry,
	)
	require.NoError(t, err)
	revisionKey, err := SanitizedObjectKey("file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	require.Equal(t, http.MethodGet, <-presignMethods)
	downloadURL, err := url.Parse(download.URL)
	require.NoError(t, err)
	require.Equal(t, "/"+testBucket+"/"+revisionKey, downloadURL.Path)
	require.Equal(t, strconv.FormatInt(int64(downloadExpiry/time.Second), 10), downloadURL.Query().Get("X-Amz-Expires"))
	require.Equal(t, testAccessKey, strings.Split(downloadURL.Query().Get("X-Amz-Credential"), "/")[0])
	require.Empty(t, download.RequiredHeaders)
}
