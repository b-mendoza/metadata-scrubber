package handler

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/bindings"
	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
	"metadata-scrubber/internal/storage"
)

const (
	fileIDOne       = "00000000-0000-4000-8000-000000000001"
	fileIDTwo       = "00000000-0000-4000-8000-000000000002"
	fileIDThree     = "00000000-0000-4000-8000-000000000003"
	generatedFileID = "00010203-0405-4607-8809-0a0b0c0d0e0f"
)

func TestReachabilityReportsReachableStatus(t *testing.T) {
	recorder := httptest.NewRecorder()
	Reachability(recorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
	require.JSONEq(t, `{"status":"reachable"}`, recorder.Body.String())
}

func TestJSONEndpointsValidateEveryBoundaryBeforeWork(t *testing.T) {
	endpoints := []struct {
		name                   string
		method                 handlerMethod
		wrongTypeBody          string
		missingFieldBody       string
		oversizedBody          string
		acceptedParameterBody  string
		configureAccepted      func(*testing.T, *storage.Fake)
		wantAcceptedOperations []storage.FakeOperation
		wantInspectCalls       int
		wantCleanCalls         int
	}{
		{
			name:                   "upload",
			method:                 uploadMethod,
			wrongTypeBody:          `{"fileName":1,"fileSizeBytes":1}`,
			missingFieldBody:       `{"fileName":"report.pdf"}`,
			oversizedBody:          `{"fileName":"` + strings.Repeat("x", maxJSONBodyBytes) + `","fileSizeBytes":1}`,
			acceptedParameterBody:  `{"fileName":"report.pdf","fileSizeBytes":1}` + " \n\t",
			wantAcceptedOperations: []storage.FakeOperation{storage.FakePresignSourceUpload},
		},
		{
			name:                  "dry run",
			method:                dryRunMethod,
			wrongTypeBody:         `{"storageKey":1}`,
			missingFieldBody:      `{}`,
			oversizedBody:         `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `"}`,
			acceptedParameterBody: `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}` + " \n\t",
			configureAccepted: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
					PDFBytes: []byte("%PDF-source"),
					ETag:     "revision-one",
				}))
			},
			wantAcceptedOperations: []storage.FakeOperation{storage.FakeDownloadSource},
			wantInspectCalls:       1,
		},
		{
			name:                  "scrub",
			method:                scrubMethod,
			wrongTypeBody:         `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":1}`,
			missingFieldBody:      `{"storageKey":"` + formatStorageKey(fileIDOne) + `"}`,
			oversizedBody:         `{"storageKey":"` + strings.Repeat("x", maxJSONBodyBytes) + `","etag":"revision-one"}`,
			acceptedParameterBody: `{"storageKey":"` + formatStorageKey(fileIDOne) + `","etag":"revision-one"}` + " \n\t",
			configureAccepted: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
					PDFBytes: []byte("%PDF-source"),
					ETag:     "revision-one",
				}))
			},
			wantAcceptedOperations: []storage.FakeOperation{
				storage.FakeSanitizedExists,
				storage.FakeDownloadSource,
				storage.FakeUploadSanitized,
				storage.FakePresignSanitizedDownload,
			},
			wantCleanCalls: 1,
		},
	}

	for _, endpoint := range endpoints {
		t.Run(endpoint.name, func(t *testing.T) {
			tests := []struct {
				name        string
				contentType string
				body        string
				wantStatus  int
			}{
				{name: "missing content type", body: `{}`, wantStatus: http.StatusUnsupportedMediaType},
				{name: "wrong content type", contentType: "text/plain", body: `{}`, wantStatus: http.StatusUnsupportedMediaType},
				{name: "empty body", contentType: mediatype.JSON, wantStatus: http.StatusBadRequest},
				{name: "malformed JSON", contentType: mediatype.JSON, body: `{`, wantStatus: http.StatusBadRequest},
				{name: "unknown field", contentType: mediatype.JSON, body: `{"unexpected":true}`, wantStatus: http.StatusBadRequest},
				{name: "multiple JSON values", contentType: mediatype.JSON, body: `{} {}`, wantStatus: http.StatusBadRequest},
				{name: "non-whitespace trailing data", contentType: mediatype.JSON, body: `{} trailing`, wantStatus: http.StatusBadRequest},
				{name: "wrong JSON type", contentType: mediatype.JSON, body: endpoint.wrongTypeBody, wantStatus: http.StatusBadRequest},
				{name: "missing required field", contentType: mediatype.JSON, body: endpoint.missingFieldBody, wantStatus: http.StatusBadRequest},
				{name: "oversized body", contentType: mediatype.JSON, body: endpoint.oversizedBody, wantStatus: http.StatusBadRequest},
			}

			for _, testCase := range tests {
				t.Run(testCase.name, func(t *testing.T) {
					fake := storage.NewFake()
					inspectCalls, cleanCalls := 0, 0
					handler := newTestHandler(t, make(chan struct{}, 2), func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
						inspectCalls++
						return nil, nil
					}, func(input []byte) ([]byte, error) {
						cleanCalls++
						return bytes.Clone(input), nil
					}, deterministicEntropy)
					recorder := serveRequest(
						context.Background(),
						t,
						handler,
						fake,
						endpoint.method,
						testCase.contentType,
						testCase.body,
					)

					require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
					require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
					require.NotEmpty(t, errorMessage(t, recorder))
					require.Empty(t, fake.Calls())
					require.Zero(t, inspectCalls)
					require.Zero(t, cleanCalls)
				})
			}

			t.Run("content type parameters and trailing whitespace reach successful work", func(t *testing.T) {
				fake := storage.NewFake()
				if endpoint.configureAccepted != nil {
					endpoint.configureAccepted(t, fake)
				}
				inspectCalls, cleanCalls := 0, 0
				handler := newTestHandler(t, make(chan struct{}, 2), func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
					inspectCalls++
					return nil, nil
				}, func(input []byte) ([]byte, error) {
					cleanCalls++
					return bytes.Clone(input), nil
				}, deterministicEntropy)

				recorder := serveRequest(
					context.Background(),
					t,
					handler,
					fake,
					endpoint.method,
					mediatype.JSON+"; charset=utf-8; profile=safe",
					endpoint.acceptedParameterBody,
				)

				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
				require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType))
				switch endpoint.method {
				case uploadMethod:
					var response uploadResponse
					require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
					require.Equal(t, formatStorageKey(generatedFileID), response.StorageKey)
					require.NotEmpty(t, response.UploadURL)
				case dryRunMethod:
					require.JSONEq(t, `{"etag":"revision-one","fields":[]}`, recorder.Body.String())
				case scrubMethod:
					var response scrubResponse
					require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
					require.Equal(t, "done", response.Status)
					require.NotEmpty(t, response.Result.DownloadURL)
				}
				require.Equal(t, endpoint.wantAcceptedOperations, callOperations(fake.Calls()))
				require.Equal(t, endpoint.wantInspectCalls, inspectCalls)
				require.Equal(t, endpoint.wantCleanCalls, cleanCalls)
			})
		})
	}
}

func TestUploadValidatesIntakeAndCreatesOpaqueGrant(t *testing.T) {
	tests := []struct {
		name       string
		fileName   string
		size       int64
		wantStatus int
	}{
		{name: "ordinary name", fileName: "report.pdf", size: 1, wantStatus: http.StatusOK},
		{name: "unicode non PDF display name", fileName: "résumé.txt", size: storage.MaxSourceObjectBytes, wantStatus: http.StatusOK},
		{name: "blank name", fileName: " \t", size: 1, wantStatus: http.StatusBadRequest},
		{name: "path separator", fileName: "folder/report.pdf", size: 1, wantStatus: http.StatusBadRequest},
		{name: "control character", fileName: "bad\nname.pdf", size: 1, wantStatus: http.StatusBadRequest},
		{name: "too long", fileName: strings.Repeat("x", maxFileNameBytes+1), size: 1, wantStatus: http.StatusBadRequest},
		{name: "zero bytes", fileName: "report.pdf", size: 0, wantStatus: http.StatusBadRequest},
		{name: "negative bytes", fileName: "report.pdf", size: -1, wantStatus: http.StatusBadRequest},
		{name: "over decimal limit", fileName: "report.pdf", size: storage.MaxSourceObjectBytes + 1, wantStatus: http.StatusBadRequest},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, deterministicEntropy)
			body := mustJSON(t, uploadRequest{FileName: testCase.fileName, FileSizeBytes: testCase.size})
			recorder := serveRequest(context.Background(), t, handler, fake, uploadMethod, mediatype.JSON+"; charset=utf-8", body)

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			if testCase.wantStatus != http.StatusOK {
				require.Empty(t, fake.Calls())
				return
			}

			var response map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			require.ElementsMatch(t, []string{"storageKey", "uploadUrl"}, mapKeys(response))
			var storageKey, uploadURL string
			require.NoError(t, json.Unmarshal(response["storageKey"], &storageKey))
			require.NoError(t, json.Unmarshal(response["uploadUrl"], &uploadURL))
			fileID, ok := parseStorageKey(storageKey)
			require.True(t, ok)
			require.Equal(t, generatedFileID, fileID)
			require.NotEmpty(t, uploadURL)

			calls := fake.Calls()
			require.Len(t, calls, 1)
			require.Equal(t, storage.FakePresignSourceUpload, calls[0].Operation)
			require.Equal(t, generatedFileID, calls[0].FileID)
			require.Equal(t, testCase.size, calls[0].SizeBytes)
			require.Equal(t, uploadGrantExpiry, calls[0].Expiry)
		})
	}
}

func TestUploadRejectsInvalidUTF8FilenameBeforeStorage(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
	body := `{"fileName":"` + string([]byte{0xff}) + `","fileSizeBytes":1}`

	recorder := serveRequest(context.Background(), t, handler, fake, uploadMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Empty(t, fake.Calls())
}

func TestUploadStopsBeforeStorageWhenEntropyFails(t *testing.T) {
	fake := storage.NewFake()
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, func([]byte) (int, error) {
		return 0, errors.New("entropy-secret")
	})
	body := mustJSON(t, uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})

	recorder := serveRequest(context.Background(), t, handler, fake, uploadMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "could not create upload", errorMessage(t, recorder))
	require.NotContains(t, recorder.Body.String(), "entropy-secret")
	require.Empty(t, fake.Calls())
}

func TestUploadPresignFailureIsSanitized(t *testing.T) {
	fake := storage.NewFake()
	fake.SetFailure(storage.FakePresignSourceUpload, errors.New("provider-secret"))
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
	body := mustJSON(t, uploadRequest{FileName: "report.pdf", FileSizeBytes: 1})

	recorder := serveRequest(context.Background(), t, handler, fake, uploadMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "could not create upload", errorMessage(t, recorder))
	require.NotContains(t, recorder.Body.String(), "provider-secret")
	require.Equal(t, []storage.FakeOperation{storage.FakePresignSourceUpload}, callOperations(fake.Calls()))
}

func TestPublicStorageKeysAndETagsAreValidatedBeforeStorage(t *testing.T) {
	invalidKeys := []string{
		"", fileIDOne, "downloads/" + fileIDOne, "uploads/" + strings.ToUpper(generatedFileID),
		"uploads/" + fileIDOne + "/extra", " uploads/" + fileIDOne, "uploads/../" + fileIDOne,
	}
	for _, invalidKey := range invalidKeys {
		t.Run("key "+invalidKey, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
			body := mustJSON(t, dryRunRequest{StorageKey: invalidKey})
			recorder := serveRequest(context.Background(), t, handler, fake, dryRunMethod, mediatype.JSON, body)
			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
	}

	invalidETags := []string{"", `"revision"`, "W/revision", " revision", "revision\n"}
	for _, invalidETag := range invalidETags {
		t.Run("etag "+invalidETag, func(t *testing.T) {
			fake := storage.NewFake()
			handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
			body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: invalidETag})
			recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)
			require.Equal(t, http.StatusBadRequest, recorder.Code)
			require.Empty(t, fake.Calls())
		})
	}
}

func TestDryRunReturnsReviewedRevisionAndBackendOwnedFields(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-synthetic"), ETag: "revision-one"}))
	inspectCalls := 0
	handler := newTestHandler(t, make(chan struct{}, 2), func(input []byte, origin scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		require.Equal(t, []byte("%PDF-synthetic"), input)
		require.Equal(t, scrub.PublicInput, origin)
		return []scrub.Field{{Name: "title", Label: "Title", Preview: "private", OriginalByteSize: 7, Action: scrub.ActionRemove}}, nil
	}, nil, nil)
	body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})

	recorder := serveRequest(context.Background(), t, handler, fake, dryRunMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.ElementsMatch(t, []string{"etag", "fields"}, mapKeys(response))
	var fields []map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(response["fields"], &fields))
	require.Len(t, fields, 1)
	require.ElementsMatch(t, []string{"name", "label", "preview", "originalByteSize", "action"}, mapKeys(fields[0]))
	require.NotContains(t, recorder.Body.String(), "digest")
	require.Equal(t, 1, inspectCalls)

	calls := fake.Calls()
	require.Len(t, calls, 1)
	require.Equal(t, storage.FakeDownloadSource, calls[0].Operation)
	require.Empty(t, calls[0].SourceETag)
	require.Empty(t, handler.permits)
}

func TestDryRunReturnsNonNullEmptyFieldsForCleanPDF(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-clean"), ETag: "revision-one"}))
	handler := newTestHandler(t, make(chan struct{}, 2), func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		return nil, nil
	}, nil, nil)
	body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})

	recorder := serveRequest(context.Background(), t, handler, fake, dryRunMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.JSONEq(t, `{"etag":"revision-one","fields":[]}`, recorder.Body.String())
}

func TestDryRunIntegratesWithPublicPDFInspection(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "revision-one"}))
	handler := newTestHandler(t, make(chan struct{}, 2), scrub.InspectPDF, scrub.CleanPDF, nil)
	body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})

	recorder := serveRequest(context.Background(), t, handler, fake, dryRunMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var response dryRunResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "revision-one", response.ETag)
	require.NotEmpty(t, response.Fields)
}

func TestConstructedDryRunRejectsStructurallySignedPDFFixtureWithoutMutation(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/structurally-signed.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "revision-one"}))
	workflow := New(slog.New(slog.NewTextHandler(io.Discard, nil)), make(chan struct{}, 2))
	body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})

	recorder := serveRequest(context.Background(), t, workflow, fake, dryRunMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, recorder.Body.String())
	require.Equal(t, "signed PDFs are not supported in v1", errorMessage(t, recorder))
	require.Equal(t, []storage.FakeOperation{storage.FakeDownloadSource}, callOperations(fake.Calls()))
	_, exists, err := fake.SanitizedBytes(fileIDOne, "revision-one")
	require.NoError(t, err)
	require.False(t, exists)
	require.Empty(t, workflow.permits)
}

func TestDryRunClassifiesContentAndDependencyFailuresWithoutLeakingDetails(t *testing.T) {
	tests := []struct {
		name        string
		pdfBytes    []byte
		storageErr  error
		inspectErr  error
		wantStatus  int
		wantMessage string
	}{
		{name: "spoofed content", pdfBytes: []byte("not-pdf"), wantStatus: http.StatusUnsupportedMediaType, wantMessage: "file is not a PDF"},
		{name: "leading bytes", pdfBytes: []byte(" \n%PDF-1.7"), wantStatus: http.StatusUnsupportedMediaType, wantMessage: "file is not a PDF"},
		{name: "malformed candidate", pdfBytes: []byte("%PDF-"), inspectErr: scrub.ErrMalformedPDF, wantStatus: http.StatusBadRequest, wantMessage: "invalid PDF"},
		{name: "signed PDF", pdfBytes: []byte("%PDF-signed"), inspectErr: scrub.ErrSignedPDF, wantStatus: http.StatusUnprocessableEntity, wantMessage: "signed PDFs are not supported in v1"},
		{name: "inspection limit", pdfBytes: []byte("%PDF-large"), inspectErr: scrub.ErrInspectionLimit, wantStatus: http.StatusBadRequest, wantMessage: "PDF metadata exceeds inspection limits"},
		{name: "missing source", storageErr: storage.ErrSourceNotFound, wantStatus: http.StatusNotFound, wantMessage: "source file not found"},
		{name: "oversized source", storageErr: storage.ErrSourceObjectTooLarge, wantStatus: http.StatusRequestEntityTooLarge, wantMessage: "source file exceeds 10 MB limit"},
		{name: "dependency failure", storageErr: errors.New("provider-secret"), wantStatus: http.StatusInternalServerError, wantMessage: "could not inspect PDF"},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			if testCase.storageErr != nil {
				fake.SetFailure(storage.FakeDownloadSource, testCase.storageErr)
			}
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: testCase.pdfBytes, ETag: "revision-secret"}))
			inspectCalls := 0
			handler := newTestHandler(t, make(chan struct{}, 2), func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				inspectCalls++
				return nil, testCase.inspectErr
			}, nil, nil)
			body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})

			recorder := serveRequest(context.Background(), t, handler, fake, dryRunMethod, mediatype.JSON, body)

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.NotContains(t, recorder.Body.String(), "provider-secret")
			require.NotContains(t, recorder.Body.String(), "revision-secret")
			if len(testCase.pdfBytes) == 0 || !bytes.HasPrefix(testCase.pdfBytes, []byte("%PDF-")) {
				require.Zero(t, inspectCalls)
			}
			require.Empty(t, handler.permits)
		})
	}
}

func TestScrubCacheHitBypassesAdmissionAndReusesExactRevision(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSanitized(fileIDThree, "revision-three", []byte("already-clean")))
	permits := make(chan struct{}, 2)
	permits <- struct{}{}
	permits <- struct{}{}
	inspectCalls, cleanCalls := 0, 0
	handler := newTestHandler(t, fake, permits, func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
		inspectCalls++
		return nil, nil
	}, func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}, nil)
	body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "revision-three"})

	recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Contains(t, recorder.Body.String(), `"status":"done"`)
	require.Len(t, permits, 2)
	require.Zero(t, inspectCalls)
	require.Zero(t, cleanCalls)
	calls := fake.Calls()
	require.Equal(t, []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperations(calls))
	stored, exists, err := fake.SanitizedBytes(fileIDThree, "revision-three")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, []byte("already-clean"), stored)
}

func TestScrubCacheMissBindsEveryOperationToReviewedRevision(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-source"), ETag: "revision-one"}))
	permits := make(chan struct{}, 2)
	cleaned := []byte("%PDF-cleaned")
	cleanCalls := 0
	handler := newTestHandler(t, fake, permits, nil, func(input []byte) ([]byte, error) {
		cleanCalls++
		require.Len(t, permits, 1, "clean must run while admitted")
		require.Equal(t, []byte("%PDF-source"), input)
		return cleaned, nil
	}, nil)
	body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-one"})

	recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 1, cleanCalls)
	require.Empty(t, permits)
	calls := fake.Calls()
	require.Equal(t, []storage.FakeOperation{
		storage.FakeSanitizedExists,
		storage.FakeDownloadSource,
		storage.FakeUploadSanitized,
		storage.FakePresignSanitizedDownload,
	}, callOperations(calls))
	for _, call := range calls {
		if call.Operation != storage.FakeSanitizedExists || call.SourceETag != "" {
			require.Equal(t, "revision-one", call.SourceETag)
		}
	}
	stored, exists, err := fake.SanitizedBytes(fileIDOne, "revision-one")
	require.NoError(t, err)
	require.True(t, exists)
	require.Equal(t, cleaned, stored)
}

func TestScrubIntegratesWithDeepPDFCleaning(t *testing.T) {
	pdfBytes, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err)
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: pdfBytes, ETag: "revision-one"}))
	handler := newTestHandler(t, make(chan struct{}, 2), scrub.InspectPDF, scrub.CleanPDF, nil)
	body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-one"})

	recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	stored, exists, err := fake.SanitizedBytes(fileIDOne, "revision-one")
	require.NoError(t, err)
	require.True(t, exists)
	fields, err := scrub.InspectPDF(stored, scrub.PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, fields)
}

func TestScrubReturnsConflictBeforePDFOrWriteWork(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("%PDF-current"), ETag: "revision-current"}))
	cleanCalls := 0
	handler := newTestHandler(t, make(chan struct{}, 2), nil, func([]byte) ([]byte, error) {
		cleanCalls++
		return nil, nil
	}, nil)
	body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-reviewed"})

	recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusConflict, recorder.Code)
	require.Equal(t, "source file changed since review", errorMessage(t, recorder))
	require.Zero(t, cleanCalls)
	require.Equal(t, []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakeDownloadSource}, callOperations(fake.Calls()))
	require.Empty(t, handler.permits)
}

func TestScrubFailuresStopAtTheFailedStage(t *testing.T) {
	tests := []struct {
		name        string
		pdfBytes    []byte
		failureOp   storage.FakeOperation
		cleanErr    error
		wantStatus  int
		wantMessage string
		wantCalls   []storage.FakeOperation
	}{
		{
			name:        "lookup failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakeSanitizedExists,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not check scrubbed file",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists},
		},
		{
			name:        "spoofed content",
			pdfBytes:    []byte("not-pdf"),
			wantStatus:  http.StatusUnsupportedMediaType,
			wantMessage: "file is not a PDF",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "signed PDF",
			pdfBytes:    []byte("%PDF-signed"),
			cleanErr:    scrub.ErrSignedPDF,
			wantStatus:  http.StatusUnprocessableEntity,
			wantMessage: "signed PDFs are not supported in v1",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "clean failure",
			pdfBytes:    []byte("%PDF-source"),
			cleanErr:    errors.New("pdf-secret"),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not scrub PDF",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakeDownloadSource},
		},
		{
			name:        "upload failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakeUploadSanitized,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not store scrubbed file",
			wantCalls:   []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakeDownloadSource, storage.FakeUploadSanitized},
		},
		{
			name:        "presign failure",
			pdfBytes:    []byte("%PDF-source"),
			failureOp:   storage.FakePresignSanitizedDownload,
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not create download",
			wantCalls: []storage.FakeOperation{
				storage.FakeSanitizedExists,
				storage.FakeDownloadSource,
				storage.FakeUploadSanitized,
				storage.FakePresignSanitizedDownload,
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: testCase.pdfBytes, ETag: "revision-one"}))
			if testCase.failureOp != "" {
				fake.SetFailure(testCase.failureOp, errors.New("provider-secret"))
			}
			cleanCalls := 0
			handler := newTestHandler(t, make(chan struct{}, 2), nil, func(input []byte) ([]byte, error) {
				cleanCalls++
				if testCase.cleanErr != nil {
					return nil, testCase.cleanErr
				}
				return bytes.Clone(input), nil
			}, nil)
			body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-one"})

			recorder := serveRequest(context.Background(), t, handler, fake, scrubMethod, mediatype.JSON, body)

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			require.Equal(t, testCase.wantMessage, errorMessage(t, recorder))
			require.Equal(t, testCase.wantCalls, callOperations(fake.Calls()))
			require.NotContains(t, recorder.Body.String(), "provider-secret")
			require.NotContains(t, recorder.Body.String(), "pdf-secret")
			require.Empty(t, handler.permits)
			if !bytes.HasPrefix(testCase.pdfBytes, []byte("%PDF-")) || testCase.failureOp == storage.FakeSanitizedExists {
				require.Zero(t, cleanCalls)
			}
		})
	}
}

func TestSaturatedAdmissionReturnsRetryable503WithoutDownloadingWaitingSource(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
	require.Equal(t, 2*time.Second, handler.admissionTimeout, "production admission wait must stay wired to two seconds")
	// Shorten the wait so the saturation path is exercised without spending the
	// production timeout; only the one-sided lower bound below depends on the
	// clock, and load can only increase elapsed time, never trip it.
	handler.admissionTimeout = 75 * time.Millisecond

	holderResponses := startDryRunHolders(t, handler, observer, fileIDOne, fileIDTwo)
	startedAt := time.Now()
	body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
	recorder := serveRequest(context.Background(), t, handler, observer, dryRunMethod, mediatype.JSON, body)
	elapsed := time.Since(startedAt)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code, recorder.Body.String())
	require.Equal(t, admissionRetryAfter, recorder.Header().Get(header.RetryAfter))
	require.Equal(t, admissionTimeoutMessage, errorMessage(t, recorder))
	require.GreaterOrEqual(t, elapsed, 75*time.Millisecond)
	require.False(t, observer.downloadObserved(fileIDThree))
	requireNoFakeDownloadFor(t, fake, fileIDThree)

	observer.releaseDownloads()
	requireHolderSuccess(t, holderResponses)
}

func TestCancellationWhileWaitingReturnsSanitizedResponseWithoutStorageWork(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	var canceledInspectCalls, canceledCleanCalls atomic.Int64
	handler := newTestHandler(t, make(chan struct{}, 2), func(input []byte, _ scrub.InspectionOrigin) ([]scrub.Field, error) {
		if bytes.Contains(input, []byte(fileIDThree)) {
			canceledInspectCalls.Add(1)
		}
		return nil, nil
	}, func(input []byte) ([]byte, error) {
		if bytes.Contains(input, []byte(fileIDThree)) {
			canceledCleanCalls.Add(1)
		}
		return bytes.Clone(input), nil
	}, nil)
	holderResponses := startDryRunHolders(t, handler, observer, fileIDOne, fileIDTwo)

	enteredWait := make(chan struct{})
	handler.beforeAcquireSelect = func() { close(enteredWait) }

	ctx, cancel := context.WithCancel(context.Background())
	response := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})
		response <- serveRequest(ctx, t, handler, observer, dryRunMethod, mediatype.JSON, body)
	}()

	select {
	case <-enteredWait:
		require.Len(t, handler.permits, 2, "waiting request reached the acquisition select with both permits held")
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for request to reach the acquisition select")
	}
	canceledAt := time.Now()
	cancel()

	var recorder *httptest.ResponseRecorder
	select {
	case recorder = <-response:
		require.Less(t, time.Since(canceledAt), 500*time.Millisecond)
	case <-time.After(time.Second):
		require.FailNow(t, "canceled admission wait did not complete promptly")
	}
	handler.beforeAcquireSelect = func() {}

	require.Equal(t, http.StatusRequestTimeout, recorder.Code)
	require.Equal(t, cancellationMessage, errorMessage(t, recorder))
	require.Empty(t, recorder.Header().Get(header.RetryAfter))
	require.False(t, observer.downloadObserved(fileIDThree))
	requireNoFakeCallFor(t, fake, fileIDThree)
	require.Zero(t, canceledInspectCalls.Load())
	require.Zero(t, canceledCleanCalls.Load())

	observer.releaseDownloads()
	requireHolderSuccess(t, holderResponses)

	followUpObserver := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	followUpResponses := startDryRunHolders(t, handler, followUpObserver, fileIDOne, fileIDTwo)
	require.Len(t, handler.permits, 2)
	followUpObserver.releaseDownloads()
	requireHolderSuccess(t, followUpResponses)
}

func TestExactRevisionCacheHitSucceedsWhileBothPermitsAreHeld(t *testing.T) {
	fake := storage.NewFake()
	observer := newBlockingStorage(fake, fileIDOne, fileIDTwo)
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo)
	require.NoError(t, fake.SetSanitized(fileIDThree, "revision-three", []byte("clean")))
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
	holderResponses := startDryRunHolders(t, handler, observer, fileIDOne, fileIDTwo)

	body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDThree), ETag: "revision-three"})
	recorder := serveRequest(context.Background(), t, handler, observer, scrubMethod, mediatype.JSON, body)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, 2, observer.peakDownloads())
	require.Equal(t, []storage.FakeOperation{storage.FakeSanitizedExists, storage.FakePresignSanitizedDownload}, callOperationsFor(fake.Calls(), fileIDThree))

	observer.releaseDownloads()
	requireHolderSuccess(t, holderResponses)
}

func TestSharedAdmissionNeverExceedsTwoAndReleasesAfterEveryTerminalPath(t *testing.T) {
	t.Run("mixed dry run and scrub misses peak at two", func(t *testing.T) {
		fake := storage.NewFake()
		observer := newBlockingStorage(fake, fileIDOne, fileIDTwo, fileIDThree)
		seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
		handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)

		requests := []struct {
			method handlerMethod
			body   string
		}{
			{method: dryRunMethod, body: mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})},
			{method: scrubMethod, body: mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDTwo), ETag: "revision-" + fileIDTwo})},
			{method: dryRunMethod, body: mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDThree)})},
		}
		responses := make(chan *httptest.ResponseRecorder, len(requests))
		for _, request := range requests {
			go func(method handlerMethod, body string) {
				responses <- serveRequest(context.Background(), t, handler, observer, method, mediatype.JSON, body)
			}(request.method, request.body)
		}
		observer.waitForDownloads(t, 2)
		require.Equal(t, 2, observer.peakDownloads())
		select {
		case fileID := <-observer.downloadStarted:
			require.FailNow(t, "third guarded workflow exceeded shared capacity", "downloaded %s", fileID)
		case <-time.After(100 * time.Millisecond):
		}

		observer.releaseDownloads()
		for range requests {
			select {
			case recorder := <-responses:
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
			case <-time.After(time.Second):
				require.FailNow(t, "timed out waiting for mixed guarded workflow")
			}
		}
		require.Equal(t, 2, observer.peakDownloads())
		require.Empty(t, handler.permits)
	})

	terminalCases := []struct {
		name          string
		method        handlerMethod
		downloadErr   error
		downloadPanic string
		inspectErr    error
		inspectPanic  string
		cleanErr      error
		cleanPanic    string
		wantStatus    int
	}{
		{name: "dry run success", method: dryRunMethod, wantStatus: http.StatusOK},
		{name: "scrub success", method: scrubMethod, wantStatus: http.StatusOK},
		{name: "download error", method: dryRunMethod, downloadErr: errors.New("download failed"), wantStatus: http.StatusInternalServerError},
		{name: "download cancellation", method: scrubMethod, downloadErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "download panic", method: dryRunMethod, downloadPanic: "download panic"},
		{name: "inspect error", method: dryRunMethod, inspectErr: errors.New("inspect failed"), wantStatus: http.StatusInternalServerError},
		{name: "inspect cancellation", method: dryRunMethod, inspectErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "inspect panic", method: dryRunMethod, inspectPanic: "inspect panic"},
		{name: "clean error", method: scrubMethod, cleanErr: errors.New("clean failed"), wantStatus: http.StatusInternalServerError},
		{name: "clean cancellation", method: scrubMethod, cleanErr: context.Canceled, wantStatus: http.StatusRequestTimeout},
		{name: "clean panic", method: scrubMethod, cleanPanic: "clean panic"},
	}

	for _, testCase := range terminalCases {
		t.Run(testCase.name+" returns both permits", func(t *testing.T) {
			fake := storage.NewFake()
			seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
			observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
			if testCase.downloadErr != nil {
				observer.failDownload(fileIDOne, testCase.downloadErr)
			}
			if testCase.downloadPanic != "" {
				observer.panicDownload(fileIDOne, testCase.downloadPanic)
			}
			handler := newTestHandler(t, make(chan struct{}, 2), func(input []byte, _ scrub.InspectionOrigin) ([]scrub.Field, error) {
				if bytes.Contains(input, []byte(fileIDOne)) {
					if testCase.inspectPanic != "" {
						panic(testCase.inspectPanic)
					}
					if testCase.inspectErr != nil {
						return nil, testCase.inspectErr
					}
				}
				return nil, nil
			}, func(input []byte) ([]byte, error) {
				if bytes.Contains(input, []byte(fileIDOne)) {
					if testCase.cleanPanic != "" {
						panic(testCase.cleanPanic)
					}
					if testCase.cleanErr != nil {
						return nil, testCase.cleanErr
					}
				}
				return bytes.Clone(input), nil
			}, nil)

			var body string
			if testCase.method == dryRunMethod {
				body = mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})
			} else {
				body = mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-" + fileIDOne})
			}
			panicValue := testCase.downloadPanic + testCase.inspectPanic + testCase.cleanPanic
			if panicValue != "" {
				require.PanicsWithValue(t, panicValue, func() {
					serveRequest(context.Background(), t, handler, observer, testCase.method, mediatype.JSON, body)
				})
			} else {
				recorder := serveRequest(context.Background(), t, handler, observer, testCase.method, mediatype.JSON, body)
				require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			}
			require.Empty(t, handler.permits)

			followUpResponses := startMixedGuardedHolders(t, handler, observer, fileIDTwo, fileIDThree)
			require.Len(t, handler.permits, 2, "both follow-up workflows must acquire after terminal path")
			require.Equal(t, 2, observer.peakDownloads())
			observer.releaseDownloads()
			requireHolderSuccess(t, followUpResponses)
			require.Empty(t, handler.permits)
		})
	}
}

func TestScrubReleasesPermitBeforeUploadingSanitizedBytes(t *testing.T) {
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo, fileIDThree)
	observer := newBlockingStorage(fake, fileIDTwo, fileIDThree)
	observer.blockUpload(fileIDOne)
	handler := newTestHandler(t, make(chan struct{}, 2), nil, func(input []byte) ([]byte, error) {
		return input, nil
	}, nil)

	firstResponse := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		body := mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDOne), ETag: "revision-" + fileIDOne})
		firstResponse <- serveRequest(context.Background(), t, handler, observer, scrubMethod, mediatype.JSON, body)
	}()
	observer.waitForUpload(t, fileIDOne)
	require.Empty(t, handler.permits, "upload must start after guarded permit release")

	holderResponses := startDryRunHolders(t, handler, observer, fileIDTwo, fileIDThree)
	require.Len(t, handler.permits, 2)

	observer.releaseUploads()
	require.Equal(t, http.StatusOK, (<-firstResponse).Code)
	observer.releaseDownloads()
	requireHolderSuccess(t, holderResponses)
}

func TestPipelineLogsRecordAllApprovedSuccessStages(t *testing.T) {
	fake := storage.NewFake()
	seedCandidateSources(t, fake, fileIDOne, fileIDTwo)
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	handler := newTestHandlerWithLogger(t, make(chan struct{}, 2), logger, nil, nil, deterministicEntropy)

	uploadRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		fake,
		uploadMethod,
		mediatype.JSON,
		mustJSON(t, uploadRequest{FileName: "report.pdf", FileSizeBytes: 1}),
	)
	dryRunRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		fake,
		dryRunMethod,
		mediatype.JSON,
		mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)}),
	)
	scrubRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		fake,
		scrubMethod,
		mediatype.JSON,
		mustJSON(t, scrubRequest{StorageKey: formatStorageKey(fileIDTwo), ETag: "revision-" + fileIDTwo}),
	)

	for _, recorder := range []*httptest.ResponseRecorder{uploadRecorder, dryRunRecorder, scrubRecorder} {
		require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	}
	records := readLogRecords(t, logs.Bytes())
	require.Equal(t, []pipelineLogRecord{
		{Message: "upload-created", StorageKey: formatStorageKey(generatedFileID), Outcome: "success"},
		{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "accepted"},
		{Message: "dry-run", StorageKey: formatStorageKey(fileIDOne), Outcome: "success"},
		{Message: "sniffed", StorageKey: formatStorageKey(fileIDTwo), Outcome: "accepted"},
		{Message: "scrubbed", StorageKey: formatStorageKey(fileIDTwo), Outcome: "success"},
		{Message: "presigned", StorageKey: formatStorageKey(fileIDTwo), Outcome: "success"},
	}, withoutLogDurations(records))
	for _, record := range records {
		require.NotNil(t, record.DurationMilliseconds)
		require.GreaterOrEqual(t, *record.DurationMilliseconds, int64(0))
	}
}

func TestPipelineLogsShortCircuitFailuresAndDescribeCacheHitsTruthfully(t *testing.T) {
	tests := []struct {
		name        string
		method      handlerMethod
		configure   func(t *testing.T, fake *storage.Fake)
		inspect     inspectPDFOperation
		clean       cleanPDFOperation
		body        string
		wantStatus  int
		wantRecords []pipelineLogRecord
	}{
		{
			name:   "upload failure emits no created success stage",
			method: uploadMethod,
			configure: func(_ *testing.T, fake *storage.Fake) {
				fake.SetFailure(storage.FakePresignSourceUpload, errors.New("upload failure"))
			},
			body:       mustJSON(t, uploadRequest{FileName: "report.pdf", FileSizeBytes: 1}),
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:   "sniff rejection records terminal outcomes without later success",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{PDFBytes: []byte("not-pdf"), ETag: "revision-one"}))
			},
			body:       mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)}),
			wantStatus: http.StatusUnsupportedMediaType,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "rejected"},
				{Message: "dry-run", StorageKey: formatStorageKey(fileIDOne), Outcome: "not-pdf"},
			},
		},
		{
			name:   "inspection failure records dry run failure",
			method: dryRunMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			inspect: func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
				return nil, errors.New("inspect failed")
			},
			body:       mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)}),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "accepted"},
				{Message: "dry-run", StorageKey: formatStorageKey(fileIDOne), Outcome: "failed"},
			},
		},
		{
			name:   "clean failure records scrub failure without presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
			},
			clean: func([]byte) ([]byte, error) { return nil, errors.New("clean failed") },
			body: mustJSON(t, scrubRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       "revision-" + fileIDOne,
			}),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "accepted"},
				{Message: "scrubbed", StorageKey: formatStorageKey(fileIDOne), Outcome: "failed"},
			},
		},
		{
			name:   "upload failure after scrub emits no presign success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakeUploadSanitized, errors.New("upload failed"))
			},
			body: mustJSON(t, scrubRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       "revision-" + fileIDOne,
			}),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "accepted"},
				{Message: "scrubbed", StorageKey: formatStorageKey(fileIDOne), Outcome: "success"},
			},
		},
		{
			name:   "presign failure emits no presigned success",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				seedCandidateSources(t, fake, fileIDOne)
				fake.SetFailure(storage.FakePresignSanitizedDownload, errors.New("presign failed"))
			},
			body: mustJSON(t, scrubRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       "revision-" + fileIDOne,
			}),
			wantStatus: http.StatusInternalServerError,
			wantRecords: []pipelineLogRecord{
				{Message: "sniffed", StorageKey: formatStorageKey(fileIDOne), Outcome: "accepted"},
				{Message: "scrubbed", StorageKey: formatStorageKey(fileIDOne), Outcome: "success"},
			},
		},
		{
			name:   "cache hit records presign reuse without scrub work",
			method: scrubMethod,
			configure: func(t *testing.T, fake *storage.Fake) {
				require.NoError(t, fake.SetSanitized(fileIDOne, "revision-one", []byte("clean")))
			},
			body: mustJSON(t, scrubRequest{
				StorageKey: formatStorageKey(fileIDOne),
				ETag:       "revision-one",
			}),
			wantStatus: http.StatusOK,
			wantRecords: []pipelineLogRecord{
				{Message: "presigned", StorageKey: formatStorageKey(fileIDOne), Outcome: "cache-hit"},
			},
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			fake := storage.NewFake()
			testCase.configure(t, fake)
			var logs bytes.Buffer
			handler := newTestHandlerWithLogger(
				t,
				make(chan struct{}, 2),
				slog.New(slog.NewJSONHandler(&logs, nil)),
				testCase.inspect,
				testCase.clean,
				deterministicEntropy,
			)

			recorder := serveRequest(context.Background(), t, handler, fake, testCase.method, mediatype.JSON, testCase.body)

			require.Equal(t, testCase.wantStatus, recorder.Code, recorder.Body.String())
			records := readLogRecords(t, logs.Bytes())
			require.Equal(t, testCase.wantRecords, withoutLogDurations(records))
			for _, record := range records {
				require.NotNil(t, record.DurationMilliseconds)
				require.GreaterOrEqual(t, *record.DurationMilliseconds, int64(0))
			}
		})
	}
}

func TestPipelineLogsExcludeSeededSensitiveValues(t *testing.T) {
	fake := storage.NewFake()
	require.NoError(t, fake.SetSource(fileIDOne, storage.SourceObject{
		PDFBytes: []byte("%PDF-source-bytes-secret"),
		Metadata: map[string]string{"private-object-marker": "private-metadata-marker"},
		ETag:     "etag-secret",
	}))
	objectStorage := &sensitiveGrantStorage{Storage: fake}
	var logs bytes.Buffer
	handler := newTestHandlerWithLogger(
		t,
		objectStorage,
		make(chan struct{}, 2),
		slog.New(slog.NewJSONHandler(&logs, nil)),
		func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) {
			return []scrub.Field{{Name: "title", Preview: "metadata-preview-secret", Action: scrub.ActionRemove}}, nil
		},
		nil,
		deterministicEntropy,
	)

	uploadRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		objectStorage,
		uploadMethod,
		mediatype.JSON,
		mustJSON(t, uploadRequest{FileName: "request-name-secret.pdf", FileSizeBytes: 1}),
	)
	dryRunRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		objectStorage,
		dryRunMethod,
		mediatype.JSON,
		mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)}),
	)
	fake.SetFailure(storage.FakeDownloadSource, errors.New("dependency-error-sensitive-marker"))
	dependencyFailureRecorder := serveRequest(
		context.Background(),
		t,
		handler,
		objectStorage,
		dryRunMethod,
		mediatype.JSON,
		mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDTwo)}),
	)

	require.Equal(t, http.StatusOK, uploadRecorder.Code, uploadRecorder.Body.String())
	require.Equal(t, http.StatusOK, dryRunRecorder.Code, dryRunRecorder.Body.String())
	require.Equal(t, http.StatusInternalServerError, dependencyFailureRecorder.Code, dependencyFailureRecorder.Body.String())
	rawLogs := logs.String()
	require.Contains(t, rawLogs, `"storage_key":"`+formatStorageKey(fileIDOne)+`"`)
	for _, secret := range []string{
		"source-bytes-secret",
		"private-object-marker",
		"private-metadata-marker",
		"metadata-preview-secret",
		"etag-secret",
		"request-name-secret",
		"upload-url-secret",
		"credential-secret",
		"dependency-error-sensitive-marker",
	} {
		require.NotContains(t, rawLogs, secret)
	}
}

func TestHandlersWithoutBindingsReturnSafeServerFailure(t *testing.T) {
	handler := newTestHandler(t, make(chan struct{}, 2), nil, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/api/files/dry-run", strings.NewReader(mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(fileIDOne)})))
	request.Header.Set(header.ContentType, mediatype.JSON)
	recorder := httptest.NewRecorder()

	handler.DryRun(recorder, request)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "service unavailable", errorMessage(t, recorder))
}

type handlerMethod int

const (
	uploadMethod handlerMethod = iota
	dryRunMethod
	scrubMethod
)

func newTestHandler(
	t *testing.T,
	permits chan struct{},
	inspect inspectPDFOperation,
	clean cleanPDFOperation,
	entropy entropyOperation,
) *Handler {
	t.Helper()
	return newTestHandlerWithLogger(t, permits, slog.New(slog.NewTextHandler(io.Discard, nil)), inspect, clean, entropy)
}

func newTestHandlerWithLogger(
	t *testing.T,
	permits chan struct{},
	logger *slog.Logger,
	inspect inspectPDFOperation,
	clean cleanPDFOperation,
	entropy entropyOperation,
) *Handler {
	t.Helper()
	if inspect == nil {
		inspect = func([]byte, scrub.InspectionOrigin) ([]scrub.Field, error) { return nil, nil }
	}
	if clean == nil {
		clean = func(input []byte) ([]byte, error) { return bytes.Clone(input), nil }
	}
	if entropy == nil {
		entropy = deterministicEntropy
	}
	return newHandler(logger, permits, inspect, clean, entropy)
}

func serveRequest(
	ctx context.Context,
	t *testing.T,
	handler *Handler,
	objectStorage storage.Storage,
	method handlerMethod,
	contentType string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)).WithContext(ctx)
	if contentType != "" {
		request.Header.Set(header.ContentType, contentType)
	}
	recorder := httptest.NewRecorder()

	var endpoint http.HandlerFunc
	switch method {
	case uploadMethod:
		endpoint = handler.Upload
	case dryRunMethod:
		endpoint = handler.DryRun
	case scrubMethod:
		endpoint = handler.Scrub
	default:
		require.FailNow(t, "unknown handler method")
	}
	bindings.Inject(bindings.Bindings{Storage: objectStorage})(endpoint).ServeHTTP(recorder, request)
	return recorder
}

func deterministicEntropy(destination []byte) (int, error) {
	for index := range destination {
		destination[index] = byte(index)
	}
	return len(destination), nil
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	body, err := json.Marshal(value)
	require.NoError(t, err)
	return string(body)
}

func errorMessage(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body.Error
}

func mapKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func callOperations(calls []storage.FakeCall) []storage.FakeOperation {
	operations := make([]storage.FakeOperation, 0, len(calls))
	for _, call := range calls {
		operations = append(operations, call.Operation)
	}
	return operations
}

func callOperationsFor(calls []storage.FakeCall, fileID string) []storage.FakeOperation {
	var operations []storage.FakeOperation
	for _, call := range calls {
		if call.FileID == fileID {
			operations = append(operations, call.Operation)
		}
	}
	return operations
}

func seedCandidateSources(t *testing.T, fake *storage.Fake, fileIDs ...string) {
	t.Helper()
	for _, fileID := range fileIDs {
		require.NoError(t, fake.SetSource(fileID, storage.SourceObject{
			PDFBytes: []byte("%PDF-" + fileID),
			ETag:     "revision-" + fileID,
		}))
	}
}

type blockingStorage struct {
	storage.Storage

	mu                 sync.Mutex
	blockedDownloads   map[string]bool
	observedDownloads  map[string]bool
	downloadErrors     map[string]error
	downloadPanics     map[string]any
	downloadStarted    chan string
	downloadRelease    chan struct{}
	downloadReleaseOne sync.Once
	active             int
	peak               int

	blockedUploads   map[string]bool
	uploadStarted    chan string
	uploadRelease    chan struct{}
	uploadReleaseOne sync.Once
}

func newBlockingStorage(delegate storage.Storage, blockedFileIDs ...string) *blockingStorage {
	blocked := make(map[string]bool, len(blockedFileIDs))
	for _, fileID := range blockedFileIDs {
		blocked[fileID] = true
	}
	return &blockingStorage{
		Storage:           delegate,
		blockedDownloads:  blocked,
		observedDownloads: make(map[string]bool),
		downloadErrors:    make(map[string]error),
		downloadPanics:    make(map[string]any),
		downloadStarted:   make(chan string, 16),
		downloadRelease:   make(chan struct{}),
		blockedUploads:    make(map[string]bool),
		uploadStarted:     make(chan string, 4),
		uploadRelease:     make(chan struct{}),
	}
}

func (observer *blockingStorage) DownloadSource(ctx context.Context, fileID, expectedETag string) (storage.SourceObject, error) {
	observer.mu.Lock()
	observer.observedDownloads[fileID] = true
	blocked := observer.blockedDownloads[fileID]
	if blocked {
		observer.active++
		if observer.active > observer.peak {
			observer.peak = observer.active
		}
	}
	observer.mu.Unlock()

	if blocked {
		observer.downloadStarted <- fileID
		select {
		case <-observer.downloadRelease:
		case <-ctx.Done():
			observer.mu.Lock()
			observer.active--
			observer.mu.Unlock()
			return storage.SourceObject{}, ctx.Err()
		}
		observer.mu.Lock()
		observer.active--
		observer.mu.Unlock()
	}

	observer.mu.Lock()
	downloadErr := observer.downloadErrors[fileID]
	panicValue, shouldPanic := observer.downloadPanics[fileID]
	observer.mu.Unlock()
	if shouldPanic {
		panic(panicValue)
	}
	if downloadErr != nil {
		return storage.SourceObject{}, downloadErr
	}
	return observer.Storage.DownloadSource(ctx, fileID, expectedETag)
}

func (observer *blockingStorage) UploadSanitized(ctx context.Context, fileID, sourceETag string, pdfBytes []byte) error {
	observer.mu.Lock()
	blocked := observer.blockedUploads[fileID]
	observer.mu.Unlock()
	if blocked {
		observer.uploadStarted <- fileID
		select {
		case <-observer.uploadRelease:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return observer.Storage.UploadSanitized(ctx, fileID, sourceETag, pdfBytes)
}

func (observer *blockingStorage) failDownload(fileID string, err error) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.downloadErrors[fileID] = err
}

func (observer *blockingStorage) panicDownload(fileID string, value any) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.downloadPanics[fileID] = value
}

func (observer *blockingStorage) blockUpload(fileID string) {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	observer.blockedUploads[fileID] = true
}

func (observer *blockingStorage) waitForDownloads(t *testing.T, count int) {
	t.Helper()
	for range count {
		select {
		case <-observer.downloadStarted:
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for guarded download")
		}
	}
}

func (observer *blockingStorage) waitForUpload(t *testing.T, fileID string) {
	t.Helper()
	select {
	case observed := <-observer.uploadStarted:
		require.Equal(t, fileID, observed)
	case <-time.After(time.Second):
		require.FailNow(t, "timed out waiting for sanitized upload")
	}
}

func (observer *blockingStorage) releaseDownloads() {
	observer.downloadReleaseOne.Do(func() { close(observer.downloadRelease) })
}

func (observer *blockingStorage) releaseUploads() {
	observer.uploadReleaseOne.Do(func() { close(observer.uploadRelease) })
}

func (observer *blockingStorage) downloadObserved(fileID string) bool {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.observedDownloads[fileID]
}

func (observer *blockingStorage) peakDownloads() int {
	observer.mu.Lock()
	defer observer.mu.Unlock()
	return observer.peak
}

func startDryRunHolders(
	t *testing.T,
	handler *Handler,
	observer *blockingStorage,
	fileIDs ...string,
) <-chan *httptest.ResponseRecorder {
	t.Helper()
	responses := make(chan *httptest.ResponseRecorder, len(fileIDs))
	for _, fileID := range fileIDs {
		go func(id string) {
			body := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(id)})
			responses <- serveRequest(context.Background(), t, handler, observer, dryRunMethod, mediatype.JSON, body)
		}(fileID)
	}
	observer.waitForDownloads(t, len(fileIDs))
	return responses
}

func startMixedGuardedHolders(
	t *testing.T,
	handler *Handler,
	observer *blockingStorage,
	dryRunFileID string,
	scrubFileID string,
) <-chan *httptest.ResponseRecorder {
	t.Helper()
	responses := make(chan *httptest.ResponseRecorder, 2)
	dryRunBody := mustJSON(t, dryRunRequest{StorageKey: formatStorageKey(dryRunFileID)})
	scrubBody := mustJSON(t, scrubRequest{
		StorageKey: formatStorageKey(scrubFileID),
		ETag:       "revision-" + scrubFileID,
	})
	go func() {
		responses <- serveRequest(context.Background(), t, handler, observer, dryRunMethod, mediatype.JSON, dryRunBody)
	}()
	go func() {
		responses <- serveRequest(context.Background(), t, handler, observer, scrubMethod, mediatype.JSON, scrubBody)
	}()
	observer.waitForDownloads(t, 2)
	return responses
}

func requireHolderSuccess(t *testing.T, responses <-chan *httptest.ResponseRecorder) {
	t.Helper()
	for range 2 {
		select {
		case recorder := <-responses:
			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
		case <-time.After(time.Second):
			require.FailNow(t, "timed out waiting for holder response")
		}
	}
}

func requireNoFakeDownloadFor(t *testing.T, fake *storage.Fake, fileID string) {
	t.Helper()
	for _, call := range fake.Calls() {
		require.False(t, call.FileID == fileID && call.Operation == storage.FakeDownloadSource)
	}
}

func requireNoFakeCallFor(t *testing.T, fake *storage.Fake, fileID string) {
	t.Helper()
	for _, call := range fake.Calls() {
		require.NotEqual(t, fileID, call.FileID)
	}
}

type sensitiveGrantStorage struct {
	storage.Storage
}

func (objectStorage *sensitiveGrantStorage) PresignSourceUpload(
	ctx context.Context,
	fileID string,
	sizeBytes int64,
	expiry time.Duration,
) (storage.PresignedRequest, error) {
	grant, err := objectStorage.Storage.PresignSourceUpload(ctx, fileID, sizeBytes, expiry)
	if err != nil {
		return storage.PresignedRequest{}, err
	}
	grant.URL = "https://upload-url-secret.invalid/source?credential=credential-secret"
	return grant, nil
}

type pipelineLogRecord struct {
	Message              string `json:"msg"`
	StorageKey           string `json:"storage_key"`
	Outcome              string `json:"outcome"`
	DurationMilliseconds *int64 `json:"duration_ms"`
}

func withoutLogDurations(records []pipelineLogRecord) []pipelineLogRecord {
	if len(records) == 0 {
		return nil
	}
	withoutDurations := make([]pipelineLogRecord, len(records))
	for index, record := range records {
		record.DurationMilliseconds = nil
		withoutDurations[index] = record
	}
	return withoutDurations
}

func readLogRecords(t *testing.T, data []byte) []pipelineLogRecord {
	t.Helper()
	var records []pipelineLogRecord
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		var record pipelineLogRecord
		require.NoError(t, json.Unmarshal(scanner.Bytes(), &record))
		records = append(records, record)
	}
	require.NoError(t, scanner.Err())
	return records
}
