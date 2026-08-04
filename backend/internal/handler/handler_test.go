package handler

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
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
	want := `attachment; filename*=utf-8''bad%0D%0A%00%7Fname.pdf`

	require.Equal(t, want, contentDisposition(filename), "contentDisposition(%q)", filename)
}

func TestScrubRejectsMissingFile(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, httptest.NewRequest(http.MethodPost, "/api/scrub", strings.NewReader("not multipart")))

	require.Equal(t, http.StatusBadRequest, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType), header.ContentType)
}

func TestScrubRejectsUnsupportedType(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, newMultipartFileRequest(t, "notes.txt", []byte("plain text")))

	require.Equal(t, http.StatusUnsupportedMediaType, recorder.Code, "Scrub status; body: %s", recorder.Body.String())
	require.Equal(t, mediatype.JSON, recorder.Header().Get(header.ContentType), header.ContentType)
}

func readScrubbablePDF(t *testing.T) []byte {
	t.Helper()

	pdf, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err, "read PDF fixture")

	return pdf
}

func newMultipartFileRequest(t *testing.T, filename string, body []byte) *http.Request {
	t.Helper()

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	file, err := writer.CreateFormFile(fileFormField, filename)
	require.NoError(t, err, "create multipart file")

	_, err = io.Copy(file, bytes.NewReader(body))
	require.NoError(t, err, "write multipart file")
	require.NoError(t, writer.Close(), "close multipart writer")

	request := httptest.NewRequest(http.MethodPost, "/api/scrub", &requestBody)
	request.Header.Set(header.ContentType, writer.FormDataContentType())

	return request
}
