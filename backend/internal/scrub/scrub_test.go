package scrub

import (
	"bytes"
	"os"
	"reflect"
	"testing"
	"time"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
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


func TestCachedSignatureVariantsAreClassifiedAsSigned(t *testing.T) {
	testCases := []struct {
		name    string
		context *model.Context
	}{
		{name: "signature flag", context: signatureContext(func(context *model.Context) { context.SignatureExist = true })},
		{name: "append only flag", context: signatureContext(func(context *model.Context) { context.AppendOnly = true })},
		{name: "usage rights dictionary", context: signatureContext(func(context *model.Context) { context.URSignature = types.Dict{"Filter": types.Name("Synthetic")} })},
		{name: "certified signature object", context: signatureContext(func(context *model.Context) { context.CertifiedSigObjNr = 9 })},
		{name: "trusted document timestamp", context: signatureContext(func(context *model.Context) { context.DTS = time.Unix(1, 0) })},
		{name: "signed cached signature", context: signatureContext(func(context *model.Context) {
			context.Signatures = map[int]map[int]model.Signature{0: {9: {Signed: true}}}
		})},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.True(t, pdfHasCachedSignature(testCase.context))
		})
	}
}


func TestSummaryBuilderAcceptsExactAggregateBudgetAndRejectsNextByte(t *testing.T) {
	const fieldBytes = len("n") + len("l") + len("v") + len(ActionRemove) + len("1")

	acceptedBuilder := &summaryBuilder{totalBytes: maxInspectionBytes - fieldBytes}
	require.NoError(t, acceptedBuilder.add("n", "l", "v", ActionRemove))
	require.Equal(t, maxInspectionBytes, acceptedBuilder.totalBytes)
	require.Len(t, acceptedBuilder.fields, 1)

	rejectedBuilder := &summaryBuilder{totalBytes: maxInspectionBytes - fieldBytes + 1}
	err := rejectedBuilder.add("n", "l", "v", ActionRemove)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Empty(t, rejectedBuilder.fields)
	require.Equal(t, maxInspectionBytes-fieldBytes+1, rejectedBuilder.totalBytes)
}


func TestSummaryBuilderEnforcesDecodedMetadataBudgetExactly(t *testing.T) {
	acceptedBuilder := &summaryBuilder{decodedMetadataBytes: maxDecodedMetadataBytes - 1}
	require.NoError(t, acceptedBuilder.addMetadataBytes("n", "l", []byte("x"), ActionRemove))
	require.Equal(t, int64(maxDecodedMetadataBytes), acceptedBuilder.decodedMetadataBytes)
	require.Len(t, acceptedBuilder.fields, 1)

	rejectedBuilder := &summaryBuilder{decodedMetadataBytes: maxDecodedMetadataBytes}
	err := rejectedBuilder.addMetadataBytes("n", "l", []byte("x"), ActionRemove)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Empty(t, rejectedBuilder.fields)
	require.Equal(t, int64(maxDecodedMetadataBytes), rejectedBuilder.decodedMetadataBytes)
}


func signatureContext(apply func(*model.Context)) *model.Context {
	context := &model.Context{XRefTable: &model.XRefTable{}}
	apply(context)
	return context
}

