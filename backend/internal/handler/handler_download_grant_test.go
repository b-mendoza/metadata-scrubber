package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

func TestDownloadGrantRefreshesExactSanitizedRevisionFromOneOperationTime(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
	inspectCalls, cleanCalls := 0, 0
	operationTime := time.Date(2026, time.September, 1, 12, 34, 56, 987_000_000, time.UTC)
	handler := newTestHandlerWithLogger(t, testHandlerOptions{
		permits: make(chan struct{}, ProcessingPermitCount),
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
			inspectCalls++
			return nil, nil
		},
		clean: func([]byte) ([]byte, error) {
			cleanCalls++
			return nil, nil
		},
		now: func() time.Time { return operationTime },
	})
	body, err := json.Marshal(downloadGrantRequest{
		StorageKey: formatStorageKey(fileIDOne),
		ETag:       canonicalETagOne,
	})
	require.NoError(t, err)

	recorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), contentType: mediatype.JSON,
		handler: handler, objectStorage: fake, method: downloadGrantMethod, body: string(body),
	})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response downloadGrantResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.NotEmpty(t, response.DownloadURL)
	require.Equal(t, "2026-09-01T12:49:56Z", response.ExpiresAt)
	calls := fake.Calls()
	require.Equal(t, []storage.FakeOperation{
		storage.FakeSanitizedExists,
		storage.FakePresignSanitizedDownload,
	}, callOperations(calls))
	for _, call := range calls {
		require.Equal(t, fileIDOne, call.FileID)
		require.Equal(t, canonicalETagOne, call.SourceETag)
	}
	require.Equal(t, downloadGrantExpiry, calls[1].Expiry)
	require.Zero(t, inspectCalls)
	require.Zero(t, cleanCalls)
	require.Empty(t, handler.permits)
}

func TestDownloadGrantReturnsNotFoundWithoutPresignForMissingRevision(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, nil, nil, nil)
	body, err := json.Marshal(downloadGrantRequest{
		StorageKey: formatStorageKey(fileIDOne),
		ETag:       canonicalETagOne,
	})
	require.NoError(t, err)

	recorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), contentType: mediatype.JSON,
		handler: handler, objectStorage: fake, method: downloadGrantMethod, body: string(body),
	})

	require.Equal(t, http.StatusNotFound, recorder.Code)
	require.Equal(t, "scrubbed file not found", errorMessage(t, recorder))
	require.Equal(t, []storage.FakeOperation{storage.FakeSanitizedExists}, callOperations(fake.Calls()))
}

func TestDownloadGrantFailuresStopAtFailedStorageOperation(t *testing.T) {
	tests := []struct {
		name        string
		failureOp   storage.FakeOperation
		wantMessage string
		wantCalls   []storage.FakeOperation
	}{
		{
			name:        "lookup failure",
			failureOp:   storage.FakeSanitizedExists,
			wantMessage: "could not check scrubbed file",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists},
		},
		{
			name:        "presign failure",
			failureOp:   storage.FakePresignSanitizedDownload,
			wantMessage: "could not create download",
			wantCalls: []storage.FakeOperation{
				storage.FakeSanitizedExists,
				storage.FakePresignSanitizedDownload,
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			require.NoError(t, fake.SetSanitized(fileIDOne, canonicalETagOne, []byte("clean")))
			fake.SetFailure(testCase.failureOp, errors.New("download-provider-secret"))
			handler := newTestHandler(t, nil, nil, nil)
			body, err := json.Marshal(downloadGrantRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       canonicalETagOne,
			})
			require.NoError(t, err)

			recorder := serveRequest(t, handlerRequest{
				ctx: context.Background(), contentType: mediatype.JSON,
				handler: handler, objectStorage: fake, method: downloadGrantMethod, body: string(body),
			})

			require.Equal(t, http.StatusInternalServerError, recorder.Code)
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.NotContains(t, recorder.Body.String(), "download-provider-secret")
			require.Equal(t, testCase.wantCalls, callOperations(fake.Calls()))
		})
	}
}
