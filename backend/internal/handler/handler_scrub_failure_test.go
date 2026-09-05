package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

type scrubFailureTestCase struct {
	name        string
	pdfBytes    []byte
	failureOp   storage.FakeOperation
	cleanErr    error
	wantStatus  int
	wantMessage string
	wantCalls   []storage.FakeOperation
}

func TestScrubFailuresStopAtTheFailedStage(t *testing.T) {
	tests := []scrubFailureTestCase{
		{
			name:        "lookup failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakeSanitizedExists,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not check scrubbed file",
			wantCalls:   []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists},
		},
		{
			name:        "spoofed content",
			pdfBytes:    []byte("not-pdf"),
			wantStatus:  http.StatusUnsupportedMediaType,
			wantMessage: "file is not a PDF",
			wantCalls:   []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "signed PDF",
			pdfBytes:    []byte("%PDF-signed"),
			cleanErr:    scrub.ErrSignedPDF,
			wantStatus:  http.StatusUnprocessableEntity,
			wantMessage: "signed PDFs are not supported in v1",
			wantCalls:   []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "clean failure",
			pdfBytes:    []byte("%PDF-source"),
			cleanErr:    errors.New("pdf-secret"),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not scrub PDF",
			wantCalls:   []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "upload failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakeUploadSanitized,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not store scrubbed file",
			wantCalls:   []storage.FakeOperation{storage.FakeSourceExists, storage.FakeSanitizedExists, storage.FakeDownloadSource, storage.FakeUploadSanitized},
		},
		{
			name:        "presign failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakePresignSanitizedDownload,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not create download",
			wantCalls: []storage.FakeOperation{
				storage.FakeSourceExists,
				storage.FakeSanitizedExists,
				storage.FakeDownloadSource,
				storage.FakeUploadSanitized,
				storage.FakePresignSanitizedDownload,
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) { runScrubFailureTest(t, testCase) })
	}
}

func runScrubFailureTest(t *testing.T, testCase scrubFailureTestCase) {
	t.Helper()
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: testCase.pdfBytes, ETag: "0123456789abcdef0123456789abcdef"}))
	if testCase.failureOp != "" {
		fake.SetFailure(testCase.failureOp, errors.New("provider-secret"))
	}
	cleanCalls := 0
	handler := newTestHandler(t, nil, func(input []byte) ([]byte, error) {
		cleanCalls++
		if testCase.cleanErr != nil {
			return nil, testCase.cleanErr
		}
		return bytes.Clone(input), nil
	}, nil)
	body, err := json.Marshal(scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "0123456789abcdef0123456789abcdef"})
	require.NoError(t, err)
	recorder := serveRequest(t, handlerRequest{
		ctx: context.Background(), contentType: mediatype.JSON,
		handler: handler, objectStorage: fake, method: scrubMethod,
		body: string(body),
	})

	require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
	require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
	require.Equal(t, testCase.wantCalls, callOperations(fake.Calls()))
	require.NotContains(t, recorder.Body.String(), "provider-secret")
	require.NotContains(t, recorder.Body.String(), "pdf-secret")
	require.Empty(t, handler.permits)
	if !bytes.HasPrefix(testCase.pdfBytes, []byte("%PDF-")) || testCase.failureOp == storage.FakeSanitizedExists {
		require.Zero(t, cleanCalls)
	}
}
