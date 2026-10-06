package scrub

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/stretchr/testify/require"
)

func TestCleanPDFRemovesEveryInspectedTargetAndVerifiesOutput(t *testing.T) {
	inputBytes := buildDeepMetadataPDFFixture(t)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)

	outputContext, err := api.ReadValidateAndOptimize(bytes.NewReader(outputBytes), boundedPDFConfiguration())
	require.NoError(t, err)
	require.Equal(t, 2, outputContext.PageCount)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)

	publicOutputFields, err := InspectPDF(outputBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicOutputFields))
	require.Equal(t, ActionReplace, publicOutputFields[0].Action)
	require.Equal(t, ActionReplace, publicOutputFields[1].Action)
	require.Equal(t, ActionReplace, publicOutputFields[2].Action)

	for _, marker := range []string{
		metadataFixtureValues.title,
		metadataFixtureValues.producer,
		metadataFixtureValues.customValue,
		"catalog-xmp-marker",
		"page-xmp-marker",
		"nested-xmp-marker",
	} {
		require.NotContains(t, string(outputBytes), marker)
	}
	contentByPage := make(map[int]string, outputContext.PageCount)
	for pageNumber := 1; pageNumber <= outputContext.PageCount; pageNumber++ {
		contentReader, err := pdfcpu.ExtractPageContent(outputContext, pageNumber)
		require.NoError(t, err)
		contentBytes, err := io.ReadAll(contentReader)
		require.NoError(t, err)
		contentByPage[pageNumber] = string(contentBytes)
	}
	require.Contains(t, contentByPage[1], "Synthetic readable content page one")
	require.Contains(t, contentByPage[2], "Synthetic readable content page two")
}

func TestCleanPDFReturnsCleanPDFWithoutRewriting(t *testing.T) {
	pdfContext := newSinglePagePDFContext(t)
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	fields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.Equal(t, inputBytes, outputBytes)
}

func TestCleanPDFRewritesPublicNeutralLookingTrio(t *testing.T) {
	pdfContext := newSinglePagePDFContext(t)
	info := types.Dict{
		"Producer":     types.StringLiteral("pdfcpu " + model.VersionStr),
		"CreationDate": types.StringLiteral("D:20260102030405+00'00'"),
		"ModDate":      types.StringLiteral("D:20260102030405+00'00'"),
	}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	publicFields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicFields))
	require.Equal(t, ActionReplace, publicFields[0].Action)
	require.Equal(t, ActionReplace, publicFields[1].Action)
	require.Equal(t, ActionReplace, publicFields[2].Action)

	verificationFields, err := InspectPDF(inputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)
	verificationFields, err = InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestCleanPDFReturnsNilOutputWhenWriteFails(t *testing.T) {
	writeError := errors.New("synthetic write failure")
	pdfContext := newSinglePagePDFContext(t)
	info := types.Dict{"Title": types.StringLiteral("write failure")}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write: func(_ *model.Context, writer io.Writer) error {
			_, writeErr := writer.Write([]byte("partial PDF output"))
			if writeErr != nil {
				return writeErr
			}
			return writeError
		},
		verify: verifyScrubbedPDF,
	})

	require.ErrorIs(t, err, writeError)
	require.Nil(t, outputBytes)
}

func TestCleanPDFReturnsNilOutputWhenPostWriteVerificationFails(t *testing.T) {
	pdfContext := newSinglePagePDFContext(t)
	info := types.Dict{"Title": types.StringLiteral("verification failure")}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: func(*model.Context, *pdfAnalysis) {},
		write:  api.WriteContext,
		verify: verifyScrubbedPDF,
	})

	require.ErrorContains(t, err, "PDF metadata remained after scrub")
	require.Nil(t, outputBytes)
}

func TestSignatureTypeInspectionReturnsMalformedValuesAsErrors(t *testing.T) {
	decodeError := errors.New("decode Type object")
	lazyType := types.NewLazyObjectStreamObject(
		&types.ObjectStreamDict{Content: []byte("Type")},
		0,
		-1,
		func(context.Context, string) (types.Object, error) { return nil, decodeError },
	)
	testCases := []struct {
		name       string
		context    *model.Context
		dictionary types.Dict
	}{
		{
			name: "dereference failure",
			context: &model.Context{XRefTable: &model.XRefTable{Table: map[int]*model.XRefTableEntry{
				99: model.NewXRefTableEntryGen0(lazyType),
			}}},
			dictionary: types.Dict{"Type": *types.NewIndirectRef(99, 0)},
		},
		{
			name:       "name decode failure",
			context:    &model.Context{XRefTable: &model.XRefTable{}},
			dictionary: types.Dict{"Type": types.Name("Sig#")},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := dictionaryHasSignatureType(testCase.context, testCase.dictionary)

			require.Error(t, err)
		})
	}
}

type concurrentPDFResult struct {
	fields     []Field
	inspectErr error
	output     []byte
	cleanErr   error
}

func TestPDFByteAPIsKeepConcurrentRequestsIsolated(t *testing.T) {
	cleanContext := newSinglePagePDFContext(t)
	cleanInput := writeTypedPDFFixture(t, cleanContext)
	metadataInput := buildDeepMetadataPDFFixture(t)

	signedContext := newSinglePagePDFContext(t)
	timestampReference, err := signedContext.IndRefForNewObject(types.Dict{"Type": types.Name("DocTimeStamp")})
	require.NoError(t, err)
	catalog, err := signedContext.Catalog()
	require.NoError(t, err)
	catalog.Insert("SyntheticTimestamp", *timestampReference)
	signedInput := writeTypedPDFFixture(t, signedContext)

	testCases := []struct {
		name          string
		input         []byte
		expectedError error
	}{
		{name: "clean", input: cleanInput},
		{name: "metadata rich", input: metadataInput},
		{name: "signed", input: signedInput, expectedError: ErrSignedPDF},
	}
	baselines := make([]concurrentPDFResult, len(testCases))
	for index, testCase := range testCases {
		baselines[index] = runPDFByteAPIs(testCase.input)
	}
	require.NoError(t, baselines[0].inspectErr)
	require.Empty(t, baselines[0].fields)
	require.NoError(t, baselines[0].cleanErr)
	require.Equal(t, cleanInput, baselines[0].output)
	require.NoError(t, baselines[1].inspectErr)
	require.NotEmpty(t, baselines[1].fields)
	require.NoError(t, baselines[1].cleanErr)
	require.ErrorIs(t, baselines[2].inspectErr, ErrSignedPDF)
	require.Nil(t, baselines[2].fields)
	require.ErrorIs(t, baselines[2].cleanErr, ErrSignedPDF)
	require.Nil(t, baselines[2].output)

	results := make([]concurrentPDFResult, len(testCases))
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(testCases))
	for index, testCase := range testCases {
		go runConcurrentPDFByteAPIs(testCase.input, &results[index], start, &waitGroup)
	}
	close(start)
	waitGroup.Wait()
	require.Equal(t, cleanInput, results[0].output)

	for index, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual := results[index]
			require.Equal(t, baselines[index].fields, actual.fields)
			if testCase.expectedError != nil {
				require.ErrorIs(t, actual.inspectErr, testCase.expectedError)
				require.Nil(t, actual.fields)
				require.ErrorIs(t, actual.cleanErr, testCase.expectedError)
				require.Nil(t, actual.output)
				return
			}
			require.NoError(t, actual.inspectErr)
			require.NoError(t, actual.cleanErr)
			verificationFields, err := InspectPDF(actual.output, PostWriteVerification)
			require.NoError(t, err)
			require.Empty(t, verificationFields)
		})
	}
}

func runConcurrentPDFByteAPIs(input []byte, result *concurrentPDFResult, start <-chan struct{}, waitGroup *sync.WaitGroup) {
	defer waitGroup.Done()
	<-start
	*result = runPDFByteAPIs(input)
}
