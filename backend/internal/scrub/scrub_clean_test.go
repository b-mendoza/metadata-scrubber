package scrub

import (
	"bytes"
	"context"
	"errors"
	"io"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/stretchr/testify/require"
)

func TestCleanPDFRejectsInvalidPDFWithNoOutput(t *testing.T) {
	outputBytes, err := CleanPDF([]byte("not a pdf"))

	require.ErrorIs(t, err, ErrMalformedPDF)
	require.Nil(t, outputBytes)
}

func TestCleanPDFRemovesEveryInspectedTargetAndVerifiesOutput(t *testing.T) {
	metadata := metadataFixtureValues{
		title:        "Synthetic title",
		author:       "Synthetic author",
		producer:     "Synthetic producer",
		creationDate: "D:20260102030405+00'00'",
		modDate:      "D:20260203040506+00'00'",
		customValue:  "Synthetic custom value",
		catalogXMP:   `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="catalog-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
		pageXMP:      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="page-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
		nestedXMP:    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="nested-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
	}

	inputBytes := buildDeepMetadataPDFFixture(t, metadata)
	inputContext, err := api.ReadValidateAndOptimize(bytes.NewReader(inputBytes), boundedPDFConfiguration())
	require.NoError(t, err)
	require.Equal(t, 2, inputContext.PageCount)

	inputFields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Len(t, inputFields, 13)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)

	outputContext, err := api.ReadValidateAndOptimize(bytes.NewReader(outputBytes), boundedPDFConfiguration())
	require.NoError(t, err)
	require.Equal(t, inputContext.PageCount, outputContext.PageCount)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)

	publicOutputFields, err := InspectPDF(outputBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicOutputFields))
	requireExpectedActions(t, publicOutputFields)

	for _, marker := range []string{
		metadata.title,
		metadata.author,
		metadata.producer,
		metadata.customValue,
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
	var inputBytes []byte
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
		inputBytes = output.Bytes()
	}

	fields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.Equal(t, inputBytes, outputBytes)
}

func TestCleanPDFRewritesPublicNeutralLookingTrio(t *testing.T) {
	var inputBytes []byte
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
			info := types.Dict{
				"Producer":     types.StringLiteral("pdfcpu " + model.VersionStr),
				"CreationDate": types.StringLiteral("D:20260102030405+00'00'"),
				"ModDate":      types.StringLiteral("D:20260102030405+00'00'"),
			}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}

	outputBytes, err := CleanPDF(inputBytes)

	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestCleanPDFReturnsNilOutputWhenWriteFails(t *testing.T) {
	writeError := errors.New("synthetic write failure")
	var inputBytes []byte
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
			info := types.Dict{"Title": types.StringLiteral("write failure")}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}
	verificationCalled := false

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write:  func(*model.Context, io.Writer) error { return writeError },
		verify: func([]byte) error {
			verificationCalled = true
			return nil
		},
	})

	require.ErrorIs(t, err, writeError)
	require.Nil(t, outputBytes)
	require.False(t, verificationCalled)
}

func TestCleanPDFReturnsNilOutputWhenPostWriteVerificationFails(t *testing.T) {
	verificationError := errors.New("synthetic verification failure")
	var inputBytes []byte
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
			info := types.Dict{"Title": types.StringLiteral("verification failure")}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write:  api.WriteContext,
		verify: func([]byte) error { return verificationError },
	})

	require.ErrorIs(t, err, verificationError)
	require.Nil(t, outputBytes)
}

func TestCleanPDFUsesBoundedConfigurationForPostWriteVerification(t *testing.T) {
	var inputBytes []byte
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
			info := types.Dict{"Title": types.StringLiteral("verify me")}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}
	oversizedOutput := buildUncompressedPageContentPDFFixture(t, bytes.Repeat([]byte("x"), int(maxPDFStreamBytes)+1))

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write: func(_ *model.Context, writer io.Writer) error {
			_, writeErr := writer.Write(oversizedOutput)
			return writeErr
		},
		verify: verifyScrubbedPDF,
	})

	require.Error(t, err)
	require.Nil(t, outputBytes)
}

func TestCleanPDFRejectsSignedPDFBeforeMutationOrWriting(t *testing.T) {
	testCases := []struct {
		name  string
		build func(*testing.T) []byte
	}{
		{name: "signature dictionary", build: buildSignedDictionaryPDFFixture},
		{name: "document timestamp dictionary", build: buildDocumentTimestampPDFFixture},
		{name: "certification permission", build: buildCertificationPermissionPDFFixture},
		{name: "usage rights permission", build: buildUsageRightsPermissionPDFFixture},
		{name: "cached signed form state", build: buildCachedSignedFormPDFFixture},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := testCase.build(t)
			mutationCalled := false
			writeCalled := false
			verificationCalled := false

			outputBytes, err := cleanPDF(pdfBytes, cleanPDFOperations{
				remove: func(*model.Context, *pdfAnalysis) { mutationCalled = true },
				write: func(*model.Context, io.Writer) error {
					writeCalled = true
					return nil
				},
				verify: func([]byte) error {
					verificationCalled = true
					return nil
				},
			})

			require.ErrorIs(t, err, ErrSignedPDF)
			require.Nil(t, outputBytes)
			require.False(t, mutationCalled)
			require.False(t, writeCalled)
			require.False(t, verificationCalled)
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
		expected   string
	}{
		{
			name: "dereference failure",
			context: &model.Context{XRefTable: &model.XRefTable{Table: map[int]*model.XRefTableEntry{
				99: model.NewXRefTableEntryGen0(lazyType),
			}}},
			dictionary: types.Dict{"Type": *types.NewIndirectRef(99, 0)},
			expected:   "dereference PDF dictionary Type",
		},
		{
			name:       "name decode failure",
			context:    &model.Context{XRefTable: &model.XRefTable{}},
			dictionary: types.Dict{"Type": types.Name("Sig#")},
			expected:   "decode PDF dictionary Type",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			hasSignatureType, err := dictionaryHasSignatureType(testCase.context, testCase.dictionary)

			require.ErrorContains(t, err, testCase.expected)
			require.False(t, hasSignatureType)
		})
	}
}

func TestCachedSignatureVariantsAreClassifiedAsSigned(t *testing.T) {
	testCases := []struct {
		name    string
		context *model.Context
	}{
		{name: "signature flag", context: &model.Context{XRefTable: &model.XRefTable{SignatureExist: true}}},
		{name: "append only flag", context: &model.Context{XRefTable: &model.XRefTable{AppendOnly: true}}},
		{name: "usage rights dictionary", context: &model.Context{XRefTable: &model.XRefTable{URSignature: types.Dict{"Filter": types.Name("Synthetic")}}}},
		{name: "certified signature object", context: &model.Context{XRefTable: &model.XRefTable{CertifiedSigObjNr: 9}}},
		{name: "trusted document timestamp", context: &model.Context{XRefTable: &model.XRefTable{DTS: time.Unix(1, 0)}}},
		{name: "signed cached signature", context: &model.Context{XRefTable: &model.XRefTable{Signatures: map[int]map[int]model.Signature{0: {9: {Signed: true}}}}}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.True(t, pdfHasCachedSignature(testCase.context))
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
	var cleanInput []byte
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
		cleanInput = output.Bytes()
	}
	concurrentMetadata := metadataFixtureValues{
		title:        "Synthetic title",
		author:       "Synthetic author",
		producer:     "Synthetic producer",
		creationDate: "D:20260102030405+00'00'",
		modDate:      "D:20260203040506+00'00'",
		customValue:  "Synthetic custom value",
		catalogXMP:   `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="catalog-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
		pageXMP:      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="page-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
		nestedXMP:    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="nested-xmp-marker"/></rdf:RDF></x:xmpmeta>`,
	}

	metadataInput := buildDeepMetadataPDFFixture(t, concurrentMetadata)
	signedDictionaryInput := buildSignedDictionaryPDFFixture(t)
	documentTimestampInput := buildDocumentTimestampPDFFixture(t)
	certificationPermissionInput := buildCertificationPermissionPDFFixture(t)
	usageRightsPermissionInput := buildUsageRightsPermissionPDFFixture(t)
	cachedSignedFormInput := buildCachedSignedFormPDFFixture(t)
	overLimitInput := slices.Concat(cleanInput, bytes.Repeat([]byte{' '}, MaxInputBytes-len(cleanInput)+1))

	testCases := []struct {
		name         string
		input        []byte
		inspectError error
		cleanError   error
	}{
		{name: "clean", input: cleanInput},
		{name: "metadata rich", input: metadataInput},
		{name: "signature dictionary", input: signedDictionaryInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "document timestamp dictionary", input: documentTimestampInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "certification permission", input: certificationPermissionInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "usage rights permission", input: usageRightsPermissionInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "cached signed form state", input: cachedSignedFormInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "over limit", input: overLimitInput, inspectError: ErrInputTooLarge, cleanError: ErrInputTooLarge},
	}
	baselines := make([]concurrentPDFResult, len(testCases))
	for index, testCase := range testCases {
		baselines[index] = runPDFByteAPIs(testCase.input)
	}

	results := make([]concurrentPDFResult, len(testCases))
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(testCases))
	for index, testCase := range testCases {
		go runConcurrentPDFByteAPIs(testCase.input, index, results, &waitGroup)
	}
	waitGroup.Wait()

	for index, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			requireConcurrentPDFResult(t, baselines[index], results[index], testCase)
		})
	}
}

func runConcurrentPDFByteAPIs(input []byte, index int, results []concurrentPDFResult, waitGroup *sync.WaitGroup) {
	defer waitGroup.Done()
	results[index] = runPDFByteAPIs(input)
}

func requireConcurrentPDFResult(t *testing.T, baseline concurrentPDFResult, actual concurrentPDFResult, testCase struct {
	name         string
	input        []byte
	inspectError error
	cleanError   error
},
) {
	t.Helper()

	require.Equal(t, baseline.fields, actual.fields)
	if testCase.cleanError != nil || len(baseline.fields) == 0 {
		require.Equal(t, baseline.output, actual.output)
	}
	require.Equal(t, baseline.inspectErr == nil, actual.inspectErr == nil)
	require.Equal(t, baseline.cleanErr == nil, actual.cleanErr == nil)
	if testCase.inspectError != nil {
		require.ErrorIs(t, actual.inspectErr, testCase.inspectError)
		require.Nil(t, actual.fields)
	} else {
		require.NoError(t, actual.inspectErr)
	}
	if testCase.cleanError != nil {
		require.ErrorIs(t, actual.cleanErr, testCase.cleanError)
		require.Nil(t, actual.output)
		return
	}
	require.NoError(t, actual.cleanErr)
	verificationFields, err := InspectPDF(actual.output, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func buildSignedDictionaryPDFFixture(t *testing.T) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	_, err = page.Buf.WriteString("BT 20 100 Td (Signed synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	signature := types.Dict{
		"Type":      types.Name("Sig"),
		"Filter":    types.Name("Adobe.PPKLite"),
		"SubFilter": types.Name("adbe.pkcs7.detached"),
		"ByteRange": types.Array{types.Integer(0), types.Integer(0), types.Integer(0), types.Integer(0)},
		"Contents":  types.HexLiteral(""),
		"M":         types.StringLiteral("D:20260102030405+00'00'"),
	}
	signatureReference, err := pdfContext.IndRefForNewObject(signature)
	require.NoError(t, err)
	pageDictionary, _, _, err := pdfContext.PageDict(1, false)
	require.NoError(t, err)
	pageReference, err := pdfContext.PageDictIndRef(1)
	require.NoError(t, err)
	field := types.Dict{
		"Type":    types.Name("Annot"),
		"Subtype": types.Name("Widget"),
		"FT":      types.Name("Sig"),
		"T":       types.StringLiteral("Signature1"),
		"Rect":    types.Array{types.Integer(0), types.Integer(0), types.Integer(0), types.Integer(0)},
		"V":       *signatureReference,
		"P":       *pageReference,
	}
	fieldReference, err := pdfContext.IndRefForNewObject(field)
	require.NoError(t, err)
	pageDictionary.Insert("Annots", types.Array{*fieldReference})
	catalog.Insert("AcroForm", types.Dict{
		"Fields":   types.Array{*fieldReference},
		"SigFlags": types.Integer(3),
	})
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildDocumentTimestampPDFFixture(t *testing.T) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	_, err = page.Buf.WriteString("BT 20 100 Td (Signed synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	timestamp := types.Dict{
		"Type":   types.Name("DocTimeStamp"),
		"Filter": types.Name("Adobe.PPKLite"),
	}
	timestampReference, err := pdfContext.IndRefForNewObject(timestamp)
	require.NoError(t, err)
	catalog.Insert("SyntheticTimestamp", *timestampReference)
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildCertificationPermissionPDFFixture(t *testing.T) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	_, err = page.Buf.WriteString("BT 20 100 Td (Signed synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	signature := types.Dict{"Filter": types.Name("Adobe.PPKLite")}
	signatureReference, err := pdfContext.IndRefForNewObject(signature)
	require.NoError(t, err)
	catalog.Insert("Perms", types.Dict{"DocMDP": *signatureReference})
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildUsageRightsPermissionPDFFixture(t *testing.T) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	_, err = page.Buf.WriteString("BT 20 100 Td (Signed synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	signature := types.Dict{"Filter": types.Name("Adobe.PPKLite")}
	signatureReference, err := pdfContext.IndRefForNewObject(signature)
	require.NoError(t, err)
	catalog.Insert("Perms", types.Dict{"UR3": *signatureReference})
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildCachedSignedFormPDFFixture(t *testing.T) []byte {
	t.Helper()

	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	_, err = page.Buf.WriteString("BT 20 100 Td (Signed synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	signature := types.Dict{
		"Filter":    types.Name("Adobe.PPKLite"),
		"SubFilter": types.Name("adbe.pkcs7.detached"),
		"ByteRange": types.Array{types.Integer(0), types.Integer(0), types.Integer(0), types.Integer(0)},
		"Contents":  types.HexLiteral(""),
	}
	signatureReference, err := pdfContext.IndRefForNewObject(signature)
	require.NoError(t, err)
	pageDictionary, _, _, err := pdfContext.PageDict(1, false)
	require.NoError(t, err)
	pageReference, err := pdfContext.PageDictIndRef(1)
	require.NoError(t, err)
	field := types.Dict{
		"Type":    types.Name("Annot"),
		"Subtype": types.Name("Widget"),
		"FT":      types.Name("Sig"),
		"T":       types.StringLiteral("Signature1"),
		"Rect":    types.Array{types.Integer(0), types.Integer(0), types.Integer(0), types.Integer(0)},
		"V":       *signatureReference,
		"P":       *pageReference,
	}
	fieldReference, err := pdfContext.IndRefForNewObject(field)
	require.NoError(t, err)
	pageDictionary.Insert("Annots", types.Array{*fieldReference})
	catalog.Insert("AcroForm", types.Dict{"Fields": types.Array{*fieldReference}})
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildUncompressedPageContentPDFFixture(t *testing.T, content []byte) []byte {
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
		page, _, _, err := pdfContext.PageDict(1, false)
		require.NoError(t, err)
		stream, err := pdfContext.NewStreamDictForBuf(content)
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
	return output.Bytes()
}
