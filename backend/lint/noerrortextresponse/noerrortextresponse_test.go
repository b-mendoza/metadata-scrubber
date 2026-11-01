package noerrortextresponse_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/noerrortextresponse"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		noerrortextresponse.Analyzer,
		"noerrortextresponse",
		"noerrortextresponsenegative",
	)
}
