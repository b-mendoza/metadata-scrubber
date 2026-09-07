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

func TestR2DeleteFlowDeletesEveryListedPageAndVerifiesBothLocations(t *testing.T) {
	t.Parallel()

	firstKey, err := SanitizedObjectKey("file-1", canonicalR2ETagOne)
	require.NoError(t, err)
	secondKey, err := SanitizedObjectKey("file-1", canonicalR2ETagTwo)
	require.NoError(t, err)

	requests := make(chan observedStorageRequest, 7)
	responses := []func(http.ResponseWriter, *observedStorageRequest){
		func(response http.ResponseWriter, _ *observedStorageRequest) {
			response.WriteHeader(http.StatusNoContent)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse(firstKey, true, "next-page"))
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse(secondKey, false, ""))
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`)
		},
		func(response http.ResponseWriter, _ *observedStorageRequest) {
			response.WriteHeader(http.StatusNotFound)
		},
		func(response http.ResponseWriter, record *observedStorageRequest) {
			response.Header().Set("Content-Type", "application/xml")
			_, record.err = io.WriteString(response, listObjectsResponse("", false, ""))
		},
	}
	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		responseIndex := int(requestCount.Add(1)) - 1
		body, readErr := io.ReadAll(request.Body)
		record := observedStorageRequest{
			method:   request.Method,
			path:     request.URL.Path,
			rawQuery: request.URL.RawQuery,
			body:     body,
			err:      readErr,
		}
		if responseIndex >= len(responses) {
			response.WriteHeader(http.StatusInternalServerError)
		} else {
			responses[responseIndex](response, &record)
		}
		requests <- record
	}))

	require.NoError(t, adapter.DeleteFlow(context.Background(), "file-1"))

	observed := make([]observedStorageRequest, 7)
	for index := range observed {
		observed[index] = <-requests
		require.NoError(t, observed[index].err)
	}
	require.Len(t, observed, 7)
	require.Equal(t, http.MethodDelete, observed[0].method)
	require.Equal(t, "/"+testBucket+"/source/file-1", observed[0].path)
	require.Equal(t, http.MethodGet, observed[1].method)
	require.Contains(t, observed[1].rawQuery, "list-type=2")
	require.Contains(t, observed[1].rawQuery, "prefix=sanitized%2Ffile-1%2F")
	require.Equal(t, http.MethodPost, observed[2].method)
	require.Contains(t, string(observed[2].body), firstKey)
	require.Equal(t, http.MethodGet, observed[3].method)
	require.Contains(t, observed[3].rawQuery, "continuation-token=next-page")
	require.Equal(t, http.MethodPost, observed[4].method)
	require.Contains(t, string(observed[4].body), secondKey)
	require.Equal(t, http.MethodHead, observed[5].method)
	require.Equal(t, "/"+testBucket+"/source/file-1", observed[5].path)
	require.Equal(t, http.MethodGet, observed[6].method)
	require.Contains(t, observed[6].rawQuery, "max-keys=1")
}

func TestR2DeleteFlowRejectsListedObjectOutsideTheRequestedPrefix(t *testing.T) {
	t.Parallel()

	foreignObjectKey, err := SanitizedObjectKey("other-file-identifier-sentinel", canonicalR2ETagOne)
	require.NoError(t, err)
	var requestCount atomic.Int64
	var deleteObjectsRequestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodPost {
			deleteObjectsRequestCount.Add(1)
		}
		switch requestCount.Add(1) {
		case 1:
			response.WriteHeader(http.StatusNoContent)
		case 2:
			response.Header().Set("Content-Type", "application/xml")
			_, writeErr := io.WriteString(response, listObjectsResponse(foreignObjectKey, false, ""))
			assert.NoError(t, writeErr)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
	}))

	err = adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

	require.ErrorIs(t, err, ErrDependency)
	assertSafeStorageError(t, err)
	require.Equal(t, int64(2), requestCount.Load())
	require.Zero(t, deleteObjectsRequestCount.Load())
}

func TestR2DeleteFlowVerifiesAfterAPartialProviderResult(t *testing.T) {
	t.Parallel()

	objectKey, err := SanitizedObjectKey("file-identifier-sentinel", canonicalR2ETagOne)
	require.NoError(t, err)
	for _, testCase := range []struct {
		name          string
		finalListKey  string
		assertOutcome func(*testing.T, error)
	}{
		{
			name: "verification is empty",
			assertOutcome: func(t *testing.T, err error) {
				require.NoError(t, err)
			},
		},
		{
			name:         "object remains",
			finalListKey: objectKey,
			assertOutcome: func(t *testing.T, err error) {
				require.ErrorIs(t, err, ErrFlowObjectsRemain)
				require.NotErrorIs(t, err, ErrDependency)
				assertSafeStorageError(t, err)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var requestCount atomic.Int64
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				switch requestCount.Add(1) {
				case 1:
					response.WriteHeader(http.StatusNoContent)
				case 2:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(objectKey, false, ""))
					assert.NoError(t, writeErr)
				case 3:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, `<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Error><Key>`+objectKey+`</Key><Code>AccessDenied</Code><Message>provider-body-sentinel</Message></Error></DeleteResult>`)
					assert.NoError(t, writeErr)
				case 4:
					response.WriteHeader(http.StatusNotFound)
				case 5:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(testCase.finalListKey, false, ""))
					assert.NoError(t, writeErr)
				default:
					response.WriteHeader(http.StatusInternalServerError)
				}
			}))

			err := adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

			testCase.assertOutcome(t, err)
			require.Equal(t, int64(5), requestCount.Load())
		})
	}
}

func TestR2DeleteFlowReturnsTypedFailureWhenFinalVerificationFindsAnObject(t *testing.T) {
	for _, testCase := range []struct {
		name          string
		finalHeadCode int
		finalListKey  string
	}{
		{name: "source remains", finalHeadCode: http.StatusOK},
		{name: "sanitized revision remains", finalHeadCode: http.StatusNotFound, finalListKey: "sanitized/file-identifier-sentinel/remaining-object-sentinel"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var requestCount atomic.Int64
			adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				switch requestCount.Add(1) {
				case 1:
					response.WriteHeader(http.StatusNoContent)
				case 2:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse("", false, ""))
					assert.NoError(t, writeErr)
				case 3:
					response.WriteHeader(testCase.finalHeadCode)
				case 4:
					response.Header().Set("Content-Type", "application/xml")
					_, writeErr := io.WriteString(response, listObjectsResponse(testCase.finalListKey, false, ""))
					assert.NoError(t, writeErr)
				default:
					response.WriteHeader(http.StatusInternalServerError)
				}
			}))

			err := adapter.DeleteFlow(context.Background(), "file-identifier-sentinel")

			require.ErrorIs(t, err, ErrFlowObjectsRemain)
			require.NotErrorIs(t, err, ErrDependency)
			assertSafeStorageError(t, err)
			require.Equal(t, int64(4), requestCount.Load())
		})
	}
}

func TestR2DeleteFlowTreatsMissingObjectsAsSuccess(t *testing.T) {
	t.Parallel()

	var requestCount atomic.Int64
	adapter := newTestR2Server(t, http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch requestCount.Add(1) {
		case 1, 3:
			response.WriteHeader(http.StatusNotFound)
		case 2, 4:
			response.Header().Set("Content-Type", "application/xml")
			_, writeErr := io.WriteString(response, listObjectsResponse("", false, ""))
			assert.NoError(t, writeErr)
		default:
			response.WriteHeader(http.StatusInternalServerError)
		}
	}))

	require.NoError(t, adapter.DeleteFlow(context.Background(), "file-1"))
	require.Equal(t, int64(4), requestCount.Load())
}
