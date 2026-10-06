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

	"metadata-scrubber/internal/sniff"
)

func TestMain(m *testing.M) {
	DisableConfigDir()
	os.Exit(m.Run())
}

func TestInspectPDFRequiresKnownOrigin(t *testing.T) {
	configuration := model.NewDefaultConfiguration()
	configuration.WriteObjectStream = false
	configuration.WriteXRefStream = false
	pdfContext, err := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
	require.NoError(t, err)
	catalog, err := pdfContext.Catalog()
	require.NoError(t, err)
	catalog.Delete("Pages")
	page := model.NewPage(types.RectForFormat("A4"), nil)
	page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
	require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, catalog, page))
	pdfContext.PageCount = 1
	var input bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &input)

	fields, err := InspectPDF(input.Bytes(), InspectionOrigin("unknown"))

	require.Error(t, err)
	require.Nil(t, fields)
}

func TestInspectPDFRejectsMalformedCandidatesWithoutSignedClassification(t *testing.T) {
	testCases := []struct {
		name       string
		inputBytes []byte
	}{
		{name: "bare candidate prefix", inputBytes: []byte("%PDF-")},
		{name: "complete versioned header", inputBytes: []byte("%PDF-1.7\n")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.True(t, sniff.IsPDFCandidate(testCase.inputBytes))

			fields, err := InspectPDF(testCase.inputBytes, PublicInput)

			require.ErrorIs(t, err, ErrMalformedPDF)
			require.Nil(t, fields)
			require.NotErrorIs(t, err, ErrSignedPDF, "unexpected signed-PDF classification: %v", err)
		})
	}
}

func TestInspectPDFPreservesUnderlyingErrorsForPostWriteVerification(t *testing.T) {
	fields, err := InspectPDF([]byte("%PDF-1.7\n"), PostWriteVerification)

	require.Error(t, err)
	require.NotErrorIs(t, err, ErrMalformedPDF)
	require.Nil(t, fields)
}

func TestInspectPDFAcceptsValidPDFWithLeadingBytes(t *testing.T) {
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
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		pdfBytes = output.Bytes()
	}
	inputBytes := append([]byte("leading bytes\n"), pdfBytes...)
	require.False(t, sniff.IsPDFCandidate(inputBytes))

	fields, err := InspectPDF(inputBytes, PublicInput)

	require.NoError(t, err)
	require.NotNil(t, fields)
	require.Empty(t, fields)
}

func TestInspectPDFEnumeratesDeepMetadataDeterministically(t *testing.T) {
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

	pdfBytes := buildDeepMetadataPDFFixture(t, metadata)

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
					info := types.Dict{"Title": types.StringLiteral(testCase.value)}
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
			require.Len(t, fields, 1)
			require.Equal(t, testCase.expectedPreview, fields[0].Preview)
			require.Equal(t, len(testCase.value), fields[0].OriginalByteSize)
			require.True(t, utf8.ValidString(fields[0].Preview), "invalid UTF-8 preview %q", fields[0].Preview)
			require.LessOrEqual(t, len(fields[0].Preview), maxFieldPreviewBytes)

			repeatedFields, err := InspectPDF(pdfBytes, PublicInput)
			require.NoError(t, err)
			require.Equal(t, fields, repeatedFields)
		})
	}
}

func TestInspectPDFPreservesBackslashAndParenthesisCharacters(t *testing.T) {
	const title = `back\slash (balanced) and lone ( parenthesis`
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
			escapedTitle, err := types.Escape(title)
			require.NoError(t, err)
			info := types.Dict{"Title": types.StringLiteral(*escapedTitle)}
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
	require.Len(t, fields, 1)
	require.Equal(t, title, fields[0].Preview)
	require.Equal(t, len(title), fields[0].OriginalByteSize)
}

func TestInspectPDFPreservesSharedCompressedMetadataReferences(t *testing.T) {
	metadata := `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="shared-compressed-metadata"/></rdf:RDF></x:xmpmeta>`
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
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		inputBytes = output.Bytes()
	}

	fields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"metadata.catalog", "metadata.page.0001"}, fieldNames(fields))

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.NotNil(t, outputBytes)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestInspectPDFTreatsNeutralTrioAccordingToOrigin(t *testing.T) {
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
		pdfBytes = output.Bytes()
	}

	publicFields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicFields))
	requireExpectedActions(t, publicFields)

	verificationFields, err := InspectPDF(pdfBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

// The typed fixture stays local so each case serializes its exact PDF contract.
func TestInspectPDFKeepsEveryNeutralTrioNearMissVisible(t *testing.T) {
	neutralEntries := types.Dict{
		"Producer":     types.StringLiteral("pdfcpu " + model.VersionStr),
		"CreationDate": types.StringLiteral("D:20260102030405+00'00'"),
		"ModDate":      types.StringLiteral("D:20260102030405+00'00'"),
	}
	testCases := []struct {
		name          string
		entries       types.Dict
		metadata      metadataLocation
		expectedNames []string
	}{
		{name: "partial trio", entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"]}, expectedNames: []string{"info.creation_date", "info.producer"}},
		{name: "mismatched dates", entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"], "ModDate": types.StringLiteral("D:20260102030406+00'00'")}, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "invalid dates", entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": types.StringLiteral("invalid"), "ModDate": types.StringLiteral("invalid")}, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "different producer", entries: types.Dict{"Producer": types.StringLiteral("another producer"), "CreationDate": neutralEntries["CreationDate"], "ModDate": neutralEntries["ModDate"]}, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "extra custom Info", entries: types.Dict{"Producer": neutralEntries["Producer"], "CreationDate": neutralEntries["CreationDate"], "ModDate": neutralEntries["ModDate"], "Custom": types.StringLiteral("still-user-metadata")}, expectedNames: []string{"info.creation_date", "info.custom.001", "info.mod_date", "info.producer"}},
		{name: "catalog metadata", entries: neutralEntries, metadata: catalogMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.catalog"}},
		{name: "page metadata", entries: neutralEntries, metadata: pageMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.page.0001"}},
		{name: "nested metadata", entries: neutralEntries, metadata: nestedMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.object.000001.001"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
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
			pageDictionary, _, _, err := pdfContext.PageDict(1, false)
			require.NoError(t, err)
			infoReference, err := pdfContext.IndRefForNewObject(testCase.entries)
			require.NoError(t, err)
			pdfContext.Info = infoReference
			if testCase.metadata != noMetadata {
				stream := types.StreamDict{
					Dict:    types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")},
					Content: []byte(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="near-miss-metadata"/></rdf:RDF></x:xmpmeta>`),
				}
				require.NoError(t, stream.Encode())
				metadataReference, metadataErr := pdfContext.IndRefForNewObject(stream)
				require.NoError(t, metadataErr)
				targets := map[metadataLocation]types.Dict{
					noMetadata:      nil,
					catalogMetadata: root,
					pageMetadata:    pageDictionary,
					nestedMetadata:  root,
				}
				metadataKey := "Metadata"
				metadataValue := types.Object(*metadataReference)
				if testCase.metadata == nestedMetadata {
					metadataKey = "Synthetic"
					metadataValue = types.Dict{"Metadata": *metadataReference}
				}
				targets[testCase.metadata].Insert(metadataKey, metadataValue)
			}
			var output bytes.Buffer
			writeTypedPDFFixture(t, pdfContext, &output)
			pdfBytes := output.Bytes()

			fields, err := InspectPDF(pdfBytes, PostWriteVerification)

			require.NoError(t, err)
			require.Equal(t, testCase.expectedNames, fieldNames(fields))
			requireExpectedActions(t, fields)
		})
	}
}

func TestPDFPathsRejectUndecodableMetadataAtomically(t *testing.T) {
	var unsupportedInfoPDF []byte
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
			info := types.Dict{"Custom": types.Array{types.Integer(1), types.Integer(2)}}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		unsupportedInfoPDF = output.Bytes()
	}
	nonUTF8MetadataPDF := buildNonUTF8MetadataPDFFixture(t)

	testCases := []struct {
		name     string
		pdfBytes []byte
	}{
		{name: "unsupported Info value", pdfBytes: unsupportedInfoPDF},
		{name: "non UTF-8 metadata stream", pdfBytes: nonUTF8MetadataPDF},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := testCase.pdfBytes

			fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
			outputBytes, scrubErr := CleanPDF(pdfBytes)

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
		variant signedPDFVariant
	}{
		{name: "signature dictionary", variant: signedDictionary},
		{name: "document timestamp dictionary", variant: documentTimestampDictionary},
		{name: "certification permission", variant: certificationPermission},
		{name: "usage rights permission", variant: usageRightsPermission},
		{name: "cached signed form state", variant: cachedSignedForm},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := buildSignedPDFWireContract(t, testCase.variant)

			fields, inspectErr := InspectPDF(pdfBytes, PublicInput)
			outputBytes, scrubErr := CleanPDF(pdfBytes)

			require.ErrorIs(t, inspectErr, ErrSignedPDF)
			require.Nil(t, fields)
			require.ErrorIs(t, scrubErr, ErrSignedPDF)
			require.Nil(t, outputBytes)
		})
	}
}

type signedPDFVariant int

const (
	signedDictionary signedPDFVariant = iota
	documentTimestampDictionary
	certificationPermission
	usageRightsPermission
	cachedSignedForm
)

var signedPDFFixtures = map[signedPDFVariant]map[int]string{
	signedDictionary: {
		1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 3 >> >>",
		3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>",
		5: "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /V 6 0 R /P 3 0 R >>",
		6: "<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <> /M (D:20260102030405+00'00') >>",
	},
	documentTimestampDictionary: {1: "<< /Type /Catalog /Pages 2 0 R /SyntheticTimestamp 5 0 R >>", 5: "<< /Type /DocTimeStamp /Filter /Adobe.PPKLite >>"},
	certificationPermission:     {1: "<< /Type /Catalog /Pages 2 0 R /Perms << /DocMDP 5 0 R >> >>", 5: "<< /Filter /Adobe.PPKLite >>"},
	usageRightsPermission:       {1: "<< /Type /Catalog /Pages 2 0 R /Perms << /UR3 5 0 R >> >>", 5: "<< /Filter /Adobe.PPKLite >>"},
	cachedSignedForm: {
		1: "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] >> >>",
		3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R /Annots [5 0 R] >>",
		5: "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /V 6 0 R /P 3 0 R >>",
		6: "<< /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0 0 0] /Contents <> >>",
	},
}

func buildSignedPDFWireContract(t *testing.T, variant signedPDFVariant) []byte {
	t.Helper()

	objects := map[int]string{
		1: "<< /Type /Catalog /Pages 2 0 R >>",
		2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
		4: streamObject("BT 20 100 Td (Signed synthetic page) Tj ET"),
	}
	fixtureObjects, known := signedPDFFixtures[variant]
	require.True(t, known, "unknown signed PDF variant")
	maps.Copy(objects, fixtureObjects)
	return buildPDF(t, pdfFixture{objects: objects, rootObjectNumber: 1})
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

	fields, err := InspectPDF(pdfBytes, PublicInput)

	require.NotErrorIs(t, err, ErrSignedPDF, "unexpected signed-PDF classification: %v", err)
	require.NoError(t, err)
	require.NotEmpty(t, fields)
}

func runPDFByteAPIs(input []byte) concurrentPDFResult {
	fields, inspectErr := InspectPDF(input, PublicInput)
	output, cleanErr := CleanPDF(input)
	return concurrentPDFResult{fields: fields, inspectErr: inspectErr, output: output, cleanErr: cleanErr}
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

type metadataLocation int

const (
	noMetadata metadataLocation = iota
	catalogMetadata
	pageMetadata
	nestedMetadata
)

type pdfFixture struct {
	objects          map[int]string
	rootObjectNumber int
	infoObjectNumber int
}

func addDeepMetadataPDFFixture(t *testing.T, pdfContext *model.Context, metadata metadataFixtureValues) {
	t.Helper()

	info := types.Dict{
		"Title":        types.StringLiteral(metadata.title),
		"Author":       types.HexLiteral(hex.EncodeToString([]byte(metadata.author))),
		"Producer":     types.StringLiteral(metadata.producer),
		"CreationDate": types.StringLiteral(metadata.creationDate),
		"ModDate":      types.StringLiteral(metadata.modDate),
		"Custom Key":   types.StringLiteral(metadata.customValue),
		"Flag":         types.Boolean(true),
		"Mode":         types.Name("SyntheticName"),
		"Rank":         types.Integer(7),
	}
	infoReference, err := pdfContext.IndRefForNewObject(info)
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
	catalog.Insert("Metadata", metadataReference(metadata.catalogXMP))
	catalog.Insert("Synthetic", types.Dict{"Metadata": metadataReference(metadata.nestedXMP)})
	page, _, _, err := pdfContext.PageDict(1, false)
	require.NoError(t, err)
	pageMetadataReference := metadataReference(metadata.pageXMP)
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
}

func buildDeepMetadataPDFFixture(t *testing.T, metadata metadataFixtureValues) []byte {
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
	addDeepMetadataPDFFixture(t, pdfContext, metadata)
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func buildNonUTF8MetadataPDFFixture(t *testing.T) []byte {
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
		stream := types.StreamDict{Dict: types.Dict{"Type": types.Name("Metadata"), "Subtype": types.Name("XML")}, Content: []byte{0xff, 0xfe}}
		require.NoError(t, stream.Encode())
		streamReference, err := pdfContext.IndRefForNewObject(stream)
		require.NoError(t, err)
		catalog, err := pdfContext.Catalog()
		require.NoError(t, err)
		catalog.Insert("Metadata", *streamReference)
	}
	var output bytes.Buffer
	writeTypedPDFFixture(t, pdfContext, &output)
	return output.Bytes()
}

func writeTypedPDFFixture(t *testing.T, pdfContext *model.Context, output *bytes.Buffer) {
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
	_, err := output.Write(buildPDF(t, fixture))
	require.NoError(t, err)
}

func buildPDF(t *testing.T, fixture pdfFixture) []byte {
	t.Helper()

	objectNumbers := slices.Sorted(maps.Keys(fixture.objects))
	maxObjectNumber := 0
	if len(objectNumbers) > 0 {
		maxObjectNumber = objectNumbers[len(objectNumbers)-1]
	}

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

func fieldNames(fields []Field) []string {
	names := make([]string, len(fields))
	for index, field := range fields {
		names[index] = field.Name
	}
	return names
}
