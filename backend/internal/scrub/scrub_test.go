package scrub

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"os"
	"reflect"
	"sort"
	"strings"
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


func TestBoundedPDFConfigurationAssignsEveryResourceLimit(t *testing.T) {
	configuration := boundedPDFConfiguration()

	require.Equal(t, int64(10_000_000), maxPDFStreamBytes)
	require.Equal(t, int64(20_000_000), maxPDFDecodeBytes)
	require.Equal(t, int64(10_000_000), maxPDFImagePixels)
	require.Equal(t, int64(40_000_000), maxPDFImageBytes)
	require.Equal(t, 100_000, maxPDFObjectCount)
	require.Equal(t, 50_000, maxPDFObjectStreamCount)
	require.Equal(t, int64(2_000_000), maxPDFObjectStreamFirst)
	require.Equal(t, 100_000, maxPDFXRefEntries)
	require.Equal(t, 64, maxPDFRecursionDepth)
	require.Equal(t, model.REMOVEPROPERTIES, configuration.Cmd)
	require.True(t, configuration.PostProcessValidate)
	require.Equal(t, model.ResourceLimits{
		MaxStreamBytes:       maxPDFStreamBytes,
		MaxDecodeBytes:       maxPDFDecodeBytes,
		MaxImagePixels:       maxPDFImagePixels,
		MaxImageBytes:        maxPDFImageBytes,
		MaxObjectCount:       maxPDFObjectCount,
		MaxObjectStreamCount: maxPDFObjectStreamCount,
		MaxObjectStreamFirst: maxPDFObjectStreamFirst,
		MaxXRefEntries:       maxPDFXRefEntries,
		MaxRecursionDepth:    maxPDFRecursionDepth,
	}, configuration.Limits)
	require.NotEqual(t, model.DefaultResourceLimits(), configuration.Limits)
}


func TestMetadataPreflightCachesCatalogContentWithoutMarkingItValidated(t *testing.T) {
	DisableConfigDir()
	metadata := syntheticXMP("bounded-preflight-cache")
	context, err := api.ReadContext(
		bytes.NewReader(buildPDFWithCompressedCatalogMetadata(t, metadata)),
		boundedPDFConfiguration(),
	)
	require.NoError(t, err)
	metadataEntry, found := context.FindTableEntry(5, 0)
	require.True(t, found)
	require.False(t, metadataEntry.Valid)
	storedStream, stream := metadataEntry.Object.(types.StreamDict)
	require.True(t, stream)
	require.Nil(t, storedStream.Content)
	metadataEntries, structurallySigned, err := snapshotMetadataEntries(context)
	require.NoError(t, err)
	require.False(t, structurallySigned)

	require.NoError(t, preflightMetadataEntries(context, metadataEntries))

	require.False(t, metadataEntry.Valid)
	storedStream, stream = metadataEntry.Object.(types.StreamDict)
	require.True(t, stream)
	require.Equal(t, []byte(metadata), storedStream.Content)
}


func TestMetadataTraversalDeduplicatesOneParentEntryTarget(t *testing.T) {
	DisableConfigDir()
	context, err := readPDF(buildPDFWithInfoAndRawMetadata(t, map[string]string{}, syntheticXMP("duplicate-target")))
	require.NoError(t, err)
	catalog, err := context.Catalog()
	require.NoError(t, err)
	analysis := &pdfAnalysis{}
	builder := &summaryBuilder{}
	state := traversalState{
		analysis:     analysis,
		builder:      builder,
		context:      context,
		roles:        map[int]objectRole{context.Root.ObjectNumber.Value(): {catalog: true}},
		seenTargets:  map[string]struct{}{},
		objectNumber: context.Root.ObjectNumber.Value(),
	}

	require.NoError(t, state.inspectDictionary(catalog, nil))
	require.NoError(t, state.inspectDictionary(catalog, nil))

	require.Len(t, builder.fields, 1)
	require.Len(t, analysis.metadataTargets, 1)
}


func buildPDF(t *testing.T, fixture pdfFixture) []byte {
	t.Helper()

	objectNumbers := make([]int, 0, len(fixture.objects))
	maxObjectNumber := 0
	for objectNumber := range fixture.objects {
		objectNumbers = append(objectNumbers, objectNumber)
		maxObjectNumber = max(maxObjectNumber, objectNumber)
	}
	sort.Ints(objectNumbers)

	var pdf bytes.Buffer
	pdf.WriteString("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")

	offsets := make(map[int]int, len(objectNumbers))
	for _, objectNumber := range objectNumbers {
		offsets[objectNumber] = pdf.Len()
		_, err := fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", objectNumber, fixture.objects[objectNumber])
		require.NoError(t, err)
	}

	xrefOffset := pdf.Len()
	_, err := fmt.Fprintf(&pdf, "xref\n0 %d\n", maxObjectNumber+1)
	require.NoError(t, err)
	pdf.WriteString("0000000000 65535 f \n")
	for objectNumber := 1; objectNumber <= maxObjectNumber; objectNumber++ {
		offset, exists := offsets[objectNumber]
		if !exists {
			pdf.WriteString("0000000000 00000 f \n")
			continue
		}
		_, err = fmt.Fprintf(&pdf, "%010d 00000 n \n", offset)
		require.NoError(t, err)
	}

	_, err = fmt.Fprintf(&pdf, "trailer\n<< /Size %d /Root %d 0 R", maxObjectNumber+1, fixture.rootObjectNumber)
	require.NoError(t, err)
	if fixture.infoObjectNumber != 0 {
		_, err = fmt.Fprintf(&pdf, " /Info %d 0 R", fixture.infoObjectNumber)
		require.NoError(t, err)
	}
	_, err = fmt.Fprintf(&pdf, " >>\nstartxref\n%d\n%%%%EOF\n", xrefOffset)
	require.NoError(t, err)

	return pdf.Bytes()
}


func buildPDFWithCompressedCatalogMetadata(t *testing.T, metadata string) []byte {
	t.Helper()

	return buildPDF(t, pdfFixture{
		objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /Metadata 5 0 R >>",
			2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
			3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
			4: streamObject("BT 20 100 Td (Synthetic page) Tj ET"),
			5: compressedMetadataStreamObject(t, metadata),
		},
		rootObjectNumber: 1,
	})
}


func buildPDFWithInfo(t *testing.T, entries map[string]string) []byte {
	t.Helper()

	return buildPDFWithInfoAndMetadata(t, entries, noMetadata)
}


func buildPDFWithInfoAndMetadata(t *testing.T, entries map[string]string, location metadataLocation) []byte {
	t.Helper()

	return buildPDFWithInfoAndRawMetadataAtLocation(t, entries, syntheticXMP("near-miss-metadata"), location)
}


func buildPDFWithInfoAndRawMetadata(t *testing.T, entries map[string]string, metadata string) []byte {
	t.Helper()

	return buildPDFWithInfoAndRawMetadataAtLocation(t, entries, metadata, catalogMetadata)
}


func buildPDFWithInfoAndRawMetadataAtLocation(t *testing.T, entries map[string]string, metadata string, location metadataLocation) []byte {
	t.Helper()

	catalogMetadataEntry := ""
	pageMetadataEntry := ""
	nestedMetadataEntry := ""
	if location == catalogMetadata {
		catalogMetadataEntry = " /Metadata 6 0 R"
	}
	if location == pageMetadata {
		pageMetadataEntry = " /Metadata 6 0 R"
	}
	if location == nestedMetadata {
		nestedMetadataEntry = " /Synthetic << /Metadata 6 0 R >>"
	}

	objects := map[int]string{
		1: fmt.Sprintf("<< /Type /Catalog /Pages 2 0 R%s%s >>", catalogMetadataEntry, nestedMetadataEntry),
		2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		3: fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R%s >>", pageMetadataEntry),
		4: streamObject("BT 20 100 Td (Synthetic page) Tj ET"),
		5: infoDictionaryObject(t, entries),
	}
	if location != noMetadata {
		objects[6] = metadataStreamObject(metadata)
	}

	return buildPDF(t, pdfFixture{objects: objects, rootObjectNumber: 1, infoObjectNumber: 5})
}


func compressedMetadataStreamObject(t *testing.T, content string) string {
	t.Helper()

	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	_, err := io.WriteString(writer, content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	return fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Filter /FlateDecode /Length %d >>\nstream\n%s\nendstream", compressed.Len(), compressed.String())
}


func infoDictionaryObject(t *testing.T, entries map[string]string) string {
	t.Helper()

	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	var infoDictionary strings.Builder
	infoDictionary.WriteString("<<")
	for _, key := range keys {
		_, err := fmt.Fprintf(&infoDictionary, " /%s %s", types.EncodeName(key), entries[key])
		require.NoError(t, err)
	}
	infoDictionary.WriteString(" >>")
	return infoDictionary.String()
}


type metadataLocation int

const (
	noMetadata metadataLocation = iota
	catalogMetadata
	pageMetadata
	nestedMetadata
)

func metadataStreamObject(content string) string {
	return fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Length %d >>\nstream\n%s\nendstream", len(content), content)
}


type pdfFixture struct {
	objects          map[int]string
	rootObjectNumber int
	infoObjectNumber int
}


func pdfString(value string) string {
	replacer := strings.NewReplacer(`\\`, `\\\\`, `(`, `\\(`, `)`, `\\)`)
	return "(" + replacer.Replace(value) + ")"
}


func streamObject(content string) string {
	return fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content)
}


func syntheticXMP(marker string) string {
	return fmt.Sprintf(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="%s"/></rdf:RDF></x:xmpmeta>`, marker)
}

