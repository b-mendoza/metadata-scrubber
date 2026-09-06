package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/storage"
)

func TestConfirmedDeleteCallsOneFlowOperationAndReturnsFixedSuccess(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-one"), ETag: canonicalETagOne}))
	require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean-one")))
	require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagTwo, []byte("clean-two")))
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(deleteRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DeleteFlow)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response deleteResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "deleted", response.Status)
	require.Equal(t, []storage.FakeOperation{storage.FakeDeleteFlow}, callOperations(fake.Calls()))
	_, exists, err := fake.SanitizedBytes(fileIDOne, canonicalETagOne)
	require.NoError(t, err)
	require.False(t, exists)
	_, exists, err = fake.SanitizedBytes(fileIDOne, canonicalETagTwo)
	require.NoError(t, err)
	require.False(t, exists)
}

func TestConfirmedDeleteTreatsAlreadyEmptyFlowAsSuccess(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(deleteRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DeleteFlow)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response deleteResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "deleted", response.Status)
	require.Equal(t, []storage.FakeOperation{storage.FakeDeleteFlow}, callOperations(fake.Calls()))
}

func TestConfirmedDeleteMapsRemainingAndDependencyFailuresSafely(t *testing.T) {
	tests := []struct {
		name        string
		storageErr  error
		wantStatus  int
		wantMessage string
	}{
		{
			name:        "verified object remains",
			storageErr:  storage.ErrFlowObjectsRemain,
			wantStatus:  http.StatusConflict,
			wantMessage: "file deletion could not be confirmed",
		},
		{
			name:        "dependency failure",
			storageErr:  errors.New("delete-provider-secret"),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not delete file",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			fake.SetFailure(storage.FakeDeleteFlow, testCase.storageErr)
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(deleteRequest{StorageKey: formatStorageKey(fileIDOne)})
			require.NoError(t, err)

			request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body))
			request.Header.Set(header.ContentType, mediatype.JSON)
			recorder := httptest.NewRecorder()
			bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DeleteFlow)).ServeHTTP(recorder, request)

			require.Equal(t, testCase.wantStatus, recorder.Code)
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.NotContains(t, recorder.Body.String(), "delete-provider-secret")
			require.Equal(t, []storage.FakeOperation{storage.FakeDeleteFlow}, callOperations(fake.Calls()))
		})
	}
}

func TestConfirmedDeleteMapsCancellationWithoutRetrySignal(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(deleteRequest{StorageKey: formatStorageKey(fileIDOne)})
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	request := httptest.NewRequest(http.MethodPost, "/api/files/delete", bytes.NewReader(body)).WithContext(ctx)
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()
	bindings.Inject(bindings.Bindings{Storage: fake})(http.HandlerFunc(handler.DeleteFlow)).ServeHTTP(recorder, request)

	require.Equal(t, http.StatusRequestTimeout, recorder.Code)
	require.Equal(t, cancellationMessage, errorMessage(t, recorder))
	require.Empty(t, recorder.Header().Get(header.RetryAfter))
	require.Empty(t, fake.Calls())
}
