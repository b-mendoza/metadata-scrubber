package sniff_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"metadata-scrubber/internal/sniff"
)

func TestIsPDFCandidateRecognizesCompleteOffsetZeroPrefix(t *testing.T) {
	testCases := []struct {
		name       string
		inputBytes []byte
	}{
		{name: "bare prefix", inputBytes: []byte("%PDF-")},
		{name: "versioned header", inputBytes: []byte("%PDF-1.7")},
		{name: "arbitrary trailing bytes", inputBytes: []byte("%PDF-not structurally valid")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.True(t, sniff.IsPDFCandidate(testCase.inputBytes))
		})
	}
}

func TestIsPDFCandidateRejectsAbsentIncompleteOrUnrelatedContent(t *testing.T) {
	testCases := []struct {
		name       string
		inputBytes []byte
	}{
		{name: "nil", inputBytes: nil},
		{name: "percent PDF", inputBytes: []byte("%PDF")},
		{name: "PNG bytes", inputBytes: []byte("\x89PNG\r\n\x1a\n")},
		{name: "lowercase prefix", inputBytes: []byte("%pdf-1.7")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.False(t, sniff.IsPDFCandidate(testCase.inputBytes))
		})
	}
}

func TestIsPDFCandidateRejectsPrefixAfterLeadingBytes(t *testing.T) {
	testCases := []struct {
		name       string
		inputBytes []byte
	}{
		{name: "space", inputBytes: []byte(" %PDF-1.7")},
		{name: "UTF-8 byte-order mark", inputBytes: []byte("\xef\xbb\xbf%PDF-1.7")},
		{name: "NUL byte", inputBytes: []byte("\x00%PDF-1.7")},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			require.False(t, sniff.IsPDFCandidate(testCase.inputBytes))
		})
	}
}
