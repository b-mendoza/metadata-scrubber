package storage

import (
	"context"
	"io"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestR2SanitizedUploadPinsPDFContentTypeAndPerformsNoFollowUp(t *testing.T) {
	t.Parallel()

	revisionKey, err := SanitizedObjectKey("file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	pdfBytes := []byte("%PDF-1.7\nsmall sanitized PDF")
	var requestCount atomic.Int64
	requests := make(chan observedStorageRequest, 2)

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requestCount.Add(1)
		body, readErr := io.ReadAll(request.Body)
		requests <- observedStorageRequest{
			method:             request.Method,
			path:               request.URL.Path,
			contentType:        request.Header.Get("Content-Type"),
			sourceETagMetadata: request.Header.Get("X-Amz-Meta-Source-Etag"),
			body:               body,
			err:                readErr,
		}
		response.WriteHeader(http.StatusOK)
	}))

	err = adapter.UploadSanitized(context.Background(), "file-1", canonicalR2ETagOne, pdfBytes)

	require.NoError(t, err)
	request := <-requests
	require.NoError(t, request.err)
	require.Equal(t, http.MethodPut, request.method)
	require.Equal(t, "/"+testBucket+"/"+revisionKey, request.path)
	require.Equal(t, PDFContentType, request.contentType)
	require.Empty(t, request.sourceETagMetadata)
	require.Equal(t, pdfBytes, request.body)
	require.Equal(t, int64(1), requestCount.Load())
}

func TestR2SanitizedUploadReturnsASanitizedDependencyError(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("X-Amz-Request-Id", "request-id-sentinel")
		response.WriteHeader(http.StatusInternalServerError)
		_, err := io.WriteString(response, "provider-body-sentinel")
		assert.NoError(t, err)
	}))

	err := adapter.UploadSanitized(
		context.Background(),
		"file-identifier-sentinel",
		canonicalR2ETagOne,
		[]byte("pdf"),
	)

	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
	assertSafeStorageError(t, err)
}
