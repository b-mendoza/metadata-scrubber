package scrub

import (
	"bytes"
	"fmt"
	"io"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/stretchr/testify/require"
)

func TestPDFPathsRejectAggregateDecodedMetadataBudgetBeforeWriting(t *testing.T) {
	const (
		streamCount        = 24
		decodedStreamBytes = 1 << 20
	)
	require.Greater(t, streamCount*decodedStreamBytes, maxDecodedMetadataBytes)
	var pdfBytes []byte
	{
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			catalog, err := pdfContext.Catalog()
			require.NoError(t, err)
			parents := make(types.Array, 0, streamCount)
			for range streamCount {
				stream, err := pdfContext.NewStreamDictForBuf(bytes.Repeat([]byte("x"), decodedStreamBytes))
				require.NoError(t, err)
				stream.InsertName("Type", "Metadata")
				stream.InsertName("Subtype", "XML")
				require.NoError(t, stream.Encode())
				streamReference, err := pdfContext.IndRefForNewObject(*stream)
				require.NoError(t, err)
				parentReference, err := pdfContext.IndRefForNewObject(types.Dict{"Metadata": *streamReference})
				require.NoError(t, err)
				parents = append(parents, *parentReference)
			}
			catalog.Insert("SyntheticParents", parents)
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		pdfBytes = output.Bytes()
	}

	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	outputBytes, scrubErr := CleanPDF(pdfBytes)

	require.ErrorIs(t, inspectErr, ErrInspectionLimit)
	require.Nil(t, fields)
	require.ErrorIs(t, scrubErr, ErrInspectionLimit)
	require.Nil(t, outputBytes)
}

func TestPDFPathsRejectOversizedCompressedCatalogMetadataBeforeValidation(t *testing.T) {
	decodedBytes := maxDecodedMetadataBytes + 1
	const prefix = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>`
	const suffix = `</rdf:Description></rdf:RDF></x:xmpmeta>`
	require.Greater(t, decodedBytes, len(prefix)+len(suffix))

	var metadata strings.Builder
	metadata.Grow(decodedBytes)
	metadata.WriteString(prefix)
	metadata.WriteString(strings.Repeat("x", decodedBytes-len(prefix)-len(suffix)))
	metadata.WriteString(suffix)
	pdfBytes := buildCompressedCatalogMetadataPDFFixture(t, []byte(metadata.String()))
	require.Less(t, len(pdfBytes), MaxInputBytes)
	validationCalls := 0

	pdfContext, readErr := readPDFWithValidator(pdfBytes, func(validationContext *model.Context) error {
		validationCalls++
		return api.ValidateContext(validationContext)
	})
	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	outputBytes, scrubErr := CleanPDF(pdfBytes)

	require.ErrorIs(t, readErr, ErrInspectionLimit)
	require.Nil(t, pdfContext)
	require.ErrorIs(t, inspectErr, ErrInspectionLimit)
	require.Nil(t, fields)
	require.ErrorIs(t, scrubErr, ErrInspectionLimit)
	require.Nil(t, outputBytes)
	require.Zero(t, validationCalls)
}

func TestAnalyzePDFReleasesDecodedMetadataStreamCaches(t *testing.T) {
	const decodedStreamBytes = 1 << 20
	pdfBytes := buildMetadataCachePDFFixture(t, decodedStreamBytes)
	pdfContext, err := readPDFWithValidator(pdfBytes, api.ValidateContext)
	require.NoError(t, err)
	metadataStreamType := "Metadata"
	primedMetadataStreamCount := 0
	for _, objectNumber := range sortedLiveObjectNumbers(pdfContext) {
		entry := pdfContext.Table[objectNumber]
		stream, ok := entry.Object.(types.StreamDict)
		if !ok || !reflect.DeepEqual(stream.Type(), &metadataStreamType) {
			continue
		}
		stream.Content = bytes.Repeat([]byte("x"), decodedStreamBytes)
		entry.Object = stream
		primedMetadataStreamCount++
	}
	require.Equal(t, 2, primedMetadataStreamCount)

	analysis, err := analyzePDF(pdfContext, PublicInput)

	require.NoError(t, err)
	require.Len(t, analysis.fields, 2)
	clearedMetadataStreamCount := 0
	for _, objectNumber := range sortedLiveObjectNumbers(pdfContext) {
		entry := pdfContext.Table[objectNumber]
		stream, ok := entry.Object.(types.StreamDict)
		if !ok || !reflect.DeepEqual(stream.Type(), &metadataStreamType) {
			continue
		}
		require.Nil(t, stream.Content)
		require.NotEmpty(t, stream.Raw)
		clearedMetadataStreamCount++
	}
	require.Equal(t, primedMetadataStreamCount, clearedMetadataStreamCount)
}

func TestInspectMetadataEntryReleasesDecodedCacheOnError(t *testing.T) {
	metadataStream := types.StreamDict{
		Dict:    types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")},
		Content: []byte{0xff, 0xfe},
	}
	testCases := []struct {
		name   string
		object types.Object
	}{
		{name: "direct stream", object: metadataStream},
		{name: "indirect stream", object: *types.NewIndirectRef(1, 0)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfContext := &model.Context{XRefTable: &model.XRefTable{Table: map[int]*model.XRefTableEntry{
				1: model.NewXRefTableEntryGen0(metadataStream),
			}}}
			dictionary := types.Dict{"Metadata": testCase.object}
			state := traversalState{context: pdfContext, analysis: &pdfAnalysis{}}

			err := state.inspectMetadataEntry(dictionary, "Metadata", false)

			require.ErrorContains(t, err, "PDF metadata stream is not valid UTF-8")
			require.Empty(t, state.analysis.fields)
			storedStream, _, err := pdfContext.DereferenceStreamDict(dictionary["Metadata"])
			require.NoError(t, err)
			require.NotNil(t, storedStream)
			require.Nil(t, storedStream.Content)
		})
	}
}

func TestPDFByteAPIsEnforceAggregateInputLimit(t *testing.T) {
	var basePDF []byte
	{
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		basePDF = output.Bytes()
	}
	require.LessOrEqual(t, len(basePDF), MaxInputBytes)
	exactLimitPDF := slices.Concat(basePDF, bytes.Repeat([]byte{' '}, MaxInputBytes-len(basePDF)))

	fields, err := InspectPDF(exactLimitPDF, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(exactLimitPDF)
	require.NoError(t, err)
	require.Equal(t, exactLimitPDF, outputBytes)

	overLimitPDF := slices.Concat(exactLimitPDF, []byte{' '})
	fields, err = InspectPDF(overLimitPDF, PublicInput)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, fields)

	outputBytes, err = CleanPDF(overLimitPDF)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, outputBytes)
}

func TestInspectionSummaryLimitsStayAtApprovedValues(t *testing.T) {
	require.Equal(t, 10_485_760, MaxInputBytes)
	require.Equal(t, 256, maxFieldPreviewBytes)
	require.Equal(t, 128, maxInspectionFields)
	require.Equal(t, 32_768, maxInspectionBytes)
	require.Equal(t, 20_000_000, maxDecodedMetadataBytes)
}

func TestInspectPDFBoundsIdentitiesDerivedFromLongCustomKeys(t *testing.T) {
	longKey := strings.Repeat("LongCustomKey", 512)
	var pdfBytes []byte
	{
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			info := types.Dict{longKey: types.StringLiteral("synthetic value")}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		pdfBytes = output.Bytes()
	}

	fields, err := InspectPDF(pdfBytes, PublicInput)

	require.NoError(t, err)
	require.Equal(t, []Field{{
		Name:             "info.custom.001",
		Label:            "Custom document property 1",
		Preview:          "synthetic value",
		OriginalByteSize: len("synthetic value"),
		Action:           ActionRemove,
	}}, fields)
	require.NotContains(t, fields[0].Name, longKey)
	require.NotContains(t, fields[0].Label, longKey)
	require.LessOrEqual(t, len(fields[0].Name), maxFieldPreviewBytes)
	require.LessOrEqual(t, len(fields[0].Label), maxFieldPreviewBytes)
}

func TestInspectPDFEnforcesFieldCountAtomically(t *testing.T) {
	acceptedPDF := buildInfoFieldCountPDFFixture(t, maxInspectionFields)
	acceptedFields, err := InspectPDF(acceptedPDF, PublicInput)
	require.NoError(t, err)
	require.Len(t, acceptedFields, maxInspectionFields)

	rejectedPDF := buildInfoFieldCountPDFFixture(t, maxInspectionFields+1)
	fields, err := InspectPDF(rejectedPDF, PublicInput)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, fields)

	outputBytes, err := CleanPDF(rejectedPDF)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, outputBytes)
}

func TestInspectPDFEnforcesAggregateSummaryBudgetAtomically(t *testing.T) {
	var pdfBytes []byte
	{
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			info := types.NewDict()
			for index := range maxInspectionFields {
				info.InsertString(fmt.Sprintf("Custom%03d", index), strings.Repeat("v", maxFieldPreviewBytes+1))
			}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		pdfBytes = output.Bytes()
	}

	fields, err := InspectPDF(pdfBytes, PublicInput)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, fields)

	outputBytes, err := CleanPDF(pdfBytes)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, outputBytes)
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

func TestPDFPathsEnforceConfiguredStreamLimit(t *testing.T) {
	oversizedContent := strings.Repeat("x", int(maxPDFStreamBytes)+1)
	var pdfBytes []byte
	{
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			page, _, _, err := pdfContext.PageDict(1, false)
			require.NoError(t, err)
			stream, err := pdfContext.NewStreamDictForBuf([]byte(oversizedContent))
			require.NoError(t, err)
			stream.Delete("Filter")
			stream.FilterPipeline = nil
			require.NoError(t, stream.Encode())
			streamReference, err := pdfContext.IndRefForNewObject(*stream)
			require.NoError(t, err)
			page.Update("Contents", *streamReference)
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		pdfBytes = output.Bytes()
	}

	defaultContext, defaultErr := api.ReadValidateAndOptimize(bytes.NewReader(pdfBytes), model.NewDefaultConfiguration())
	require.NoError(t, defaultErr)
	require.NotNil(t, defaultContext)

	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	require.Error(t, inspectErr)
	require.Nil(t, fields)

	outputBytes, scrubErr := CleanPDF(pdfBytes)
	require.Error(t, scrubErr)
	require.Nil(t, outputBytes)

	verificationErr := verifyScrubbedPDF(pdfBytes)
	require.Error(t, verificationErr)
}

func TestCleanPDFUsesEveryBoundedResourceLimitForWriting(t *testing.T) {
	configuration := boundedPDFConfiguration()

	require.Equal(t, int64(10_485_760), maxPDFStreamBytes)
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

	var inputBytes []byte
	{
		fixtureConfiguration := model.NewDefaultConfiguration()
		fixtureConfiguration.WriteObjectStream = false
		fixtureConfiguration.WriteXRefStream = false
		pdfContext, err := pdfcpu.CreateContextWithXRefTable(fixtureConfiguration, types.PaperSize["A4"])
		require.NoError(t, err)
		root, err := pdfContext.Catalog()
		require.NoError(t, err)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			info := types.Dict{"Title": types.StringLiteral("write me")}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}
	var writeLimits model.ResourceLimits
	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write: func(pdfContext *model.Context, writer io.Writer) error {
			writeLimits = pdfContext.Conf.Limits
			return api.WriteContext(pdfContext, writer)
		},
		verify: verifyScrubbedPDF,
	})

	require.NoError(t, err)
	require.NotNil(t, outputBytes)
	require.Equal(t, configuration.Limits, writeLimits)
}

func buildInfoFieldCountPDFFixture(t *testing.T, fieldCount int) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	root, err := pdfContext.Catalog()
	require.NoError(t, err)
	root.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
	pdfContext.PageCount = 1
	{
		info := types.NewDict()
		for index := range fieldCount {
			info.InsertString(fmt.Sprintf("Custom%03d", index), "x")
		}
		infoReference, err := pdfContext.IndRefForNewObject(info)
		require.NoError(t, err)
		pdfContext.Info = infoReference
	}
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildCompressedCatalogMetadataPDFFixture(t *testing.T, metadata []byte) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	root, err := pdfContext.Catalog()
	require.NoError(t, err)
	root.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
	pdfContext.PageCount = 1
	{
		stream, err := pdfContext.NewStreamDictForBuf(metadata)
		require.NoError(t, err)
		stream.InsertName("Type", "Metadata")
		stream.InsertName("Subtype", "XML")
		require.NoError(t, stream.Encode())
		streamReference, err := pdfContext.IndRefForNewObject(*stream)
		require.NoError(t, err)
		catalog, err := pdfContext.Catalog()
		require.NoError(t, err)
		catalog.Insert("Metadata", *streamReference)
	}
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildMetadataCachePDFFixture(t *testing.T, decodedStreamBytes int) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	root, err := pdfContext.Catalog()
	require.NoError(t, err)
	root.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
	pdfContext.PageCount = 1
	{
		catalog, err := pdfContext.Catalog()
		require.NoError(t, err)
		parents := make(types.Array, 0, 2)
		for range 2 {
			stream, err := pdfContext.NewStreamDictForBuf(bytes.Repeat([]byte("x"), decodedStreamBytes))
			require.NoError(t, err)
			stream.InsertName("Type", "Metadata")
			stream.InsertName("Subtype", "XML")
			require.NoError(t, stream.Encode())
			reference, err := pdfContext.IndRefForNewObject(*stream)
			require.NoError(t, err)
			parents = append(parents, types.Dict{"Metadata": *reference})
		}
		catalog.Insert("SyntheticParents", parents)
	}
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}
