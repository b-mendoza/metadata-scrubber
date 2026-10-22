// Package scrub inspects and removes metadata from PDF bytes.
package scrub

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

const (
	// MaxInputBytes is the aggregate PDF input boundary shared by every caller.
	MaxInputBytes = 10_485_760

	// Inspection summaries stay small enough for synchronous responses.
	maxFieldPreviewBytes    = 256
	maxInspectionFields     = 128
	maxInspectionBytes      = 32 << 10
	maxDecodedMetadataBytes = 20_000_000
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
	ErrInputTooLarge = errors.New("PDF input exceeds 10 MiB limit")
	// ErrSignedPDF classifies a structurally signed PDF that must not be rewritten.
	ErrSignedPDF = errors.New("signed PDF is unsupported")
	// ErrInspectionLimit classifies metadata inventories too large to report completely.
	ErrInspectionLimit = errors.New("PDF metadata exceeds inspection limits")
	// ErrMalformedPDF classifies public PDF candidates that cannot be parsed or validated.
	ErrMalformedPDF = errors.New("malformed PDF")
)

// InspectPDF returns bounded descriptions of all supported PDF metadata fields.
func InspectPDF(ctx context.Context, inputBytes []byte) ([]Field, error) {
	_, analysis, err := readAndAnalyzePDF(ctx, inputBytes)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}
	return analysis.fields, nil
}

// CleanPDF removes supported metadata from PDF bytes.
func CleanPDF(ctx context.Context, inputBytes []byte) ([]byte, error) {
	return cleanPDF(ctx, inputBytes, api.WriteContext)
}

func cleanPDF(ctx context.Context, inputBytes []byte, write func(context.Context, *model.Context, io.Writer) error) ([]byte, error) {
	pdfContext, analysis, err := readAndAnalyzePDF(ctx, inputBytes)
	if err != nil {
		return nil, classifyPublicPDFError(err)
	}
	if len(analysis.fields) == 0 {
		return inputBytes, nil
	}

	removeAnalyzedMetadata(pdfContext, analysis)
	var output bytes.Buffer
	if err := write(ctx, pdfContext, &output); err != nil {
		return nil, err
	}

	outputBytes := output.Bytes()
	if err := verifyScrubbedPDF(ctx, outputBytes); err != nil {
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

func readAndAnalyzePDF(ctx context.Context, inputBytes []byte) (*model.Context, *pdfAnalysis, error) {
	pdfContext, err := readPDFWithValidator(ctx, inputBytes, api.ValidateContext)
	if err != nil {
		return nil, nil, err
	}
	analysis, err := analyzePDF(ctx, pdfContext)
	if err != nil {
		return nil, nil, err
	}
	return pdfContext, analysis, nil
}

func infoObjectValue(pdfContext *model.Context, object types.Object) (string, error) {
	dereferencedObject, err := pdfContext.Dereference(object)
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
		return "", fmt.Errorf("unsupported Info value type %T", value)
	}
}
