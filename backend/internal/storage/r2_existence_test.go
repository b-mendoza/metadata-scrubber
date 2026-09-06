package storage

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestR2SourceExistenceUsesOnlyTheExactSourceKey(t *testing.T) {
	t.Parallel()

	requests := make(chan observedStorageRequest, 3)
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests <- observedStorageRequest{method: request.Method, path: request.URL.Path}
		response.WriteHeader(http.StatusOK)
	}))

	exists, err := adapter.SourceExists(context.Background(), "file-1")
	require.NoError(t, err)
	require.True(t, exists)

	request := <-requests
	require.Equal(t, http.MethodHead, request.method)
	require.Equal(t, "/"+testBucket+"/source/file-1", request.path)
}

func TestR2SourceExistenceMapsOnlyNotFoundToAbsence(t *testing.T) {
	t.Parallel()

	missing := newTestR2StatusServer(t, http.StatusNotFound)
	exists, err := missing.SourceExists(context.Background(), "file-1")
	require.NoError(t, err)
	require.False(t, exists)

	forbidden := newTestR2StatusServer(t, http.StatusForbidden)
	exists, err = forbidden.SourceExists(context.Background(), "file-1")
	require.False(t, exists)
	require.ErrorIs(t, err, ErrDependency)
}

func TestR2SanitizedExistenceUsesOnlyTheExactRevisionKey(t *testing.T) {
	t.Parallel()

	revisionOneKey, err := SanitizedObjectKey("file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	revisionTwoKey, err := SanitizedObjectKey("file-1", canonicalR2ETagTwo)
	require.NoError(t, err)

	requests := make(chan observedStorageRequest, 2)
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/" + testBucket + "/" + revisionOneKey:
			response.Header().Set("ETag", `"ignored-output-etag"`)
			response.Header().Set("X-Amz-Meta-Source-Etag", "ignored-metadata")
		case "/" + testBucket + "/" + revisionTwoKey:
			response.WriteHeader(http.StatusNotFound)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
		requests <- observedStorageRequest{method: request.Method, path: request.URL.Path}
	}))

	exists, err := adapter.SanitizedExists(context.Background(), "file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	require.True(t, exists)

	exists, err = adapter.SanitizedExists(context.Background(), "file-1", canonicalR2ETagTwo)
	require.NoError(t, err)
	require.False(t, exists)

	revisionOneRequest := <-requests
	revisionTwoRequest := <-requests
	require.Equal(t, http.MethodHead, revisionOneRequest.method)
	require.Equal(t, http.MethodHead, revisionTwoRequest.method)
	require.Equal(t, "/"+testBucket+"/"+revisionOneKey, revisionOneRequest.path)
	require.Equal(t, "/"+testBucket+"/"+revisionTwoKey, revisionTwoRequest.path)
}

func TestR2SanitizedExistenceMapsOnlyNotFoundToAbsence(t *testing.T) {
	t.Parallel()

	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusForbidden)
	}))

	exists, err := adapter.SanitizedExists(context.Background(), "file-1", canonicalR2ETagOne)

	require.False(t, exists)
	require.ErrorIs(t, err, ErrDependency)
	require.NotErrorIs(t, err, ErrSourceRevisionConflict)
}
