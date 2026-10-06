package scrub

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"

	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	DisableConfigDir()
	os.Exit(m.Run())
}

func TestInspectPDFRejectsMalformedCandidatesWithoutSignedClassification(t *testing.T) {
	testCases := []struct {
		name       string
		inputBytes []byte
	}{
		{name: "complete versioned header", inputBytes: []byte("%PDF-1.7\n")},
		{name: "not a pdf", inputBytes: []byte("not a pdf")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fields, inspectErr := InspectPDF(testCase.inputBytes)
			outputBytes, cleanErr := CleanPDF(testCase.inputBytes)

			require.ErrorIs(t, inspectErr, ErrMalformedPDF)
			require.Nil(t, fields)
			require.NotErrorIs(t, inspectErr, ErrSignedPDF)
			require.ErrorIs(t, cleanErr, ErrMalformedPDF)
			require.Nil(t, outputBytes)
			require.NotErrorIs(t, cleanErr, ErrSignedPDF)
		})
	}
}

func TestVerifyScrubbedPDFWireContractPreservesUnderlyingError(t *testing.T) {
	err := verifyScrubbedPDF([]byte("%PDF-1.7\n"))

	require.Error(t, err)
	require.NotErrorIs(t, err, ErrMalformedPDF)
}

func TestInspectPDFEnumeratesDeepMetadataDeterministically(t *testing.T) {
	pdfBytes := buildDeepMetadataPDFFixture(t)

	fields, err := InspectPDF(pdfBytes)
	require.NoError(t, err)

	expectedFields := []Field{
		{Name: "info.author", Label: "Author", Preview: metadataFixtureValues.author, OriginalByteSize: len(metadataFixtureValues.author), Action: ActionRemove},
		{Name: "info.creation_date", Label: "Creation date", Preview: metadataFixtureValues.creationDate, OriginalByteSize: len(metadataFixtureValues.creationDate), Action: ActionReplace},
		{Name: "info.custom.001", Label: "Custom document property 1", Preview: metadataFixtureValues.customValue, OriginalByteSize: len(metadataFixtureValues.customValue), Action: ActionRemove},
		{Name: "info.custom.002", Label: "Custom document property 2", Preview: "true", OriginalByteSize: len("true"), Action: ActionRemove},
		{Name: "info.custom.003", Label: "Custom document property 3", Preview: "SyntheticName", OriginalByteSize: len("SyntheticName"), Action: ActionRemove},
		{Name: "info.custom.004", Label: "Custom document property 4", Preview: "7", OriginalByteSize: len("7"), Action: ActionRemove},
		{Name: "info.mod_date", Label: "Modification date", Preview: metadataFixtureValues.modDate, OriginalByteSize: len(metadataFixtureValues.modDate), Action: ActionReplace},
		{Name: "info.producer", Label: "Producer", Preview: metadataFixtureValues.producer, OriginalByteSize: len(metadataFixtureValues.producer), Action: ActionReplace},
		{Name: "info.title", Label: "Title", Preview: metadataFixtureValues.title, OriginalByteSize: len(metadataFixtureValues.title), Action: ActionRemove},
		{Name: "metadata.catalog", Label: "Document metadata", Preview: metadataFixtureValues.catalogXMP, OriginalByteSize: len(metadataFixtureValues.catalogXMP), Action: ActionRemove},
		{Name: "metadata.object.000001.001", Label: "Embedded metadata 1", Preview: metadataFixtureValues.nestedXMP, OriginalByteSize: len(metadataFixtureValues.nestedXMP), Action: ActionRemove},
		{Name: "metadata.page.0001", Label: "Page 1 metadata", Preview: metadataFixtureValues.pageXMP, OriginalByteSize: len(metadataFixtureValues.pageXMP), Action: ActionRemove},
		{Name: "metadata.page.0002", Label: "Page 2 metadata", Preview: metadataFixtureValues.pageXMP, OriginalByteSize: len(metadataFixtureValues.pageXMP), Action: ActionRemove},
	}
	require.Equal(t, expectedFields, fields)
}

func TestInspectPDFReturnsBoundedDecodedPreviews(t *testing.T) {
	const escapedTitle = `back\slash (balanced) and lone ( parenthesis`
	testCases := []struct {
		name            string
		value           string
		expectedPreview string
	}{
		{name: "exact ceiling", value: strings.Repeat("b", maxFieldPreviewBytes), expectedPreview: strings.Repeat("b", maxFieldPreviewBytes)},
		{name: "above ceiling", value: strings.Repeat("c", maxFieldPreviewBytes+1), expectedPreview: strings.Repeat("c", maxFieldPreviewBytes)},
		{name: "multibyte rune crosses ceiling", value: strings.Repeat("d", maxFieldPreviewBytes-1) + "éZ", expectedPreview: strings.Repeat("d", maxFieldPreviewBytes-1)},
		{name: "backslash and parentheses", value: escapedTitle, expectedPreview: escapedTitle},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfContext := newSinglePagePDFContext(t)
			escapedValue, err := types.Escape(testCase.value)
			require.NoError(t, err)
			info := types.Dict{"Title": types.StringLiteral(*escapedValue)}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
			pdfBytes := writeTypedPDFFixture(t, pdfContext)

			fields, err := InspectPDF(pdfBytes)

			require.NoError(t, err)
			require.Len(t, fields, 1)
			require.Equal(t, testCase.expectedPreview, fields[0].Preview)
			require.Equal(t, len(testCase.value), fields[0].OriginalByteSize)
			require.True(t, utf8.ValidString(fields[0].Preview), "invalid UTF-8 preview %q", fields[0].Preview)
			require.LessOrEqual(t, len(fields[0].Preview), maxFieldPreviewBytes)
		})
	}
}

func TestInspectPDFPreservesSharedCompressedMetadataReferences(t *testing.T) {
	metadata := `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="shared-compressed-metadata"/></rdf:RDF></x:xmpmeta>`
	pdfContext := newSinglePagePDFContext(t)
	metadataStream, err := pdfContext.NewStreamDictForBuf([]byte(metadata))
	require.NoError(t, err)
	metadataStream.InsertName("Type", "Metadata")
	metadataStream.InsertName("Subtype", "XML")
	require.NoError(t, metadataStream.Encode())
	metadataReference, err := pdfContext.IndRefForNewObject(*metadataStream)
	require.NoError(t, err)

	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Insert("Metadata", *metadataReference)
	page, _, _, err := pdfContext.PageDict(1, false)
	require.NoError(t, err)
	page.Insert("Metadata", *metadataReference)
	inputBytes := writeTypedPDFFixture(t, pdfContext)

	fields, err := InspectPDF(inputBytes)
	require.NoError(t, err)
	require.Equal(t, []string{"metadata.catalog", "metadata.page.0001"}, fieldNames(fields))

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotNil(t, outputBytes)
	require.NoError(t, verifyScrubbedPDF(outputBytes))
}

func TestVerifyScrubbedPDFRejectsEveryNeutralTrioNearMiss(t *testing.T) {
	neutralEntries := types.Dict{
		"Producer":     types.StringLiteral("pdfcpu " + model.VersionStr),
		"CreationDate": types.StringLiteral("D:20260102030405+00'00'"),
		"ModDate":      types.StringLiteral("D:20260102030405+00'00'"),
	}
	testCases := []struct {
		name            string
		entries         types.Dict
		catalogMetadata *types.StreamDict
	}{
		{
			name:    "partial trio",
			entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"]},
		},
		{
			name:    "mismatched dates",
			entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"], "ModDate": types.StringLiteral("D:20260102030406+00'00'")},
		},
		{
			name:    "invalid dates",
			entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": types.StringLiteral("invalid"), "ModDate": types.StringLiteral("invalid")},
		},
		{
			name:    "different producer",
			entries: types.Dict{"Producer": types.StringLiteral("another producer"), "CreationDate": neutralEntries["CreationDate"], "ModDate": neutralEntries["ModDate"]},
		},
		{
			name:    "catalog metadata",
			entries: neutralEntries,
			catalogMetadata: &types.StreamDict{
				Dict:    types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")},
				Content: []byte(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="near-miss-metadata"/></rdf:RDF></x:xmpmeta>`),
			},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfContext := newSinglePagePDFContext(t)
			infoReference, err := pdfContext.IndRefForNewObject(testCase.entries)
			require.NoError(t, err)
			pdfContext.Info = infoReference
			if testCase.catalogMetadata != nil {
				require.NoError(t, testCase.catalogMetadata.Encode())
				metadataReference, metadataErr := pdfContext.IndRefForNewObject(*testCase.catalogMetadata)
				require.NoError(t, metadataErr)
				catalog, catalogErr := pdfContext.Catalog()
				require.NoError(t, catalogErr)
				catalog.Insert("Metadata", *metadataReference)
			}
			pdfBytes := writeTypedPDFFixture(t, pdfContext)

			err = verifyScrubbedPDF(pdfBytes)

			require.ErrorContains(t, err, "PDF metadata remained after scrub")
		})
	}
}

func TestPDFPathsRejectUndecodableMetadataAtomically(t *testing.T) {
	infoContext := newSinglePagePDFContext(t)
	info := types.Dict{"Custom": types.Array{types.Integer(1), types.Integer(2)}}
	infoReference, err := infoContext.IndRefForNewObject(info)
	require.NoError(t, err)
	infoContext.Info = infoReference
	unsupportedInfoPDF := writeTypedPDFFixture(t, infoContext)

	metadataContext := newSinglePagePDFContext(t)
	stream := types.StreamDict{Dict: types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")}, Content: []byte{0xff, 0xfe}}
	require.NoError(t, stream.Encode())
	streamReference, err := metadataContext.IndRefForNewObject(stream)
	require.NoError(t, err)
	catalog, err := metadataContext.Catalog()
	require.NoError(t, err)
	catalog.Insert("Metadata", *streamReference)
	nonUTF8MetadataPDF := writeTypedPDFFixture(t, metadataContext)

	testCases := []struct {
		name     string
		pdfBytes []byte
	}{
		{name: "unsupported Info value", pdfBytes: unsupportedInfoPDF},
		{name: "non UTF-8 metadata stream", pdfBytes: nonUTF8MetadataPDF},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fields, inspectErr := InspectPDF(testCase.pdfBytes)
			outputBytes, scrubErr := CleanPDF(testCase.pdfBytes)

			require.Error(t, inspectErr)
			require.Nil(t, fields)
			require.Error(t, scrubErr)
			require.Nil(t, outputBytes)
		})
	}
}

func TestSignedPDFWireContractsReturnErrSignedPDFAndNilOutput(t *testing.T) {
	testCases := []struct {
		name    string
		objects map[int]string
	}{
		{name: "signature dictionary", objects: map[int]string{6: "<< /Type /Sig >>"}},
		{name: "signature flag", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 1 >> >>",
			5: "<< /Subtype /Widget /FT /Sig /Rect [0 0 0 0] >>",
		}},
		{name: "append only flag", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 2 >> >>",
			5: "<< /Subtype /Widget /FT /Sig /Rect [0 0 0 0] >>",
		}},
		{name: "document timestamp dictionary", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /SyntheticTimestamp 5 0 R >>",
			5: "<< /Type /DocTimeStamp /Filter /Adobe.PPKLite >>",
		}},
		{name: "certification permission", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /Perms << /DocMDP 5 0 R >> >>",
			5: "<< /Filter /Adobe.PPKLite >>",
		}},
		{name: "usage rights permission", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /Perms << /UR3 5 0 R >> >>",
			5: "<< /Filter /Adobe.PPKLite >>",
		}},
		{name: "cached signed form state", objects: map[int]string{
			1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] >> >>",
			3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>",
			5: "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /V 6 0 R /P 3 0 R >>",
			6: "<< /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <> >>",
		}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			objects := map[int]string{
				1: "<< /Type /Catalog /Pages 2 0 R >>",
				2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
				3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
				4: streamObject("BT 20 100 Td (Signed synthetic page) Tj ET"),
			}
			maps.Copy(objects, testCase.objects)
			pdfBytes := buildPDF(t, pdfFixture{objects: objects, rootObjectNumber: 1})

			fields, inspectErr := InspectPDF(pdfBytes)
			outputBytes, scrubErr := CleanPDF(pdfBytes)

			require.ErrorIs(t, inspectErr, ErrSignedPDF)
			require.Nil(t, fields)
			require.ErrorIs(t, scrubErr, ErrSignedPDF)
			require.Nil(t, outputBytes)
		})
	}
}

func TestUnsignedSignatureLikeWireContractIsAccepted(t *testing.T) {
	pdfBytes := buildPDF(t, pdfFixture{
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

	fields, err := InspectPDF(pdfBytes)

	require.NotErrorIs(t, err, ErrSignedPDF, "unexpected signed-PDF classification: %v", err)
	require.NoError(t, err)
	require.NotEmpty(t, fields)
}

func TestPreflightMetadataEntryRejectsCachedContentOutsideBudget(t *testing.T) {
	testCases := []struct {
		name      string
		content   []byte
		remaining int64
	}{
		{name: "empty cache with no budget", content: []byte{}, remaining: 0},
		{name: "cache above budget", content: []byte("xx"), remaining: 1},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			stream := types.StreamDict{Dict: types.NewDict(), Content: testCase.content}
			for _, object := range []types.Object{stream, *types.NewIndirectRef(1, 0)} {
				pdfContext := &model.Context{XRefTable: &model.XRefTable{Table: map[int]*model.XRefTableEntry{
					1: model.NewXRefTableEntryGen0(stream),
				}}}
				dictionary := types.Dict{"Metadata": object}
				snapshot := metadataEntrySnapshot{dictionary: dictionary, key: "Metadata", value: object}
				decodedReferences := make(map[types.IndirectRef]struct{})

				decodedBytes, err := preflightMetadataEntry(pdfContext, snapshot, testCase.remaining, decodedReferences)

				require.ErrorIs(t, err, ErrInspectionLimit)
				require.Zero(t, decodedBytes)
				require.Empty(t, decodedReferences)
				require.Equal(t, object, dictionary["Metadata"])
				require.Equal(t, stream, pdfContext.Table[1].Object)
			}
		})
	}
}

var metadataFixtureValues = struct {
	title        string
	author       string
	producer     string
	creationDate string
	modDate      string
	customValue  string
	catalogXMP   string
	pageXMP      string
	nestedXMP    string
}{
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

type pdfFixture struct {
	objects          map[int]string
	rootObjectNumber int
	infoObjectNumber int
}

func newSinglePagePDFContext(t *testing.T) *model.Context {
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
	_, err = page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
	require.NoError(t, err)
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	return pdfContext
}

func buildDeepMetadataPDFFixture(t *testing.T) []byte {
	t.Helper()

	pdfContext := newSinglePagePDFContext(t)
	infoReference, err := pdfContext.IndRefForNewObject(types.Dict{
		"Title":        types.StringLiteral(metadataFixtureValues.title),
		"Author":       types.HexLiteral(hex.EncodeToString([]byte(metadataFixtureValues.author))),
		"Producer":     types.StringLiteral(metadataFixtureValues.producer),
		"CreationDate": types.StringLiteral(metadataFixtureValues.creationDate),
		"ModDate":      types.StringLiteral(metadataFixtureValues.modDate),
		"Custom Key":   types.StringLiteral(metadataFixtureValues.customValue),
		"Flag":         types.Boolean(true),
		"Mode":         types.Name("SyntheticName"),
		"Rank":         types.Integer(7),
	})
	require.NoError(t, err)
	pdfContext.Info = infoReference

	metadataReference := func(content string) types.IndirectRef {
		stream := types.StreamDict{Dict: types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")}, Content: []byte(content)}
		require.NoError(t, stream.Encode())
		reference, referenceErr := pdfContext.IndRefForNewObject(stream)
		require.NoError(t, referenceErr)
		return *reference
	}
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Insert("Metadata", metadataReference(metadataFixtureValues.catalogXMP))
	catalog.Insert("Synthetic", types.Dict{"Metadata": metadataReference(metadataFixtureValues.nestedXMP)})
	page, _, _, err := pdfContext.PageDict(1, false)
	require.NoError(t, err)
	pageMetadataReference := metadataReference(metadataFixtureValues.pageXMP)
	page.Insert("Metadata", pageMetadataReference)

	pagesReference, err := pdfContext.Pages()
	require.NoError(t, err)
	pages, err := pdfContext.DereferenceDict(*pagesReference)
	require.NoError(t, err)
	secondPageContent, err := pdfContext.NewStreamDictForBuf([]byte("BT 20 100 Td (Synthetic readable content page two) Tj ET"))
	require.NoError(t, err)
	require.NoError(t, secondPageContent.Encode())
	secondPageContentReference, err := pdfContext.IndRefForNewObject(*secondPageContent)
	require.NoError(t, err)
	secondPage := types.Dict{
		"Type":      types.Name("Page"),
		"Parent":    *pagesReference,
		"MediaBox":  types.RectForFormat("A4").Array(),
		"Resources": types.Dict{},
		"Contents":  *secondPageContentReference,
		"Metadata":  pageMetadataReference,
	}
	secondPageReference, err := pdfContext.IndRefForNewObject(secondPage)
	require.NoError(t, err)
	require.NoError(t, model.AppendPageTree(secondPageReference, 1, pages))
	pdfContext.PageCount = 2

	firstPageContent, err := pdfContext.NewStreamDictForBuf([]byte("BT 20 100 Td (Synthetic readable content page one) Tj ET"))
	require.NoError(t, err)
	require.NoError(t, firstPageContent.Encode())
	firstPageContentReference, err := pdfContext.IndRefForNewObject(*firstPageContent)
	require.NoError(t, err)
	page.Update("Contents", *firstPageContentReference)
	return writeTypedPDFFixture(t, pdfContext)
}

func writeTypedPDFFixture(t *testing.T, pdfContext *model.Context) []byte {
	t.Helper()

	objects := make(map[int]string)
	for objectNumber, entry := range pdfContext.Table {
		if entry == nil || entry.Free || entry.Object == nil {
			continue
		}
		switch object := entry.Object.(type) {
		case types.StreamDict:
			objects[objectNumber] = fmt.Sprintf("%s\nstream\n%s\nendstream", object.PDFString(), object.Raw)
		default:
			objects[objectNumber] = object.PDFString()
		}
	}
	fixture := pdfFixture{objects: objects, rootObjectNumber: int(pdfContext.Root.ObjectNumber)}
	if pdfContext.Info != nil {
		fixture.infoObjectNumber = int(pdfContext.Info.ObjectNumber)
	}
	return buildPDF(t, fixture)
}

func buildPDF(t *testing.T, fixture pdfFixture) []byte {
	t.Helper()

	objectNumbers := slices.Sorted(maps.Keys(fixture.objects))
	maxObjectNumber := 0
	if len(objectNumbers) > 0 {
		maxObjectNumber = objectNumbers[len(objectNumbers)-1]
	}

	var pdf bytes.Buffer
	_, err := pdf.WriteString("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")
	require.NoError(t, err)

	offsets := make(map[int]int, len(objectNumbers))
	for _, objectNumber := range objectNumbers {
		offsets[objectNumber] = pdf.Len()
		_, err = fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", objectNumber, fixture.objects[objectNumber])
		require.NoError(t, err)
	}

	xrefOffset := pdf.Len()
	_, err = fmt.Fprintf(&pdf, "xref\n0 %d\n", maxObjectNumber+1)
	require.NoError(t, err)
	_, err = pdf.WriteString("0000000000 65535 f \n")
	require.NoError(t, err)
	for objectNumber := 1; objectNumber <= maxObjectNumber; objectNumber++ {
		offset, exists := offsets[objectNumber]
		if !exists {
			_, err = pdf.WriteString("0000000000 00000 f \n")
			require.NoError(t, err)
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

func fieldNames(fields []Field) []string {
	names := make([]string, len(fields))
	for index, field := range fields {
		names[index] = field.Name
	}
	return names
}
