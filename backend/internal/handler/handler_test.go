package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
	"metadata-scrubber/internal/scrub"
)

func TestScrubSetsDownloadHeaders(t *testing.T) {
	pdf := readScrubbablePDF(t)

	tests := []struct {
		name     string
		filename string
		want     string
	}{
		{
			name:     "base filename",
			filename: "report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		{
			name:     "path stripped",
			filename: "/tmp/report.pdf",
			want:     `attachment; filename=report.pdf`,
		},
		{
			name:     "quotes and backslashes escaped",
			filename: `bad"\name.pdf`,
			want:     `attachment; filename="bad\"\\name.pdf"`,
		},
		{
			name:     "unicode filename encoded",
			filename: "resume-été.pdf",
			want:     `attachment; filename*=utf-8''resume-%C3%A9t%C3%A9.pdf`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			Scrub(recorder, newMultipartFileRequest(t, tt.filename, pdf))

			require.Equal(t, http.StatusOK, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
			require.Equal(t, mediatype.OctetStream, recorder.Header().Get(header.ContentType), header.ContentType)
			require.Equal(t, tt.want, recorder.Header().Get(header.ContentDisposition), header.ContentDisposition)
			require.NotEmpty(t, recorder.Body.Bytes(), "Scrub response body")
		})
	}
}

func TestContentDispositionEncodesControlBytes(t *testing.T) {
	filename := "bad\r\n\x00\x7fname.pdf"
	require.Equal(t, `attachment; filename*=utf-8''bad%0D%0A%00%7Fname.pdf`, contentDisposition(filename), "contentDisposition(%q)", filename)
}

func TestReachabilityReportsReachableStatus(t *testing.T) {
	recorder := httptest.NewRecorder()
	Reachability(recorder, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	require.Equal(t, http.StatusOK, recorder.Code, "Reachability status")
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType), header.ContentType)
	require.JSONEq(t, `{"status":"reachable"}`, recorder.Body.String(), "Reachability body")
}

func TestScrubRejectsMissingFile(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, httptest.NewRequest(http.MethodPost, "/api/scrub", strings.NewReader("not multipart")))

	require.Equal(t, http.StatusBadRequest, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType), header.ContentType)
	require.Equal(t, `missing or invalid "file" form field`, errorMessage(t, recorder), "Scrub error message")
}

func TestScrubAcceptsExactUploadLimitIncludingMultipartFraming(t *testing.T) {
	require.Equal(t, 10_000_000, scrub.MaxInputBytes)
	pdfBytes := padUploadToSize(t, readScrubbablePDF(t), scrub.MaxInputBytes)
	recorder := httptest.NewRecorder()

	Scrub(recorder, newMultipartFileRequest(t, "report.pdf", pdfBytes))

	require.Equal(t, http.StatusOK, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.NotEmpty(t, recorder.Body.Bytes())
}

func TestScrubRejectsFirstByteOverUploadLimit(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, newMultipartFileRequest(t, "report.pdf", make([]byte, scrub.MaxInputBytes+1)))

	require.Equal(t, http.StatusBadRequest, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, `missing or invalid "file" form field`, errorMessage(t, recorder), "Scrub error message")
}

func TestScrubRejectsRequestBodyOverMultipartLimit(t *testing.T) {
	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	file, err := writer.CreateFormFile(fileFormField, "report.pdf")
	require.NoError(t, err, "create multipart file")
	_, err = file.Write(padUploadToSize(t, readScrubbablePDF(t), scrub.MaxInputBytes))
	require.NoError(t, err, "write multipart file")

	// The file alone would be accepted, so the oversized ignored field is what
	// pushes the request body over maxMultipartBodySize: only the MaxBytesReader
	// ceiling can reject this request, not the file payload limit.
	require.NoError(t, writer.WriteField("ignored", strings.Repeat("x", 2*maxMultipartOverhead)), "write oversized field")
	require.NoError(t, writer.Close(), "close multipart writer")
	require.Greater(t, requestBody.Len(), maxMultipartBodySize, "request body must exceed the multipart ceiling")

	request := httptest.NewRequest(http.MethodPost, "/api/scrub", &requestBody)
	request.Header.Set(header.ContentType, writer.FormDataContentType())
	recorder := httptest.NewRecorder()

	Scrub(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, `missing or invalid "file" form field`, errorMessage(t, recorder), "Scrub error message")
}

func TestScrubProcessesPDFBytesIndependentOfFilename(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, newMultipartFileRequest(t, "notes.txt", readScrubbablePDF(t)))

	require.Equal(t, http.StatusOK, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, mediatype.OctetStream, recorder.Header().Get(header.ContentType), header.ContentType)
	require.Equal(t, "attachment; filename=notes.txt", recorder.Header().Get(header.ContentDisposition))
	require.NotEmpty(t, recorder.Body.Bytes())
}

func TestScrubReportsScrubFailureWithoutErrorDetail(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, newMultipartFileRequest(t, "report.pdf", []byte("not a pdf")))

	require.Equal(t, http.StatusInternalServerError, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType), header.ContentType)
	require.Equal(t, "could not scrub file", errorMessage(t, recorder), "Scrub error message")
}

func TestWriteScrubFailureClassifiesScrubErrors(t *testing.T) {
	tests := []struct {
		name        string
		scrubErr    error
		wantStatus  int
		wantMessage string
	}{
		{
			name:        "input too large is a client error",
			scrubErr:    fmt.Errorf("read PDF: %w", scrub.ErrInputTooLarge),
			wantStatus:  http.StatusBadRequest,
			wantMessage: "PDF input exceeds 10 MB limit",
		},
		{
			name:        "signed PDF is unsupported media",
			scrubErr:    fmt.Errorf("read PDF: %w", scrub.ErrSignedPDF),
			wantStatus:  http.StatusUnsupportedMediaType,
			wantMessage: "signed PDF is unsupported",
		},
		{
			name:        "inspection limit is a client error",
			scrubErr:    fmt.Errorf("analyze PDF: %w", scrub.ErrInspectionLimit),
			wantStatus:  http.StatusBadRequest,
			wantMessage: "PDF metadata exceeds inspection limits",
		},
		{
			name:        "unclassified failure hides its detail",
			scrubErr:    errors.New("pdfcpu: internal parser detail"),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "could not scrub file",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			writeScrubFailure(recorder, httptest.NewRequest(http.MethodPost, "/api/scrub", nil), tt.scrubErr)

			require.Equal(t, tt.wantStatus, recorder.Code, "status; body: %s", recorder.Body.String())
			require.Equal(t, tt.wantMessage, errorMessage(t, recorder), "error message")
			require.NotContains(t, recorder.Body.String(), "pdfcpu", "response must not leak scrub error detail")
		})
	}
}

func readScrubbablePDF(t *testing.T) []byte {
	t.Helper()

	pdf, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err, "read PDF fixture")

	return pdf
}

func padUploadToSize(t *testing.T, body []byte, size int) []byte {
	t.Helper()
	require.LessOrEqual(t, len(body), size)

	padding := bytes.Repeat([]byte{' '}, size-len(body))
	return append(bytes.Clone(body), padding...)
}

func newMultipartFileRequest(t *testing.T, filename string, body []byte) *http.Request {
	t.Helper()

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	file, err := writer.CreateFormFile(fileFormField, filename)
	require.NoError(t, err, "create multipart file")

	_, err = file.Write(body)
	require.NoError(t, err, "write multipart file")
	require.NoError(t, writer.Close(), "close multipart writer")

	request := httptest.NewRequest(http.MethodPost, "/api/scrub", &requestBody)
	request.Header.Set(header.ContentType, writer.FormDataContentType())

	return request
}

func errorMessage(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()

	var body struct {
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body), "decode error body")

	return body.Error
}
