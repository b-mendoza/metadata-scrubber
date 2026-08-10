// Package scrub inspects and removes metadata from PDF bytes.
package scrub

import (
	"bytes"
	"errors"
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

const (
	// MaxInputBytes is the aggregate PDF input boundary shared by every caller.
	MaxInputBytes = 10_000_000

	// Inspection summaries stay small enough for synchronous responses, while PDF
	// limits assume a 10 MB input and cap decoded/image amplification separately.
	maxFieldPreviewBytes    = 256
	maxInspectionFields     = 128
	maxInspectionBytes      = 32 << 10
	maxDecodedMetadataBytes = 20_000_000

	maxPDFStreamBytes       int64 = MaxInputBytes
	maxPDFDecodeBytes       int64 = 20_000_000
	maxPDFImagePixels       int64 = 10_000_000
	maxPDFImageBytes        int64 = 40_000_000
	maxPDFObjectCount             = 100_000
	maxPDFObjectStreamCount       = 50_000
	maxPDFObjectStreamFirst int64 = 2_000_000
	maxPDFXRefEntries             = 100_000
	maxPDFRecursionDepth          = 64
)

// InspectionOrigin identifies whether PDF bytes came from public input or from
// this package's just-completed write path.
type InspectionOrigin string

const (
	// PublicInput inspects untrusted uploaded PDF bytes.
	PublicInput InspectionOrigin = "public-input"
	// PostWriteVerification inspects bytes just written by CleanPDF.
	PostWriteVerification InspectionOrigin = "post-write-verification"
)

// FieldAction describes how CleanPDF handles an inspected metadata field.
type FieldAction string

const (
	// ActionRemove means the field is deleted.
	ActionRemove FieldAction = "remove"
	// ActionReplace means pdfcpu replaces the field with a neutral value.
	ActionReplace FieldAction = "replace"
)

// Field is a bounded, user-reviewable description of one PDF metadata field.
type Field struct {
	Name             string
	Label            string
	Preview          string
	OriginalByteSize int
	Action           FieldAction
}

var (
	// ErrInputTooLarge classifies PDF inputs above the aggregate product boundary.
	ErrInputTooLarge = errors.New("PDF input exceeds 10 MB limit")
	// ErrSignedPDF classifies a structurally signed PDF that must not be rewritten.
	ErrSignedPDF = errors.New("signed PDF is unsupported")
	// ErrInspectionLimit classifies metadata inventories too large to report completely.
	ErrInspectionLimit = errors.New("PDF metadata exceeds inspection limits")
	// ErrMalformedPDF classifies public PDF candidates that cannot be parsed or validated.
	ErrMalformedPDF = errors.New("malformed PDF")

	// validatePDFContext is a narrow seam for proving preflight failures precede validation.
	validatePDFContext = api.ValidateContext
)

type cleanPDFOperations struct {
	remove func(*model.Context, *pdfAnalysis)
	write  func(*model.Context, io.Writer) error
	verify func([]byte) error
}

// DisableConfigDir prevents pdfcpu from creating or reading a per-user config
// directory. Call once at startup before any PDF inspection or scrub.
func DisableConfigDir() {
	api.DisableConfigDir()
}

// InspectPDF returns bounded descriptions of all supported PDF metadata fields.
func InspectPDF(inputBytes []byte, origin InspectionOrigin) ([]Field, error) {
	if !origin.valid() {
		return nil, fmt.Errorf("invalid inspection origin %q", origin)
	}

	context, err := readPDF(inputBytes)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}
	analysis, err := analyzePDF(context, origin)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}

	return analysis.fields, nil
}

// CleanPDF removes supported metadata from PDF bytes.
func CleanPDF(inputBytes []byte) ([]byte, error) {
	return cleanPDF(inputBytes, cleanPDFOperations{
		remove: removeAnalyzedMetadata,
		write:  api.WriteContext,
		verify: verifyScrubbedPDF,
	})
}

func cleanPDF(inputBytes []byte, operations cleanPDFOperations) ([]byte, error) {
	context, err := readPDF(inputBytes)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}
	analysis, err := analyzePDF(context, PublicInput)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}
	if len(analysis.fields) == 0 {
		return inputBytes, nil
	}

	operations.remove(context, analysis)
	var output bytes.Buffer
	if err := operations.write(context, &output); err != nil {
		return nil, err
	}

	outputBytes := output.Bytes()
	if err := operations.verify(outputBytes); err != nil {
		return nil, err
	}

	return outputBytes, nil
}

func classifyPublicPDFError(err error) error {
	if errors.Is(err, ErrInputTooLarge) ||
		errors.Is(err, ErrSignedPDF) ||
		errors.Is(err, ErrInspectionLimit) {
		return err
	}

	return fmt.Errorf("%w: %w", ErrMalformedPDF, err)
}

func (origin InspectionOrigin) valid() bool {
	return origin == PublicInput || origin == PostWriteVerification
}

func readPDF(inputBytes []byte) (*model.Context, error) {
	if len(inputBytes) > MaxInputBytes {
		return nil, ErrInputTooLarge
	}

	configuration := boundedPDFConfiguration()
	context, err := api.ReadContext(bytes.NewReader(inputBytes), configuration)
	if err != nil {
		return nil, err
	}

	// pdfcpu v0.13.0 validation drops later parent links to an already-validated
	// metadata stream. Preserve those links so inspection and removal stay symmetric.
	metadataEntries, structurallySigned, err := snapshotMetadataEntries(context)
	if err != nil {
		return nil, err
	}
	if structurallySigned {
		return nil, ErrSignedPDF
	}
	// pdfcpu v0.13.0 catalog validation calls StreamDict.Decode with its 512 MiB
	// default. Decode every discovered metadata stream under our aggregate ceiling
	// and keep the bounded content cached through validation.
	if err := preflightMetadataEntries(context, metadataEntries); err != nil {
		return nil, err
	}
	if err := validatePDFContext(context); err != nil {
		return nil, err
	}
	restoreMetadataEntries(metadataEntries)
	if configuration.Optimize {
		if err := api.OptimizeContext(context); err != nil {
			return nil, err
		}
	}
	if err := pdfcpu.CacheFormFonts(context); err != nil {
		return nil, err
	}

	return context, nil
}

func boundedPDFConfiguration() *model.Configuration {
	configuration := model.NewDefaultConfiguration()
	configuration.Cmd = model.REMOVEPROPERTIES
	configuration.PostProcessValidate = true
	configuration.Limits = model.ResourceLimits{
		MaxStreamBytes:       maxPDFStreamBytes,
		MaxDecodeBytes:       maxPDFDecodeBytes,
		MaxImagePixels:       maxPDFImagePixels,
		MaxImageBytes:        maxPDFImageBytes,
		MaxObjectCount:       maxPDFObjectCount,
		MaxObjectStreamCount: maxPDFObjectStreamCount,
		MaxObjectStreamFirst: maxPDFObjectStreamFirst,
		MaxXRefEntries:       maxPDFXRefEntries,
		MaxRecursionDepth:    maxPDFRecursionDepth,
	}

	return configuration
}

func infoObjectValue(context *model.Context, object types.Object) (string, error) {
	dereferencedObject, err := context.Dereference(object)
	if err != nil {
		return "", err
	}

	switch value := dereferencedObject.(type) {
	case types.StringLiteral:
		return types.StringLiteralToString(value)
	case types.HexLiteral:
		return types.HexLiteralToString(value)
	case types.Name:
		return types.DecodeName(value.Value())
	case types.Boolean, types.Integer, types.Float:
		return value.PDFString(), nil
	default:
		return "", fmt.Errorf("unsupported Info value type %T", dereferencedObject)
	}
}
