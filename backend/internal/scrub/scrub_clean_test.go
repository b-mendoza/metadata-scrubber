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
	require.NoError(t, verifyScrubbedPDF(outputBytes))

	publicOutputFields, err := InspectPDF(outputBytes)
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

	publicFields, err := InspectPDF(inputBytes)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicFields))
	require.Equal(t, ActionReplace, publicFields[0].Action)
	require.Equal(t, ActionReplace, publicFields[1].Action)
	require.Equal(t, ActionReplace, publicFields[2].Action)

	require.NoError(t, verifyScrubbedPDF(inputBytes))

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)
	require.NoError(t, verifyScrubbedPDF(outputBytes))
}

func TestCleanPDFReturnsNilOutputWhenWriteFails(t *testing.T) {
	writeError := errors.New("synthetic write failure")
	pdfContext := newSinglePagePDFContext(t)
	info := types.Dict{"Title": types.StringLiteral("write failure")}
	infoReference, err := pdfContext.IndRefForNewObject(info)
	require.NoError(t, err)
	pdfContext.Info = infoReference
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	outputBytes, err := cleanPDF(inputBytes, func(_ *model.Context, writer io.Writer) error {
		_, writeErr := writer.Write(inputBytes[:len(inputBytes)/2])
		if writeErr != nil {
			return writeErr
		}
		return writeError
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

	testCases := []struct {
		name    string
		written []byte
	}{
		{name: "remaining metadata", written: inputBytes},
		{name: "malformed output", written: inputBytes[:len(inputBytes)/2]},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			outputBytes, err := cleanPDF(inputBytes, func(_ *model.Context, writer io.Writer) error {
				_, writeErr := writer.Write(testCase.written)
				return writeErr
			})

			require.Error(t, err)
			require.NotErrorIs(t, err, ErrMalformedPDF)
			require.Nil(t, outputBytes)
			if testCase.name == "remaining metadata" {
				require.ErrorContains(t, err, "PDF metadata remained after scrub")
			}
		})
	}
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

	inputs := [][]byte{cleanInput, metadataInput, signedInput}
	results := make([]concurrentPDFResult, len(inputs))
	start := make(chan struct{})
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(inputs))
	for index, input := range inputs {
		go runConcurrentPDFByteAPIs(input, &results[index], start, &waitGroup)
	}
	close(start)
	waitGroup.Wait()

	require.NoError(t, results[0].inspectErr)
	require.NotNil(t, results[0].fields)
	require.Empty(t, results[0].fields)
	require.NoError(t, results[0].cleanErr)
	require.Equal(t, cleanInput, results[0].output)
	require.NoError(t, verifyScrubbedPDF(results[0].output))

	require.NoError(t, results[1].inspectErr)
	require.Len(t, results[1].fields, 13)
	require.Contains(t, results[1].fields, Field{
		Name: "info.title", Label: "Title", Preview: metadataFixtureValues.title,
		OriginalByteSize: len(metadataFixtureValues.title), Action: ActionRemove,
	})
	require.NoError(t, results[1].cleanErr)
	require.NotEqual(t, metadataInput, results[1].output)
	require.NoError(t, verifyScrubbedPDF(results[1].output))

	require.ErrorIs(t, results[2].inspectErr, ErrSignedPDF)
	require.Nil(t, results[2].fields)
	require.ErrorIs(t, results[2].cleanErr, ErrSignedPDF)
	require.Nil(t, results[2].output)
}

func runConcurrentPDFByteAPIs(input []byte, result *concurrentPDFResult, start <-chan struct{}, waitGroup *sync.WaitGroup) {
	defer waitGroup.Done()
	<-start
	fields, inspectErr := InspectPDF(input)
	output, cleanErr := CleanPDF(input)
	*result = concurrentPDFResult{fields: fields, inspectErr: inspectErr, output: output, cleanErr: cleanErr}
}
