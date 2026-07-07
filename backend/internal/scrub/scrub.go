// Package scrub removes metadata from uploaded files.
package scrub

import (
	"bytes"
	"errors"
	"path/filepath"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

const pdfExtension = ".pdf"

type scrubber func([]byte) ([]byte, error)

// ErrUnsupportedType is returned when a file's extension has no scrubber wired up.
var ErrUnsupportedType = errors.New("unsupported file type")

// DisableConfigDir stops pdfcpu from creating a config dir under $HOME on first
// use, which panics on a read-only/scratch rootfs. RemoveProperties needs no
// config, so it is safe to disable. Call once at startup before any scrub.
func DisableConfigDir() {
	api.DisableConfigDir()
}

// Scrub dispatches on file extension and returns the metadata-free bytes.
// Today only PDF is wired up; add DOCX/TXT branches here as you build out.
func Scrub(filename string, src []byte) ([]byte, error) {
	scrub, ok := scrubberFor(filename)
	if !ok {
		return nil, ErrUnsupportedType
	}

	return scrub(src)
}

func scrubberFor(filename string) (scrubber, bool) {
	switch normalizedExtension(filename) {
	case pdfExtension:
		return scrubPDF, true
	default:
		return nil, false
	}
}

func normalizedExtension(filename string) string {
	return strings.ToLower(filepath.Ext(filename))
}

func scrubPDF(src []byte) ([]byte, error) {
	var out bytes.Buffer
	var properties []string

	// An empty property list tells pdfcpu to remove all document properties.
	if err := api.RemoveProperties(bytes.NewReader(src), &out, properties, nil); err != nil {
		return nil, err
	}

	return out.Bytes(), nil
}
