package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestR2SourceReadsReturnCopiedMetadataAndRoundTripIfMatch(t *testing.T) {
	t.Parallel()

	requests := make(chan observedStorageRequest, 2)
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("ETag", `"`+canonicalR2ETagOne+`"`)
		response.Header().Set("X-Amz-Meta-Author", "synthetic-author")
		response.Header().Set("X-Amz-Meta-Document-Type", "report")
		_, writeErr := io.WriteString(response, "source-pdf")
		requests <- observedStorageRequest{
			method:  request.Method,
			path:    request.URL.Path,
			ifMatch: request.Header.Get("If-Match"),
			err:     writeErr,
		}
	}))

	dryRun, err := adapter.DownloadSource(context.Background(), "file-1", "")
	require.NoError(t, err)
	require.Equal(t, []byte("source-pdf"), dryRun.PDFBytes)
	require.Equal(t, canonicalR2ETagOne, dryRun.ETag)
	require.Equal(t, map[string]string{
		"author":        "synthetic-author",
		"document-type": "report",
	}, dryRun.Metadata)

	_, err = adapter.DownloadSource(context.Background(), "file-1", dryRun.ETag)
	require.NoError(t, err)

	dryRunRequest := <-requests
	matchedRequest := <-requests
	for _, request := range []observedStorageRequest{dryRunRequest, matchedRequest} {
		require.NoError(t, request.err)
		require.Equal(t, http.MethodGet, request.method)
		require.Equal(t, "/"+testBucket+"/source/file-1", request.path)
	}
	require.Empty(t, dryRunRequest.ifMatch)
	require.Equal(t, `"`+canonicalR2ETagOne+`"`, matchedRequest.ifMatch)
}

func TestR2EnforcesTheSourceObjectMemoryBoundary(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		size    int
		wantErr bool
	}{
		{name: "exactly 10 MB", size: MaxSourceObjectBytes},
		{name: "10 MB plus one byte", size: MaxSourceObjectBytes + 1, wantErr: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			body := &observedReadCloser{Reader: bytes.NewReader(make([]byte, testCase.size))}
			adapter := newTestR2("https://storage.invalid", &http.Client{Transport: roundTripFunc(
				func(request *http.Request) (*http.Response, error) {
					return &http.Response{
						Status:     "200 OK",
						StatusCode: http.StatusOK,
						Proto:      "HTTP/1.1",
						ProtoMajor: 1,
						ProtoMinor: 1,
						Header: http.Header{
							"Etag":              []string{`"` + canonicalR2ETagOne + `"`},
							"X-Amz-Meta-Author": []string{"synthetic-author"},
						},
						Body:          body,
						ContentLength: int64(testCase.size),
						Request:       request,
					}, nil
				},
			)})

			source, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

			require.True(t, body.closed.Load())
			if testCase.wantErr {
				require.ErrorIs(t, err, ErrSourceObjectTooLarge)
				require.NotErrorIs(t, err, ErrDependency)
				require.NotErrorIs(t, err, ErrSourceRevisionConflict)
				require.Empty(t, source)
				assertSafeStorageError(t, err)
				return
			}

			require.NoError(t, err)
			require.Len(t, source.PDFBytes, MaxSourceObjectBytes)
			require.Equal(t, canonicalR2ETagOne, source.ETag)
			require.Equal(t, "synthetic-author", source.Metadata["author"])
		})
	}
}

func TestR2ClassifiesSourceDownloadStatuses(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name         string
		status       int
		expectedETag string
		wantErr      error
		notErr       error
		checkSafe    bool
	}{
		{
			name:         "412 with expected ETag is revision conflict",
			status:       http.StatusPreconditionFailed,
			expectedETag: canonicalR2ETagOne,
			wantErr:      ErrSourceRevisionConflict,
			notErr:       ErrDependency,
		},
		{
			name:      "412 without expected ETag is dependency failure",
			status:    http.StatusPreconditionFailed,
			wantErr:   ErrDependency,
			notErr:    ErrSourceRevisionConflict,
			checkSafe: true,
		},
		{
			name:         "403 with expected ETag is dependency failure",
			status:       http.StatusForbidden,
			expectedETag: canonicalR2ETagOne,
			wantErr:      ErrDependency,
			notErr:       ErrSourceRevisionConflict,
			checkSafe:    true,
		},
		{
			name:         "404 with expected ETag is source not found",
			status:       http.StatusNotFound,
			expectedETag: canonicalR2ETagOne,
			wantErr:      ErrSourceNotFound,
			notErr:       ErrSourceRevisionConflict,
		},
		{
			name:      "404 without expected ETag is source not found",
			status:    http.StatusNotFound,
			wantErr:   ErrSourceNotFound,
			notErr:    ErrDependency,
			checkSafe: true,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			adapter := newTestR2StatusServer(t, testCase.status)

			source, err := adapter.DownloadSource(
				context.Background(),
				"file-identifier-sentinel",
				testCase.expectedETag,
			)

			require.Empty(t, source)
			require.ErrorIs(t, err, testCase.wantErr)
			require.NotErrorIs(t, err, testCase.notErr)
			if testCase.checkSafe {
				assertSafeStorageError(t, err)
			}
		})
	}
}

func TestR2ClassifiesSourceBodyReadAndCloseFailures(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name     string
		reader   io.Reader
		closeErr error
	}{
		{
			name:   "response body read failure",
			reader: iotest.ErrReader(errors.New("provider-body-sentinel")),
		},
		{
			name:     "response body close failure",
			reader:   strings.NewReader("source-pdf"),
			closeErr: errors.New("provider-body-sentinel"),
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			body := &observedReadCloser{Reader: testCase.reader, closeErr: testCase.closeErr}
			adapter := newTestR2("https://endpoint-sentinel.invalid", &http.Client{Transport: roundTripFunc(
				func(request *http.Request) (*http.Response, error) {
					return &http.Response{
						Status:     "200 OK",
						StatusCode: http.StatusOK,
						Proto:      "HTTP/1.1",
						ProtoMajor: 1,
						ProtoMinor: 1,
						Header: http.Header{
							"Etag": []string{`"` + canonicalR2ETagOne + `"`},
						},
						Body:    body,
						Request: request,
					}, nil
				},
			)})

			source, err := adapter.DownloadSource(context.Background(), "file-identifier-sentinel", "")

			require.True(t, body.closed.Load())
			require.ErrorIs(t, err, ErrDependency)
			assertSafeStorageError(t, err)
			require.Empty(t, source)
		})
	}
}

func TestR2TreatsMalformedProviderETagsAsOrdinaryFailures(t *testing.T) {
	t.Parallel()

	for _, providerETag := range []string{"", canonicalR2ETagOne} {
		t.Run(providerETag, func(t *testing.T) {
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				if providerETag != "" {
					response.Header().Set("ETag", providerETag)
				}
				_, err := io.WriteString(response, "source-pdf")
				assert.NoError(t, err)
			}))

			_, err := adapter.DownloadSource(context.Background(), "file-1", "")

			require.ErrorIs(t, err, ErrDependency)
			require.NotErrorIs(t, err, ErrSourceRevisionConflict)
		})
	}
}
