package handler

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	fileIDOne           = "00000000-0000-4000-8000-000000000001"
	fileIDTwo           = "00000000-0000-4000-8000-000000000002"
	fileIDThree         = "00000000-0000-4000-8000-000000000003"
	generatedFileID     = "00010203-0405-4607-8809-0a0b0c0d0e0f"
	storageKeyDigestOne = "77376c868b92"
	storageKeyDigestTwo = "8fb905d391d9"
	canonicalETagOne    = "0123456789abcdef0123456789abcdef"
	canonicalETagTwo    = "fedcba9876543210fedcba9876543210"
	canonicalETagThree  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	handler := New(slog.New(slog.DiscardHandler))
	handler.inspect = func([]byte) ([]scrub.Field, error) { return nil, nil }
	handler.clean = func(input []byte) ([]byte, error) { return bytes.Clone(input), nil }
	handler.admissionJitter = func() int { return 0 }
	return handler
}

func errorMessage(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body.Error
}

func callOperations(calls []storage.FakeCall) []storage.FakeOperation {
	operations := make([]storage.FakeOperation, 0, len(calls))
	for _, call := range calls {
		operations = append(operations, call.Operation)
	}
	return operations
}
