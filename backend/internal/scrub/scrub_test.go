package scrub

import (
	"bytes"
	"os"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/stretchr/testify/require"
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

			require.ErrorIs(t, err, ErrUnsupportedType, "Scrub(%q)", tt.filename)
			require.Nil(t, got, "Scrub(%q) output", tt.filename)
		})
	}
}

func TestScrubRemovesPDFPropertiesForUppercaseExtension(t *testing.T) {
	DisableConfigDir()

	pdf := readPDF(t)
	require.NotEmpty(t, pdfProperties(t, pdf), "fixture PDF properties are empty before scrub")

	got, err := Scrub("REPORT.PDF", pdf)
	require.NoError(t, err, "Scrub uppercase PDF")
	require.Empty(t, pdfProperties(t, got), "scrubbed PDF properties, want none")
}

func TestScrubRejectsInvalidPDFWithNoOutput(t *testing.T) {
	DisableConfigDir()

	got, err := Scrub("report.pdf", []byte("not a pdf"))

	require.Error(t, err, "Scrub invalid PDF error = nil, want error")
	require.Nil(t, got, "Scrub invalid PDF output")
}

func readPDF(t *testing.T) []byte {
	t.Helper()

	pdf, err := os.ReadFile("testdata/with-property.pdf")
	require.NoError(t, err, "read PDF fixture")

	return pdf
}

func pdfProperties(t *testing.T, pdf []byte) map[string]string {
	t.Helper()

	properties, err := api.Properties(bytes.NewReader(pdf), nil)
	require.NoError(t, err, "read PDF properties")

	return properties
}
