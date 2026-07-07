package scrub

import (
	"bytes"
	"errors"
	"os"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

func TestScrubRejectsUnsupportedTypeWithSentinel(t *testing.T) {
	tests := []struct {
		name     string
		filename string
	}{
		{
			name:     "unsupported extension",
			filename: "notes.txt",
		},
		{
			name:     "missing extension",
			filename: "README",
		},
		{
			name:     "empty filename",
			filename: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Scrub(tt.filename, []byte("plain text"))

			if !errors.Is(err, ErrUnsupportedType) {
				t.Fatalf("Scrub(%q) error = %v, want %v", tt.filename, err, ErrUnsupportedType)
			}
			if got != nil {
				t.Fatalf("Scrub(%q) output = %q, want nil", tt.filename, got)
			}
		})
	}
}

func TestScrubRemovesPDFPropertiesForUppercaseExtension(t *testing.T) {
	DisableConfigDir()

	pdf := readPDF(t)
	if properties := pdfProperties(t, pdf); len(properties) == 0 {
		t.Fatal("fixture PDF properties are empty before scrub")
	}

	got, err := Scrub("REPORT.PDF", pdf)
	if err != nil {
		t.Fatalf("Scrub uppercase PDF: %v", err)
	}
	if properties := pdfProperties(t, got); len(properties) != 0 {
		t.Fatalf("scrubbed PDF properties = %v, want none", properties)
	}
}

func TestScrubRejectsInvalidPDFWithNoOutput(t *testing.T) {
	DisableConfigDir()

	got, err := Scrub("report.pdf", []byte("not a pdf"))

	if err == nil {
		t.Fatal("Scrub invalid PDF error = nil, want error")
	}
	if got != nil {
		t.Fatalf("Scrub invalid PDF output = %q, want nil", got)
	}
}

func readPDF(t *testing.T) []byte {
	t.Helper()

	pdf, err := os.ReadFile("testdata/with-property.pdf")
	if err != nil {
		t.Fatalf("read PDF fixture: %v", err)
	}

	return pdf
}

func pdfProperties(t *testing.T, pdf []byte) map[string]string {
	t.Helper()

	properties, err := api.Properties(bytes.NewReader(pdf), nil)
	if err != nil {
		t.Fatalf("read PDF properties: %v", err)
	}

	return properties
}
