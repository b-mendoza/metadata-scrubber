package scrub

import (
	"bytes"
	"os"
	"reflect"
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

	pdf := readFixturePDF(t)
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

func readFixturePDF(t *testing.T) []byte {
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


func TestInspectionSummaryLimitsStayAtApprovedValues(t *testing.T) {
	require.Equal(t, 10_000_000, MaxInputBytes)
	require.Equal(t, 256, maxFieldPreviewBytes)
	require.Equal(t, 128, maxInspectionFields)
	require.Equal(t, 32_768, maxInspectionBytes)
	require.Equal(t, 20_000_000, maxDecodedMetadataBytes)
}

func TestFieldExposesOnlyApprovedInspectionProperties(t *testing.T) {
	fieldType := reflect.TypeFor[Field]()
	require.Equal(t, 5, fieldType.NumField())
	require.Equal(t, []string{"Name", "Label", "Preview", "OriginalByteSize", "Action"}, structFieldNames(fieldType))
}

func structFieldNames(structType reflect.Type) []string {
	names := make([]string, structType.NumField())
	for index := range structType.NumField() {
		names[index] = structType.Field(index).Name
	}
	return names
}

