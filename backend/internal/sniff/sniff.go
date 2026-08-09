// Package sniff applies byte-only file intake candidate policies.
package sniff

import "bytes"

const pdfCandidatePrefix = "%PDF-"

// IsPDFCandidate reports whether inputBytes begin at byte offset zero with the
// complete bare PDF candidate prefix. This deliberately strict product policy
// does not scan forward like pdfcpu v0.14.0 and does not establish PDF validity.
func IsPDFCandidate(inputBytes []byte) bool {
	return bytes.HasPrefix(inputBytes, []byte(pdfCandidatePrefix))
}
