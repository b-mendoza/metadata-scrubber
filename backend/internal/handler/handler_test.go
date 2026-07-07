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

			if recorder.Code != http.StatusOK {
				t.Fatalf("Scrub status = %d, want %d; body: %s", recorder.Code, http.StatusOK, recorder.Body.String())
			}
			if got := recorder.Header().Get(header.ContentType); got != mediatype.OctetStream {
				t.Fatalf("%s = %q, want %q", header.ContentType, got, mediatype.OctetStream)
			}
			if got := recorder.Header().Get(header.ContentDisposition); got != tt.want {
				t.Fatalf("%s = %q, want %q", header.ContentDisposition, got, tt.want)
			}
			if recorder.Body.Len() == 0 {
				t.Fatal("Scrub response body is empty")
			}
		})
	}
}

func TestContentDispositionEncodesControlBytes(t *testing.T) {
	filename := "bad\r\n\x00\x7fname.pdf"
	want := `attachment; filename*=utf-8''bad%0D%0A%00%7Fname.pdf`

	if got := contentDisposition(filename); got != want {
		t.Fatalf("contentDisposition(%q) = %q, want %q", filename, got, want)
	}
}

func TestScrubRejectsMissingFile(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, httptest.NewRequest(http.MethodPost, "/api/scrub", strings.NewReader("not multipart")))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("Scrub status = %d, want %d; body: %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
	if got := recorder.Header().Get(header.ContentType); got != mediatype.JSON {
		t.Fatalf("%s = %q, want %q", header.ContentType, got, mediatype.JSON)
	}
}

func TestScrubRejectsUnsupportedType(t *testing.T) {
	recorder := httptest.NewRecorder()
	Scrub(recorder, newMultipartFileRequest(t, "notes.txt", []byte("plain text")))

	if recorder.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("Scrub status = %d, want %d; body: %s", recorder.Code, http.StatusUnsupportedMediaType, recorder.Body.String())
	}
	if got := recorder.Header().Get(header.ContentType); got != mediatype.JSON {
		t.Fatalf("%s = %q, want %q", header.ContentType, got, mediatype.JSON)
	}
}

func readScrubbablePDF(t *testing.T) []byte {
	t.Helper()

	pdf, err := os.ReadFile("testdata/with-property.pdf")
	if err != nil {
		t.Fatalf("read PDF fixture: %v", err)
	}

	return pdf
}

func newMultipartFileRequest(t *testing.T, filename string, body []byte) *http.Request {
	t.Helper()

	var requestBody bytes.Buffer
	writer := multipart.NewWriter(&requestBody)

	file, err := writer.CreateFormFile(fileFormField, filename)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := io.Copy(file, bytes.NewReader(body)); err != nil {
		t.Fatalf("write multipart file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/scrub", &requestBody)
	request.Header.Set(header.ContentType, writer.FormDataContentType())

	return request
}
