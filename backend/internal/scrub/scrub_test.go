package scrub

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/stretchr/testify/require"
)

func TestInspectPDFRequiresKnownOrigin(t *testing.T) {
	DisableConfigDir()

	fields, err := InspectPDF(buildCleanPDF(t), InspectionOrigin("unknown"))

	require.Error(t, err)
	require.Nil(t, fields)
}

func TestCleanPDFRejectsInvalidPDFWithNoOutput(t *testing.T) {
	DisableConfigDir()

	outputBytes, err := CleanPDF([]byte("not a pdf"))

	require.Error(t, err)
	require.Nil(t, outputBytes)
}

func TestInspectPDFEnumeratesDeepMetadataDeterministically(t *testing.T) {
	DisableConfigDir()
	pdfBytes, metadata := buildMetadataRichPDF(t)

	fields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)

	expectedFields := []Field{
		{Name: "info.author", Label: "Author", Preview: metadata.author, OriginalByteSize: len(metadata.author), Action: ActionRemove},
		{Name: "info.creation_date", Label: "Creation date", Preview: metadata.creationDate, OriginalByteSize: len(metadata.creationDate), Action: ActionReplace},
		{Name: "info.custom.001", Label: "Custom document property 1", Preview: metadata.customValue, OriginalByteSize: len(metadata.customValue), Action: ActionRemove},
		{Name: "info.custom.002", Label: "Custom document property 2", Preview: "true", OriginalByteSize: len("true"), Action: ActionRemove},
		{Name: "info.custom.003", Label: "Custom document property 3", Preview: "SyntheticName", OriginalByteSize: len("SyntheticName"), Action: ActionRemove},
		{Name: "info.custom.004", Label: "Custom document property 4", Preview: "7", OriginalByteSize: len("7"), Action: ActionRemove},
		{Name: "info.mod_date", Label: "Modification date", Preview: metadata.modDate, OriginalByteSize: len(metadata.modDate), Action: ActionReplace},
		{Name: "info.producer", Label: "Producer", Preview: metadata.producer, OriginalByteSize: len(metadata.producer), Action: ActionReplace},
		{Name: "info.title", Label: "Title", Preview: metadata.title, OriginalByteSize: len(metadata.title), Action: ActionRemove},
		{Name: "metadata.catalog", Label: "Document metadata", Preview: metadata.catalogXMP, OriginalByteSize: len(metadata.catalogXMP), Action: ActionRemove},
		{Name: "metadata.object.000001.001", Label: "Embedded metadata 1", Preview: metadata.nestedXMP, OriginalByteSize: len(metadata.nestedXMP), Action: ActionRemove},
		{Name: "metadata.page.0001", Label: "Page 1 metadata", Preview: metadata.pageXMP, OriginalByteSize: len(metadata.pageXMP), Action: ActionRemove},
		{Name: "metadata.page.0002", Label: "Page 2 metadata", Preview: metadata.pageXMP, OriginalByteSize: len(metadata.pageXMP), Action: ActionRemove},
	}
	require.Equal(t, expectedFields, fields)

	repeatedFields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, fields, repeatedFields)
}

func TestInspectPDFAppliesPreviewByteCeilingDeterministically(t *testing.T) {
	DisableConfigDir()

	testCases := []struct {
		name            string
		value           string
		expectedPreview string
	}{
		{name: "below ceiling", value: strings.Repeat("a", maxFieldPreviewBytes-1), expectedPreview: strings.Repeat("a", maxFieldPreviewBytes-1)},
		{name: "exact ceiling", value: strings.Repeat("b", maxFieldPreviewBytes), expectedPreview: strings.Repeat("b", maxFieldPreviewBytes)},
		{name: "above ceiling", value: strings.Repeat("c", maxFieldPreviewBytes+1), expectedPreview: strings.Repeat("c", maxFieldPreviewBytes)},
		{name: "multibyte rune crosses ceiling", value: strings.Repeat("d", maxFieldPreviewBytes-1) + "éZ", expectedPreview: strings.Repeat("d", maxFieldPreviewBytes-1)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString(testCase.value)})

			fields, err := InspectPDF(pdfBytes, PublicInput)
			require.NoError(t, err)
			require.Len(t, fields, 1)
			require.Equal(t, testCase.expectedPreview, fields[0].Preview)
			require.Equal(t, len(testCase.value), fields[0].OriginalByteSize)
			requireValidUTF8Preview(t, fields[0])

			repeatedFields, err := InspectPDF(pdfBytes, PublicInput)
			require.NoError(t, err)
			require.Equal(t, fields, repeatedFields)
		})
	}
}

func TestInspectPDFPreservesBackslashAndParenthesisCharacters(t *testing.T) {
	DisableConfigDir()
	const title = `back\slash (balanced) and lone ( parenthesis`
	pdfBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString(title)})

	fields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Len(t, fields, 1)
	require.Equal(t, title, fields[0].Preview)
	require.Equal(t, len(title), fields[0].OriginalByteSize)
}

func TestPDFPathsRejectAggregateDecodedMetadataBudgetBeforeWriting(t *testing.T) {
	DisableConfigDir()
	const (
		streamCount        = 24
		decodedStreamBytes = 1 << 20
	)
	require.Greater(t, streamCount*decodedStreamBytes, maxDecodedMetadataBytes)
	pdfBytes := buildPDFWithCompressedMetadataStreams(t, streamCount, decodedStreamBytes)
	work := newObservedPDFWork()

	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	outputBytes, scrubErr := work.clean(pdfBytes)

	requireInspectionLimit(t, fields, inspectErr)
	requireInspectionLimit(t, outputBytes, scrubErr)
	requireNoPDFWork(t, work)
}

func TestPDFPathsRejectOversizedCompressedCatalogMetadataBeforeValidation(t *testing.T) {
	DisableConfigDir()
	decodedBytes := maxDecodedMetadataBytes + 1
	pdfBytes := buildPDFWithCompressedCatalogMetadata(t, oversizedXMP(t, decodedBytes))
	require.Less(t, len(pdfBytes), MaxInputBytes)
	work := newObservedPDFWork()
	validationCalls := 0
	originalValidatePDFContext := validatePDFContext
	validatePDFContext = func(context *model.Context) error {
		validationCalls++
		return originalValidatePDFContext(context)
	}
	t.Cleanup(func() { validatePDFContext = originalValidatePDFContext })

	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	outputBytes, scrubErr := CleanPDF(pdfBytes)
	observedOutputBytes, observedScrubErr := work.clean(pdfBytes)

	requireInspectionLimit(t, fields, inspectErr)
	requireInspectionLimit(t, outputBytes, scrubErr)
	requireInspectionLimit(t, observedOutputBytes, observedScrubErr)
	require.Zero(t, validationCalls)
	requireNoPDFWork(t, work)
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

func TestAnalyzePDFReleasesDecodedMetadataStreamCaches(t *testing.T) {
	DisableConfigDir()
	const decodedStreamBytes = 1 << 20
	context, err := readPDF(buildPDFWithCompressedMetadataStreams(t, 2, decodedStreamBytes))
	require.NoError(t, err)
	require.Equal(t, 2, primeMetadataStreamCaches(t, context, decodedStreamBytes))

	analysis, err := analyzePDF(context, PublicInput)

	require.NoError(t, err)
	require.Len(t, analysis.fields, 2)
	requireMetadataStreamCachesCleared(t, context)

	removeAnalyzedMetadata(context, analysis)
	var output bytes.Buffer
	require.NoError(t, api.WriteContext(context, &output))
	require.NoError(t, verifyScrubbedPDF(output.Bytes()))
}

func TestPDFByteAPIsEnforceAggregateInputLimit(t *testing.T) {
	DisableConfigDir()
	exactLimitPDF := padPDFToSize(t, buildCleanPDF(t), MaxInputBytes)

	fields, err := InspectPDF(exactLimitPDF, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(exactLimitPDF)
	require.NoError(t, err)
	require.Equal(t, exactLimitPDF, outputBytes)

	overLimitPDF := append(exactLimitPDF, ' ')
	fields, err = InspectPDF(overLimitPDF, PublicInput)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, fields)

	outputBytes, err = CleanPDF(overLimitPDF)
	require.ErrorIs(t, err, ErrInputTooLarge)
	require.Nil(t, outputBytes)
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

func TestInspectPDFBoundsIdentitiesDerivedFromLongCustomKeys(t *testing.T) {
	DisableConfigDir()
	longKey := strings.Repeat("LongCustomKey", 512)
	pdfBytes := buildPDFWithInfo(t, map[string]string{longKey: pdfString("synthetic value")})

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
	DisableConfigDir()
	work := newObservedPDFWork()

	acceptedEntries := make(map[string]string, maxInspectionFields)
	for index := range maxInspectionFields {
		acceptedEntries[fmt.Sprintf("Custom%03d", index)] = pdfString("x")
	}
	acceptedFields, err := InspectPDF(buildPDFWithInfo(t, acceptedEntries), PublicInput)
	require.NoError(t, err)
	require.Len(t, acceptedFields, maxInspectionFields)

	rejectedEntries := make(map[string]string, maxInspectionFields+1)
	for index := range maxInspectionFields + 1 {
		rejectedEntries[fmt.Sprintf("Custom%03d", index)] = pdfString("x")
	}
	rejectedPDF := buildPDFWithInfo(t, rejectedEntries)
	fields, err := InspectPDF(rejectedPDF, PublicInput)
	requireInspectionLimit(t, fields, err)

	outputBytes, err := work.clean(rejectedPDF)
	requireInspectionLimit(t, outputBytes, err)
	requireNoPDFWork(t, work)
}

func TestInspectPDFEnforcesAggregateSummaryBudgetAtomically(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	entries := make(map[string]string, maxInspectionFields)
	for index := range maxInspectionFields {
		entries[fmt.Sprintf("Custom%03d", index)] = pdfString(strings.Repeat("v", maxFieldPreviewBytes+1))
	}
	pdfBytes := buildPDFWithInfo(t, entries)

	fields, err := InspectPDF(pdfBytes, PublicInput)
	requireInspectionLimit(t, fields, err)

	outputBytes, err := work.clean(pdfBytes)
	requireInspectionLimit(t, outputBytes, err)
	requireNoPDFWork(t, work)
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

func TestInspectPDFTreatsNeutralTrioAccordingToOrigin(t *testing.T) {
	DisableConfigDir()
	date := "D:20260102030405+00'00'"
	pdfBytes := buildPDFWithInfo(t, map[string]string{
		"Producer":     pdfString("pdfcpu " + model.VersionStr),
		"CreationDate": pdfString(date),
		"ModDate":      pdfString(date),
	})

	publicFields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicFields))
	for _, field := range publicFields {
		require.Equal(t, ActionReplace, field.Action)
	}

	verificationFields, err := InspectPDF(pdfBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestInspectPDFKeepsEveryNeutralTrioNearMissVisible(t *testing.T) {
	DisableConfigDir()
	date := "D:20260102030405+00'00'"
	neutralEntries := map[string]string{
		"Producer":     pdfString("pdfcpu " + model.VersionStr),
		"CreationDate": pdfString(date),
		"ModDate":      pdfString(date),
	}

	testCases := []struct {
		name          string
		entries       map[string]string
		metadata      metadataLocation
		expectedNames []string
	}{
		{name: "partial trio", entries: map[string]string{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"]}, expectedNames: []string{"info.creation_date", "info.producer"}},
		{name: "mismatched dates", entries: mergeInfoEntries(neutralEntries, map[string]string{"ModDate": pdfString("D:20260102030406+00'00'")}), expectedNames: neutralTrioFieldNames()},
		{name: "invalid dates", entries: mergeInfoEntries(neutralEntries, map[string]string{"CreationDate": pdfString("invalid"), "ModDate": pdfString("invalid")}), expectedNames: neutralTrioFieldNames()},
		{name: "different producer", entries: mergeInfoEntries(neutralEntries, map[string]string{"Producer": pdfString("another producer")}), expectedNames: neutralTrioFieldNames()},
		{name: "extra custom Info", entries: mergeInfoEntries(neutralEntries, map[string]string{"Custom": pdfString("still-user-metadata")}), expectedNames: []string{"info.creation_date", "info.custom.001", "info.mod_date", "info.producer"}},
		{name: "catalog metadata", entries: neutralEntries, metadata: catalogMetadata, expectedNames: append(neutralTrioFieldNames(), "metadata.catalog")},
		{name: "page metadata", entries: neutralEntries, metadata: pageMetadata, expectedNames: append(neutralTrioFieldNames(), "metadata.page.0001")},
		{name: "nested metadata", entries: neutralEntries, metadata: nestedMetadata, expectedNames: append(neutralTrioFieldNames(), "metadata.object.000001.001")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := buildPDFWithInfoAndMetadata(t, testCase.entries, testCase.metadata)

			fields, err := InspectPDF(pdfBytes, PostWriteVerification)

			require.NoError(t, err)
			require.Equal(t, testCase.expectedNames, fieldNames(fields))
			requireExpectedActions(t, fields)
		})
	}
}

func TestCleanPDFRemovesEveryInspectedTargetAndVerifiesOutput(t *testing.T) {
	DisableConfigDir()
	inputBytes, metadata := buildMetadataRichPDF(t)
	inputContext := assertValidPDF(t, inputBytes)
	require.Equal(t, 2, inputContext.PageCount)

	inputFields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Len(t, inputFields, 13)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)

	outputContext := assertValidPDF(t, outputBytes)
	require.Equal(t, inputContext.PageCount, outputContext.PageCount)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)

	publicOutputFields, err := InspectPDF(outputBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicOutputFields))
	for _, field := range publicOutputFields {
		require.Equal(t, ActionReplace, field.Action)
	}

	requireNoOriginalMarkers(t, outputBytes,
		metadata.title,
		metadata.author,
		metadata.producer,
		metadata.customValue,
		"catalog-xmp-marker",
		"page-xmp-marker",
		"nested-xmp-marker",
	)
	contentByPage := extractedPageContent(t, outputContext)
	require.Contains(t, contentByPage[1], "Synthetic readable content page one")
	require.Contains(t, contentByPage[2], "Synthetic readable content page two")
}

func TestCleanPDFReturnsCleanPDFWithoutRewriting(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	inputBytes := buildCleanPDF(t)

	fields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := work.clean(inputBytes)
	require.NoError(t, err)
	require.Equal(t, inputBytes, outputBytes)
	requireNoPDFWork(t, work)
}

func TestCleanPDFRewritesPublicNeutralLookingTrio(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	date := "D:20260102030405+00'00'"
	inputBytes := buildPDFWithInfo(t, map[string]string{
		"Producer":     pdfString("pdfcpu " + model.VersionStr),
		"CreationDate": pdfString(date),
		"ModDate":      pdfString(date),
	})

	outputBytes, err := work.clean(inputBytes)

	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)
	require.Equal(t, 1, work.mutations)
	require.Equal(t, 1, work.writes)
	require.Equal(t, 1, work.verifications)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestPDFPathsEnforceConfiguredStreamLimit(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	oversizedContent := strings.Repeat("x", int(maxPDFStreamBytes)+1)
	pdfBytes := buildPDFWithContent(t, oversizedContent)

	defaultContext, defaultErr := api.ReadValidateAndOptimize(bytes.NewReader(pdfBytes), model.NewDefaultConfiguration())
	require.NoError(t, defaultErr)
	require.NotNil(t, defaultContext)

	fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
	require.Error(t, inspectErr)
	require.Nil(t, fields)

	outputBytes, scrubErr := work.clean(pdfBytes)
	require.Error(t, scrubErr)
	require.Nil(t, outputBytes)

	verificationErr := verifyScrubbedPDF(pdfBytes)
	require.Error(t, verificationErr)
	requireNoPDFWork(t, work)
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

func TestCleanPDFUsesBoundedConfigurationForWriting(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	inputBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString("write me")})

	outputBytes, err := work.clean(inputBytes)

	require.NoError(t, err)
	require.NotNil(t, outputBytes)
	require.Equal(t, 1, work.writes)
	require.Equal(t, []model.ResourceLimits{boundedPDFConfiguration().Limits}, work.writeLimits)
}

func TestCleanPDFUsesBoundedConfigurationForPostWriteVerification(t *testing.T) {
	DisableConfigDir()
	oversizedPDF := buildPDFWithContent(t, strings.Repeat("x", int(maxPDFStreamBytes)+1))
	work := newObservedPDFWork()
	work.writeOutput = oversizedPDF
	inputBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString("verify me")})

	outputBytes, err := work.clean(inputBytes)

	require.Error(t, err)
	require.Nil(t, outputBytes)
	require.Equal(t, 1, work.mutations)
	require.Equal(t, 1, work.writes)
	require.Equal(t, 1, work.verifications)
}

func TestCleanPDFReturnsNilOutputWhenWriteFails(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	work.writeError = errors.New("synthetic write failure")
	inputBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString("write failure")})

	outputBytes, err := work.clean(inputBytes)

	require.Error(t, err)
	require.Nil(t, outputBytes)
	require.Equal(t, 1, work.mutations)
	require.Equal(t, 1, work.writes)
	require.Zero(t, work.verifications)
}

func TestCleanPDFReturnsNilOutputWhenPostWriteVerificationFails(t *testing.T) {
	DisableConfigDir()
	work := newObservedPDFWork()
	work.verifyError = errors.New("synthetic verification failure")
	inputBytes := buildPDFWithInfo(t, map[string]string{"Title": pdfString("verification failure")})

	outputBytes, err := work.clean(inputBytes)

	require.Error(t, err)
	require.Nil(t, outputBytes)
	require.Equal(t, 1, work.mutations)
	require.Equal(t, 1, work.writes)
	require.Equal(t, 1, work.verifications)
}

func TestPDFPathsRejectUndecodableMetadataAtomically(t *testing.T) {
	DisableConfigDir()
	testCases := []struct {
		name     string
		pdfBytes func(*testing.T) []byte
	}{
		{name: "unsupported Info value", pdfBytes: func(t *testing.T) []byte {
			return buildPDFWithInfo(t, map[string]string{"Custom": "[1 2]"})
		}},
		{name: "non UTF-8 metadata stream", pdfBytes: func(t *testing.T) []byte {
			return buildPDFWithInfoAndRawMetadata(t, map[string]string{}, string([]byte{0xff, 0xfe}))
		}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := testCase.pdfBytes(t)
			work := newObservedPDFWork()

			fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
			outputBytes, scrubErr := work.clean(pdfBytes)

			require.Error(t, inspectErr)
			require.Nil(t, fields)
			require.Error(t, scrubErr)
			require.Nil(t, outputBytes)
			requireNoPDFWork(t, work)
		})
	}
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

func TestInspectPDFRejectsEverySignedStructureBeforeMutationOrWriting(t *testing.T) {
	DisableConfigDir()
	testCases := []struct {
		name     string
		pdfBytes func(*testing.T) []byte
	}{
		{name: "signature dictionary", pdfBytes: func(t *testing.T) []byte { return buildSignedPDF(t, signedDictionary) }},
		{name: "document timestamp dictionary", pdfBytes: func(t *testing.T) []byte { return buildSignedPDF(t, documentTimestampDictionary) }},
		{name: "certification permission", pdfBytes: func(t *testing.T) []byte { return buildSignedPDF(t, certificationPermission) }},
		{name: "usage rights permission", pdfBytes: func(t *testing.T) []byte { return buildSignedPDF(t, usageRightsPermission) }},
		{name: "cached signed form state", pdfBytes: func(t *testing.T) []byte { return buildSignedPDF(t, cachedSignedForm) }},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := testCase.pdfBytes(t)
			work := newObservedPDFWork()

			fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
			outputBytes, scrubErr := work.clean(pdfBytes)

			requireSignedPDF(t, fields, outputBytes, inspectErr, scrubErr)
			requireNoPDFWork(t, work)
		})
	}
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

func TestInspectPDFAcceptsSignatureLikeTextAndEmptySignatureField(t *testing.T) {
	DisableConfigDir()
	pdfBytes := buildUnsignedSignatureLikePDF(t)

	fields, err := InspectPDF(pdfBytes, PublicInput)

	requireNotSignedPDF(t, err)
	require.NoError(t, err)
	require.NotEmpty(t, fields)
}

func buildPDFWithCompressedMetadataStreams(t *testing.T, streamCount, decodedStreamBytes int) []byte {
	t.Helper()

	objects := map[int]string{
		2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
		4: streamObject("BT 20 100 Td (Synthetic page) Tj ET"),
	}
	var catalog strings.Builder
	catalog.WriteString("<< /Type /Catalog /Pages 2 0 R /SyntheticParents [")
	for index := range streamCount {
		parentObjectNumber := 5 + index*2
		streamObjectNumber := parentObjectNumber + 1
		_, err := fmt.Fprintf(&catalog, " %d 0 R", parentObjectNumber)
		require.NoError(t, err)
		objects[parentObjectNumber] = fmt.Sprintf("<< /Metadata %d 0 R >>", streamObjectNumber)
		objects[streamObjectNumber] = compressedMetadataStreamObject(t, strings.Repeat("x", decodedStreamBytes))
	}
	catalog.WriteString(" ] >>")
	objects[1] = catalog.String()

	return buildPDF(t, pdfFixture{objects: objects, rootObjectNumber: 1})
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

func compressedMetadataStreamObject(t *testing.T, content string) string {
	t.Helper()

	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	_, err := io.WriteString(writer, content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	return fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Filter /FlateDecode /Length %d >>\nstream\n%s\nendstream", compressed.Len(), compressed.String())
}

func primeMetadataStreamCaches(t *testing.T, context *model.Context, decodedStreamBytes int) int {
	t.Helper()

	primed := 0
	for _, entry := range context.Table {
		if entry == nil || entry.Object == nil {
			continue
		}
		stream, ok := entry.Object.(types.StreamDict)
		if !ok || stream.Type() == nil || *stream.Type() != "Metadata" {
			continue
		}
		stream.Content = bytes.Repeat([]byte("x"), decodedStreamBytes)
		entry.Object = stream
		primed++
	}
	return primed
}

func requireMetadataStreamCachesCleared(t *testing.T, context *model.Context) {
	t.Helper()

	metadataStreamCount := 0
	for _, entry := range context.Table {
		if entry == nil || entry.Object == nil {
			continue
		}
		stream, ok := entry.Object.(types.StreamDict)
		if !ok || stream.Type() == nil || *stream.Type() != "Metadata" {
			continue
		}
		metadataStreamCount++
		require.Nil(t, stream.Content)
		require.NotEmpty(t, stream.Raw)
	}
	require.Positive(t, metadataStreamCount)
}

func padPDFToSize(t *testing.T, pdfBytes []byte, size int) []byte {
	t.Helper()
	require.LessOrEqual(t, len(pdfBytes), size)

	paddedPDF := make([]byte, size)
	copy(paddedPDF, pdfBytes)
	for index := len(pdfBytes); index < len(paddedPDF); index++ {
		paddedPDF[index] = ' '
	}
	return paddedPDF
}

func buildCleanPDF(t *testing.T) []byte {
	t.Helper()

	return buildPDFWithContent(t, "BT /F1 12 Tf 20 100 Td (Synthetic page) Tj ET")
}

func buildPDFWithContent(t *testing.T, content string) []byte {
	t.Helper()

	return buildPDF(t, pdfFixture{
		objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R >>",
			2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
			3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
			4: streamObject(content),
		},
		rootObjectNumber: 1,
	})
}

type metadataFixtureValues struct {
	title        string
	author       string
	producer     string
	creationDate string
	modDate      string
	customValue  string
	catalogXMP   string
	pageXMP      string
	nestedXMP    string
}

func buildMetadataRichPDF(t *testing.T) ([]byte, metadataFixtureValues) {
	t.Helper()

	metadata := metadataFixtureValues{
		title:        "Synthetic title",
		author:       "Synthetic author",
		producer:     "Synthetic producer",
		creationDate: "D:20260102030405+00'00'",
		modDate:      "D:20260203040506+00'00'",
		customValue:  "Synthetic custom value",
		catalogXMP:   syntheticXMP("catalog-xmp-marker"),
		pageXMP:      syntheticXMP("page-xmp-marker"),
		nestedXMP:    syntheticXMP("nested-xmp-marker"),
	}

	infoDictionary := fmt.Sprintf(
		"<< /Title %s /Author <%x> /Producer %s /CreationDate %s /ModDate %s /Custom#20Key %s /Flag true /Mode /SyntheticName /Rank 7 >>",
		pdfString(metadata.title),
		[]byte(metadata.author),
		pdfString(metadata.producer),
		pdfString(metadata.creationDate),
		pdfString(metadata.modDate),
		pdfString(metadata.customValue),
	)

	return buildPDF(t, pdfFixture{
		objects: map[int]string{
			1:  "<< /Type /Catalog /Pages 2 0 R /Metadata 6 0 R /Synthetic << /Metadata 8 0 R >> >>",
			2:  "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
			3:  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 5 0 R /Metadata 7 0 R >>",
			4:  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 10 0 R /Metadata 7 0 R >>",
			5:  streamObject("BT 20 100 Td (Synthetic readable content page one) Tj ET"),
			6:  metadataStreamObject(metadata.catalogXMP),
			7:  metadataStreamObject(metadata.pageXMP),
			8:  metadataStreamObject(metadata.nestedXMP),
			9:  infoDictionary,
			10: streamObject("BT 20 100 Td (Synthetic readable content page two) Tj ET"),
		},
		rootObjectNumber: 1,
		infoObjectNumber: 9,
	}), metadata
}

type metadataLocation int

const (
	noMetadata metadataLocation = iota
	catalogMetadata
	pageMetadata
	nestedMetadata
)

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

type signedPDFVariant int

const (
	signedDictionary signedPDFVariant = iota
	documentTimestampDictionary
	certificationPermission
	usageRightsPermission
	cachedSignedForm
)

func buildSignedPDF(t *testing.T, variant signedPDFVariant) []byte {
	t.Helper()

	objects := map[int]string{
		1: "<< /Type /Catalog /Pages 2 0 R >>",
		2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
		4: streamObject("BT 20 100 Td (Signed synthetic page) Tj ET"),
	}

	switch variant {
	case signedDictionary:
		objects[1] = "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 3 >> >>"
		objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>"
		objects[5] = "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /V 6 0 R /P 3 0 R >>"
		objects[6] = "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <> /M (D:20260102030405+00'00') >>"
	case documentTimestampDictionary:
		objects[1] = "<< /Type /Catalog /Pages 2 0 R /SyntheticTimestamp 5 0 R >>"
		objects[5] = "<< /Type /DocTimeStamp /Filter /Adobe.PPKLite >>"
	case certificationPermission:
		objects[1] = "<< /Type /Catalog /Pages 2 0 R /Perms << /DocMDP 5 0 R >> >>"
		objects[5] = "<< /Filter /Adobe.PPKLite >>"
	case usageRightsPermission:
		objects[1] = "<< /Type /Catalog /Pages 2 0 R /Perms << /UR3 5 0 R >> >>"
		objects[5] = "<< /Filter /Adobe.PPKLite >>"
	case cachedSignedForm:
		objects[1] = "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] >> >>"
		objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>"
		objects[5] = "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /V 6 0 R /P 3 0 R >>"
		objects[6] = "<< /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <> >>"
	}

	return buildPDF(t, pdfFixture{objects: objects, rootObjectNumber: 1})
}

func buildUnsignedSignatureLikePDF(t *testing.T) []byte {
	t.Helper()

	return buildPDF(t, pdfFixture{
		objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] >> >>",
			2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
			3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>",
			4: streamObject("BT 20 100 Td (/Type /Sig is ordinary text) Tj ET"),
			5: "<< /Type /Annot /Subtype /Widget /FT /Sig /T (EmptySignature) /Rect [0 0 0 0] /P 3 0 R >>",
			6: "<< /Title (/Type /DocTimeStamp is ordinary text) >>",
		},
		rootObjectNumber: 1,
		infoObjectNumber: 6,
	})
}

func syntheticXMP(marker string) string {
	return fmt.Sprintf(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="%s"/></rdf:RDF></x:xmpmeta>`, marker)
}

func oversizedXMP(t *testing.T, decodedBytes int) string {
	t.Helper()

	const prefix = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>`
	const suffix = `</rdf:Description></rdf:RDF></x:xmpmeta>`
	require.Greater(t, decodedBytes, len(prefix)+len(suffix))

	var metadata strings.Builder
	metadata.Grow(decodedBytes)
	metadata.WriteString(prefix)
	metadata.WriteString(strings.Repeat("x", decodedBytes-len(prefix)-len(suffix)))
	metadata.WriteString(suffix)
	return metadata.String()
}

func pdfString(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `(`, `\(`, `)`, `\)`)
	return "(" + replacer.Replace(value) + ")"
}

type pdfFixture struct {
	objects          map[int]string
	rootObjectNumber int
	infoObjectNumber int
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

func streamObject(content string) string {
	return fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content)
}

func metadataStreamObject(content string) string {
	return fmt.Sprintf("<< /Type /Metadata /Subtype /XML /Length %d >>\nstream\n%s\nendstream", len(content), content)
}

func assertValidPDF(t *testing.T, pdfBytes []byte) *model.Context {
	t.Helper()

	context, err := api.ReadValidateAndOptimize(bytes.NewReader(pdfBytes), boundedPDFConfiguration())
	require.NoError(t, err)

	return context
}

func extractedPageContent(t *testing.T, context *model.Context) map[int]string {
	t.Helper()

	contentByPage := make(map[int]string, context.PageCount)
	for pageNumber := 1; pageNumber <= context.PageCount; pageNumber++ {
		contentReader, err := pdfcpu.ExtractPageContent(context, pageNumber)
		require.NoError(t, err)
		contentBytes, err := io.ReadAll(contentReader)
		require.NoError(t, err)
		contentByPage[pageNumber] = string(contentBytes)
	}

	return contentByPage
}

type observedPDFWork struct {
	mutations     int
	writes        int
	verifications int
	writeLimits   []model.ResourceLimits
	writeError    error
	verifyError   error
	writeOutput   []byte
}

func newObservedPDFWork() *observedPDFWork {
	return &observedPDFWork{}
}

func (work *observedPDFWork) clean(inputBytes []byte) ([]byte, error) {
	return cleanPDF(inputBytes, cleanPDFOperations{
		remove: func(context *model.Context, analysis *pdfAnalysis) {
			work.mutations++
			removeAnalyzedMetadata(context, analysis)
		},
		write: func(context *model.Context, writer io.Writer) error {
			work.writes++
			work.writeLimits = append(work.writeLimits, context.Conf.Limits)
			if work.writeError != nil {
				return work.writeError
			}
			if work.writeOutput != nil {
				_, err := writer.Write(work.writeOutput)
				return err
			}
			return api.WriteContext(context, writer)
		},
		verify: func(outputBytes []byte) error {
			work.verifications++
			if work.verifyError != nil {
				return work.verifyError
			}
			return verifyScrubbedPDF(outputBytes)
		},
	})
}

func structFieldNames(structType reflect.Type) []string {
	names := make([]string, structType.NumField())
	for index := range structType.NumField() {
		names[index] = structType.Field(index).Name
	}
	return names
}

func mergeInfoEntries(baseEntries, replacements map[string]string) map[string]string {
	mergedEntries := make(map[string]string, len(baseEntries)+len(replacements))
	for key, value := range baseEntries {
		mergedEntries[key] = value
	}
	for key, value := range replacements {
		mergedEntries[key] = value
	}
	return mergedEntries
}

func neutralTrioFieldNames() []string {
	return []string{"info.creation_date", "info.mod_date", "info.producer"}
}

func requireExpectedActions(t *testing.T, fields []Field) {
	t.Helper()

	for _, field := range fields {
		expectedAction := ActionRemove
		if strings.HasPrefix(field.Name, "info.") && field.Name != "info.custom.001" {
			expectedAction = ActionReplace
		}
		require.Equal(t, expectedAction, field.Action, field.Name)
	}
}

func signatureContext(apply func(*model.Context)) *model.Context {
	context := &model.Context{XRefTable: &model.XRefTable{}}
	apply(context)
	return context
}

func fieldNames(fields []Field) []string {
	names := make([]string, len(fields))
	for index, field := range fields {
		names[index] = field.Name
	}
	return names
}

func requireNoOriginalMarkers(t *testing.T, outputBytes []byte, markers ...string) {
	t.Helper()

	for _, marker := range markers {
		require.NotContains(t, string(outputBytes), marker)
	}
}

func requireValidUTF8Preview(t *testing.T, field Field) {
	t.Helper()

	require.True(t, utf8.ValidString(field.Preview), "invalid UTF-8 preview %q", field.Preview)
	require.LessOrEqual(t, len(field.Preview), maxFieldPreviewBytes)
}

func requireInspectionLimit[T any](t *testing.T, result []T, err error) {
	t.Helper()

	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, result)
}

func requireNoPDFWork(t *testing.T, work *observedPDFWork) {
	t.Helper()

	require.Zero(t, work.mutations)
	require.Zero(t, work.writes)
	require.Zero(t, work.verifications)
}

func requireSignedPDF(t *testing.T, fields []Field, outputBytes []byte, inspectErr error, scrubErr error) {
	t.Helper()

	require.ErrorIs(t, inspectErr, ErrSignedPDF)
	require.Nil(t, fields)
	require.ErrorIs(t, scrubErr, ErrSignedPDF)
	require.Nil(t, outputBytes)
}

func requireNotSignedPDF(t *testing.T, err error) {
	t.Helper()

	require.False(t, errors.Is(err, ErrSignedPDF), "unexpected signed-PDF classification: %v", err)
}
