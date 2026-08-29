// Package scrub inspects and removes metadata from PDF bytes.
package scrub

import (
	"bytes"
	"errors"
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

const (
	// MaxInputBytes is the aggregate PDF input boundary shared by every caller.
	MaxInputBytes = 10_000_000

	// Inspection summaries stay small enough for synchronous responses.
	maxFieldPreviewBytes    = 256
	maxInspectionFields     = 128
	maxInspectionBytes      = 32 << 10
	maxDecodedMetadataBytes = 20_000_000
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
)

type (
	removePDFMetadataOperation func(*model.Context, *pdfAnalysis)
	writePDFOperation          func(*model.Context, io.Writer) error
	verifyPDFOperation         func([]byte) error
)

type cleanPDFOperations struct {
	remove removePDFMetadataOperation
	write  writePDFOperation
	verify verifyPDFOperation
}

// DisableConfigDir prevents pdfcpu from creating or reading a per-user config
// directory. Call once at startup before any PDF inspection or scrub.
func DisableConfigDir() {
	api.DisableConfigDir()
}

func (origin InspectionOrigin) valid() bool {
	return origin == PublicInput || origin == PostWriteVerification
}

func (action FieldAction) valid() bool {
	return action == ActionRemove || action == ActionReplace
}

// InspectPDF returns bounded descriptions of all supported PDF metadata fields.
func InspectPDF(inputBytes []byte, origin InspectionOrigin) ([]Field, error) {
	if !origin.valid() {
		return nil, fmt.Errorf("invalid inspection origin %q", origin)
	}

	_, analysis, err := readAndAnalyzePDF(inputBytes, origin)
	if err != nil {
		return nil, err
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
	context, analysis, err := readAndAnalyzePDF(inputBytes, PublicInput)
	if err != nil {
		return nil, err
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

func classifyPDFError(err error, origin InspectionOrigin) error {
	if origin == PostWriteVerification ||
		errors.Is(err, ErrInputTooLarge) ||
		errors.Is(err, ErrSignedPDF) ||
		errors.Is(err, ErrInspectionLimit) {
		return err
	}

	return fmt.Errorf("%w: %w", ErrMalformedPDF, err)
}

func readAndAnalyzePDF(inputBytes []byte, origin InspectionOrigin) (*model.Context, *pdfAnalysis, error) {
	context, err := readPDF(inputBytes)
	if err != nil {
		return nil, nil, classifyPDFError(err, origin)
	}
	analysis, err := analyzePDF(context, origin)
	if err != nil {
		return nil, nil, classifyPDFError(err, origin)
	}
	return context, analysis, nil
}

func infoObjectValue(context *model.Context, object types.Object) (string, error) {
	dereferencedObject, err := context.Dereference(object)
	if err != nil {
		return "", err
	}

	switch dereferencedObject.(type) {
	case types.StringLiteral:
		return decodeStringLiteralInfoObject(dereferencedObject)
	case types.HexLiteral:
		return decodeHexLiteralInfoObject(dereferencedObject)
	case types.Name:
		return decodeNameInfoObject(dereferencedObject)
	case types.Boolean, types.Integer, types.Float:
		return decodeScalarInfoObject(dereferencedObject)
	default:
		return "", fmt.Errorf("unsupported Info value type %T", dereferencedObject)
	}
}

func decodeStringLiteralInfoObject(object types.Object) (string, error) {
	value, ok := object.(types.StringLiteral)
	if !ok {
		return "", fmt.Errorf("unsupported string literal Info value type %T", object)
	}
	return types.StringLiteralToString(value)
}

func decodeHexLiteralInfoObject(object types.Object) (string, error) {
	value, ok := object.(types.HexLiteral)
	if !ok {
		return "", fmt.Errorf("unsupported hex literal Info value type %T", object)
	}
	return types.HexLiteralToString(value)
}

func decodeNameInfoObject(object types.Object) (string, error) {
	value, ok := object.(types.Name)
	if !ok {
		return "", fmt.Errorf("unsupported name Info value type %T", object)
	}
	return types.DecodeName(value.Value())
}

func decodeScalarInfoObject(object types.Object) (string, error) {
	return object.PDFString(), nil
}
