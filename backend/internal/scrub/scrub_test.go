package scrub

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"maps"
	"os"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/api"
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

func TestCleanPDFRejectsInvalidPDFWithNoOutput(t *testing.T) {
	outputBytes, err := CleanPDF([]byte("not a pdf"))

	require.ErrorIs(t, err, ErrMalformedPDF)
	require.Nil(t, outputBytes)
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
	inputBytes := append([]byte("leading bytes\n"), func() []byte {
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
		return output.Bytes()
	}()...)
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

	pdfBytes := func() []byte {
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
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}()

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
			pdfBytes := func() []byte {
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
				return output.Bytes()
			}()

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
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

	fields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Len(t, fields, 1)
	require.Equal(t, title, fields[0].Preview)
	require.Equal(t, len(title), fields[0].OriginalByteSize)
}

func TestPDFPathsRejectAggregateDecodedMetadataBudgetBeforeWriting(t *testing.T) {
	const (
		streamCount        = 24
		decodedStreamBytes = 1 << 20
	)
	require.Greater(t, streamCount*decodedStreamBytes, maxDecodedMetadataBytes)
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

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
	pdfBytes := func() []byte {
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
			stream, err := pdfContext.NewStreamDictForBuf([]byte(metadata.String()))
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
	}()
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

func TestInspectPDFPreservesSharedCompressedMetadataReferences(t *testing.T) {
	metadata := `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:synthetic="urn:synthetic" synthetic:marker="shared-compressed-metadata"/></rdf:RDF></x:xmpmeta>`
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()

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

func TestAnalyzePDFReleasesDecodedMetadataStreamCaches(t *testing.T) {
	const decodedStreamBytes = 1 << 20
	pdfBytes := func() []byte {
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
			firstStream, err := pdfContext.NewStreamDictForBuf(bytes.Repeat([]byte("x"), decodedStreamBytes))
			require.NoError(t, err)
			firstStream.InsertName("Type", "Metadata")
			firstStream.InsertName("Subtype", "XML")
			require.NoError(t, firstStream.Encode())
			firstReference, err := pdfContext.IndRefForNewObject(*firstStream)
			require.NoError(t, err)
			secondStream, err := pdfContext.NewStreamDictForBuf(bytes.Repeat([]byte("x"), decodedStreamBytes))
			require.NoError(t, err)
			secondStream.InsertName("Type", "Metadata")
			secondStream.InsertName("Subtype", "XML")
			require.NoError(t, secondStream.Encode())
			secondReference, err := pdfContext.IndRefForNewObject(*secondStream)
			require.NoError(t, err)
			catalog.Insert("SyntheticParents", types.Array{
				types.Dict{"Metadata": *firstReference},
				types.Dict{"Metadata": *secondReference},
			})
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}()
	pdfContext, err := readPDF(pdfBytes)
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

func TestPDFByteAPIsEnforceAggregateInputLimit(t *testing.T) {
	basePDF := func() []byte {
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
		return output.Bytes()
	}()
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
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

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
	acceptedFields, err := InspectPDF(func() []byte {
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
				info.InsertString(fmt.Sprintf("Custom%03d", index), "x")
			}
			infoReference, err := pdfContext.IndRefForNewObject(info)
			require.NoError(t, err)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}(), PublicInput)
	require.NoError(t, err)
	require.Len(t, acceptedFields, maxInspectionFields)

	rejectedPDF := func() []byte {
		configuration := model.NewDefaultConfiguration()
		configuration.WriteObjectStream = false
		configuration.WriteXRefStream = false
		pdfContext, buildErr := pdfcpu.CreateContextWithXRefTable(configuration, types.PaperSize["A4"])
		require.NoError(t, buildErr)
		root, buildErr := pdfContext.Catalog()
		require.NoError(t, buildErr)
		root.Delete("Pages")
		page := model.NewPage(types.RectForFormat("A4"), nil)
		page.Buf.WriteString("BT 20 100 Td (Synthetic page) Tj ET")
		require.NoError(t, pdfcpu.AddPageTreeWithSamplePage(pdfContext.XRefTable, root, page))
		pdfContext.PageCount = 1
		{
			info := types.NewDict()
			for index := range maxInspectionFields + 1 {
				info.InsertString(fmt.Sprintf("Custom%03d", index), "x")
			}
			infoReference, buildErr := pdfContext.IndRefForNewObject(info)
			require.NoError(t, buildErr)
			pdfContext.Info = infoReference
		}
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}()
	fields, err := InspectPDF(rejectedPDF, PublicInput)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, fields)

	outputBytes, err := CleanPDF(rejectedPDF)
	require.ErrorIs(t, err, ErrInspectionLimit)
	require.Nil(t, outputBytes)
}

func TestInspectPDFEnforcesAggregateSummaryBudgetAtomically(t *testing.T) {
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

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

func TestInspectPDFTreatsNeutralTrioAccordingToOrigin(t *testing.T) {
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

	publicFields, err := InspectPDF(pdfBytes, PublicInput)
	require.NoError(t, err)
	require.Equal(t, []string{"info.creation_date", "info.mod_date", "info.producer"}, fieldNames(publicFields))
	requireExpectedActions(t, publicFields)

	verificationFields, err := InspectPDF(pdfBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

// The typed fixture stays local so each case serializes its exact PDF contract.
//
//nolint:gocognit // Branches construct the catalog, page, and nested metadata variants.
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
		{name: "mismatched dates", entries: mergeInfoEntries(neutralEntries, types.Dict{"ModDate": types.StringLiteral("D:20260102030406+00'00'")}), expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "invalid dates", entries: mergeInfoEntries(neutralEntries, types.Dict{"CreationDate": types.StringLiteral("invalid"), "ModDate": types.StringLiteral("invalid")}), expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "different producer", entries: mergeInfoEntries(neutralEntries, types.Dict{"Producer": types.StringLiteral("another producer")}), expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer"}},
		{name: "extra custom Info", entries: mergeInfoEntries(neutralEntries, types.Dict{"Custom": types.StringLiteral("still-user-metadata")}), expectedNames: []string{"info.creation_date", "info.custom.001", "info.mod_date", "info.producer"}},
		{name: "catalog metadata", entries: neutralEntries, metadata: catalogMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.catalog"}},
		{name: "page metadata", entries: neutralEntries, metadata: pageMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.page.0001"}},
		{name: "nested metadata", entries: neutralEntries, metadata: nestedMetadata, expectedNames: []string{"info.creation_date", "info.mod_date", "info.producer", "metadata.object.000001.001"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			pdfBytes := func() []byte {
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
						metadataReference, err := pdfContext.IndRefForNewObject(stream)
						require.NoError(t, err)
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
				}
				var output bytes.Buffer
				writeTypedPDFFixture(t, pdfContext, &output)
				return output.Bytes()
			}()

			fields, err := InspectPDF(pdfBytes, PostWriteVerification)

			require.NoError(t, err)
			require.Equal(t, testCase.expectedNames, fieldNames(fields))
			requireExpectedActions(t, fields)
		})
	}
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

	inputBytes := func() []byte {
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
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}()
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
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()

	fields, err := InspectPDF(inputBytes, PublicInput)
	require.NoError(t, err)
	require.Empty(t, fields)

	outputBytes, err := CleanPDF(inputBytes)
	require.NoError(t, err)
	require.Equal(t, inputBytes, outputBytes)
}

func TestCleanPDFRewritesPublicNeutralLookingTrio(t *testing.T) {
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()

	outputBytes, err := CleanPDF(inputBytes)

	require.NoError(t, err)
	require.NotEqual(t, inputBytes, outputBytes)
	verificationFields, err := InspectPDF(outputBytes, PostWriteVerification)
	require.NoError(t, err)
	require.Empty(t, verificationFields)
}

func TestPDFPathsEnforceConfiguredStreamLimit(t *testing.T) {
	oversizedContent := strings.Repeat("x", int(maxPDFStreamBytes)+1)
	pdfBytes := func() []byte {
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
		return output.Bytes()
	}()

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

	inputBytes := func() []byte {
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
		return output.Bytes()
	}()
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

func TestCleanPDFReturnsNilOutputWhenWriteFails(t *testing.T) {
	writeError := errors.New("synthetic write failure")
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()
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
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()

	outputBytes, err := cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write:  api.WriteContext,
		verify: func([]byte) error { return verificationError },
	})

	require.ErrorIs(t, err, verificationError)
	require.Nil(t, outputBytes)
}

func TestCleanPDFUsesBoundedConfigurationForPostWriteVerification(t *testing.T) {
	inputBytes := func() []byte {
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
		return output.Bytes()
	}()
	oversizedOutput := func() []byte {
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
			stream, err := pdfContext.NewStreamDictForBuf(bytes.Repeat([]byte("x"), int(maxPDFStreamBytes)+1))
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
	}()

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

func TestPDFPathsRejectUndecodableMetadataAtomically(t *testing.T) {
	testCases := []struct {
		name     string
		pdfBytes []byte
	}{
		{name: "unsupported Info value", pdfBytes: func() []byte {
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
			return output.Bytes()
		}()},
		{name: "non UTF-8 metadata stream", pdfBytes: func() []byte {
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
		}()},
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

func TestCleanPDFRejectsSignedPDFBeforeMutationOrWriting(t *testing.T) {
	pdfBytes := buildSignedPDFWireContract(t, signedDictionary)
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

func TestUnsignedSignatureLikeWireContractIsAccepted(t *testing.T) {
	pdfBytes := buildUnsignedSignatureLikePDFWireContract(t)

	fields, err := InspectPDF(pdfBytes, PublicInput)

	require.NotErrorIs(t, err, ErrSignedPDF, "unexpected signed-PDF classification: %v", err)
	require.NoError(t, err)
	require.NotEmpty(t, fields)
}

type concurrentPDFResult struct {
	fields     []Field
	inspectErr error
	output     []byte
	cleanErr   error
}

func TestPDFByteAPIsKeepConcurrentRequestsIsolated(t *testing.T) {
	cleanInput := func() []byte {
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
		return output.Bytes()
	}()
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

	metadataInput := func() []byte {
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
				"Title":        types.StringLiteral(concurrentMetadata.title),
				"Author":       types.HexLiteral(hex.EncodeToString([]byte(concurrentMetadata.author))),
				"Producer":     types.StringLiteral(concurrentMetadata.producer),
				"CreationDate": types.StringLiteral(concurrentMetadata.creationDate),
				"ModDate":      types.StringLiteral(concurrentMetadata.modDate),
				"Custom Key":   types.StringLiteral(concurrentMetadata.customValue),
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
			catalog.Insert("Metadata", metadataReference(concurrentMetadata.catalogXMP))
			catalog.Insert("Synthetic", types.Dict{"Metadata": metadataReference(concurrentMetadata.nestedXMP)})
			page, _, _, err := pdfContext.PageDict(1, false)
			require.NoError(t, err)
			pageMetadataReference := metadataReference(concurrentMetadata.pageXMP)
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
		var output bytes.Buffer
		writeTypedPDFFixture(t, pdfContext, &output)
		return output.Bytes()
	}()
	signedInput := buildSignedPDFWireContract(t, signedDictionary)
	overLimitInput := slices.Concat(cleanInput, bytes.Repeat([]byte{' '}, MaxInputBytes-len(cleanInput)+1))

	run := func(input []byte) concurrentPDFResult {
		fields, inspectErr := InspectPDF(input, PublicInput)
		output, cleanErr := CleanPDF(input)
		return concurrentPDFResult{fields: fields, inspectErr: inspectErr, output: output, cleanErr: cleanErr}
	}
	testCases := []struct {
		name         string
		input        []byte
		inspectError error
		cleanError   error
	}{
		{name: "clean", input: cleanInput},
		{name: "metadata rich", input: metadataInput},
		{name: "signed", input: signedInput, inspectError: ErrSignedPDF, cleanError: ErrSignedPDF},
		{name: "over limit", input: overLimitInput, inspectError: ErrInputTooLarge, cleanError: ErrInputTooLarge},
	}
	baselines := make([]concurrentPDFResult, len(testCases))
	for index, testCase := range testCases {
		baselines[index] = run(testCase.input)
	}

	results := make([]concurrentPDFResult, len(testCases))
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(testCases))
	for index, testCase := range testCases {
		go func() {
			defer waitGroup.Done()
			results[index] = run(testCase.input)
		}()
	}
	waitGroup.Wait()

	for index, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			requireConcurrentPDFResult(t, baselines[index], results[index], testCase)
		})
	}
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

func buildUnsignedSignatureLikePDFWireContract(t *testing.T) []byte {
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

type pdfFixture struct {
	objects          map[int]string
	rootObjectNumber int
	infoObjectNumber int
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

func mergeInfoEntries(baseEntries types.Dict, replacements types.Dict) types.Dict {
	mergedEntries := maps.Clone(baseEntries)
	maps.Copy(mergedEntries, replacements)
	return mergedEntries
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
