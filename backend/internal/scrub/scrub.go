// Package scrub inspects and removes metadata from PDF bytes.
package scrub

import (
	"bytes"
	"errors"
	"path/filepath"
	"strings"
	"github.com/pdfcpu/pdfcpu/pkg/api"
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
)

// DisableConfigDir prevents pdfcpu from creating or reading a per-user config
// directory. Call once at startup before any PDF inspection or scrub.
func DisableConfigDir() {
	api.DisableConfigDir()
}

const pdfExtension = ".pdf"

// ErrUnsupportedType is returned when a file's extension has no scrubber wired up.
var ErrUnsupportedType = errors.New("unsupported file type")

// Scrub dispatches on file extension and returns the metadata-free bytes.
// Today only PDF is wired up; add DOCX/TXT branches here as you build out.
func Scrub(filename string, src []byte) ([]byte, error) {
	switch normalizedExtension(filename) {
	case pdfExtension:
		return scrubPDF(src)
	default:
		return nil, ErrUnsupportedType
	}
}

func normalizedExtension(filename string) string {
	return strings.ToLower(filepath.Ext(filename))
}

func scrubPDF(src []byte) ([]byte, error) {
	var out bytes.Buffer

	// A nil property list tells pdfcpu to remove every document property and the
	// catalog XMP metadata, rather than a named subset.
	var allProperties []string

	if err := api.RemoveProperties(bytes.NewReader(src), &out, allProperties, nil); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}
