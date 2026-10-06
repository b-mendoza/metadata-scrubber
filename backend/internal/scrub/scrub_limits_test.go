package scrub

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
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
	pdfContext := newSinglePagePDFContext(t)
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
	pdfBytes := writeTypedPDFFixture(t, pdfContext)

	fields, inspectErr := InspectPDF(pdfBytes)
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
	metadata := prefix + strings.Repeat("x", decodedBytes-len(prefix)-len(suffix)) + suffix

	fixtureContext := newSinglePagePDFContext(t)
	stream, err := fixtureContext.NewStreamDictForBuf([]byte(metadata))
	require.NoError(t, err)
	stream.InsertName("Type", "Metadata")
	stream.InsertName("Subtype", "XML")
	require.NoError(t, stream.Encode())
	streamReference, err := fixtureContext.IndRefForNewObject(*stream)
	require.NoError(t, err)
	catalog, err := fixtureContext.Catalog()
	require.NoError(t, err)
	catalog.Insert("Metadata", *streamReference)
	pdfBytes := writeTypedPDFFixture(t, fixtureContext)
	require.Less(t, len(pdfBytes), MaxInputBytes)
	validationCalls := 0

	pdfContext, readErr := readPDFWithValidator(pdfBytes, func(validationContext *model.Context) error {
		validationCalls++
		return api.ValidateContext(validationContext)
	})
	fields, inspectErr := InspectPDF(pdfBytes)
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
	metadata := []byte("cached metadata")
	fixtureContext := newSinglePagePDFContext(t)
	catalog, catalogErr := fixtureContext.Catalog()
	require.NoError(t, catalogErr)
	parents := make(types.Array, 0, 2)
	metadataReferences := make([]types.IndirectRef, 0, 2)
	for range 2 {
		stream, err := fixtureContext.NewStreamDictForBuf(metadata)
		require.NoError(t, err)
		stream.InsertName("Type", "Metadata")
		stream.InsertName("Subtype", "XML")
		require.NoError(t, stream.Encode())
		reference, err := fixtureContext.IndRefForNewObject(*stream)
		require.NoError(t, err)
		parents = append(parents, types.Dict{"Metadata": *reference})
		metadataReferences = append(metadataReferences, *reference)
	}
	catalog.Insert("SyntheticParents", parents)
	pdfBytes := writeTypedPDFFixture(t, fixtureContext)
	pdfContext, err := readPDFWithValidator(pdfBytes, api.ValidateContext)
	require.NoError(t, err)
	for _, reference := range metadataReferences {
		entry := pdfContext.Table[reference.ObjectNumber.Value()]
		require.NotNil(t, entry)
		stream, ok := entry.Object.(types.StreamDict)
		require.True(t, ok)
		streamType, ok := stream.Dict["Type"].(types.Name)
		require.True(t, ok)
		require.Equal(t, types.Name("Metadata"), streamType)
		stream.Content = bytes.Clone(metadata)
		entry.Object = stream
	}

	analysis, err := analyzePDF(pdfContext)

	require.NoError(t, err)
	require.Len(t, analysis.fields, 2)
	for _, reference := range metadataReferences {
		entry := pdfContext.Table[reference.ObjectNumber.Value()]
		require.NotNil(t, entry)
		stream, ok := entry.Object.(types.StreamDict)
		require.True(t, ok)
		require.Nil(t, stream.Content)
		require.NotEmpty(t, stream.Raw)
	}
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
	pdfContext := newSinglePagePDFContext(t)
	basePDF := writeTypedPDFFixture(t, pdfContext)
	require.LessOrEqual(t, len(basePDF), MaxInputBytes)
	exactLimitPDF := slices.Concat(basePDF, bytes.Repeat([]byte{' '}, MaxInputBytes-len(basePDF)))

	fields, err := InspectPDF(exactLimitPDF)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(exactLimitPDF)
	require.NoError(t, err)
	require.Equal(t, exactLimitPDF, outputBytes)

	overLimitPDF := slices.Concat(exactLimitPDF, []byte{' '})
	fields, err = InspectPDF(overLimitPDF)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, fields)

	outputBytes, err = CleanPDF(overLimitPDF)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, outputBytes)
}

func TestInspectPDFBoundsIdentitiesDerivedFromLongCustomKeys(t *testing.T) {
	longKey := strings.Repeat("LongCustomKey", 512)
	pdfContext := newSinglePagePDFContext(t)
	info := types.Dict{longKey: types.StringLiteral("synthetic value")}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	pdfBytes := writeTypedPDFFixture(t, pdfContext)

	fields, err := InspectPDF(pdfBytes)

	require.NoError(t, err)
	require.Equal(t, []Field{{
		Name:             "info.custom.001",
		Label:            "Custom document property 1",
		Preview:          "synthetic value",
		OriginalByteSize: len("synthetic value"),
		Action:           ActionRemove,
	}}, fields)
}

func TestInspectPDFEnforcesFieldCountAtomically(t *testing.T) {
	acceptedPDF := buildInfoFieldCountPDFFixture(t, maxInspectionFields)
	acceptedFields, err := InspectPDF(acceptedPDF)
	require.NoError(t, err)
	require.Len(t, acceptedFields, maxInspectionFields)

	rejectedPDF := buildInfoFieldCountPDFFixture(t, maxInspectionFields+1)
	fields, err := InspectPDF(rejectedPDF)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, fields)

	outputBytes, err := CleanPDF(rejectedPDF)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, outputBytes)
}

func TestInspectPDFEnforcesAggregateSummaryBudgetAtomically(t *testing.T) {
	pdfContext := newSinglePagePDFContext(t)
	info := types.NewDict()
	for index := range maxInspectionFields {
		info.InsertString(fmt.Sprintf("Custom%03d", index), strings.Repeat("v", maxFieldPreviewBytes+1))
	}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	pdfBytes := writeTypedPDFFixture(t, pdfContext)

	fields, err := InspectPDF(pdfBytes)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, fields)

	outputBytes, err := CleanPDF(pdfBytes)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, outputBytes)
}

func TestApprovedPDFLimitsStayPinned(t *testing.T) {
	configuration := boundedPDFConfiguration()
	require.Equal(t, model.ResourceLimits{
		MaxStreamBytes:       10_485_760,
		MaxDecodeBytes:       20_000_000,
		MaxImagePixels:       10_000_000,
		MaxImageBytes:        40_000_000,
		MaxObjectCount:       100_000,
		MaxObjectStreamCount: 50_000,
		MaxObjectStreamFirst: 2_000_000,
		MaxXRefEntries:       100_000,
		MaxRecursionDepth:    64,
	}, configuration.Limits)
	require.Equal(t, model.REMOVEPROPERTIES, configuration.Cmd)
	require.True(t, configuration.PostProcessValidate)
	require.Equal(t, 256, maxFieldPreviewBytes)
	require.Equal(t, 128, maxInspectionFields)
	require.Equal(t, 32_768, maxInspectionBytes)
	require.Equal(t, 20_000_000, maxDecodedMetadataBytes)
}

func buildInfoFieldCountPDFFixture(t *testing.T, fieldCount int) []byte {
	t.Helper()

	pdfContext := newSinglePagePDFContext(t)
	info := types.NewDict()
	for index := range fieldCount {
		info.InsertString(fmt.Sprintf("Custom%03d", index), "x")
	}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	return writeTypedPDFFixture(t, pdfContext)
}
