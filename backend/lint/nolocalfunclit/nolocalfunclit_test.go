package nolocalfunclit_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nolocalfunclit"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nolocalfunclit.Analyzer,
		"nolocalfunclit",
		"nolocalfunclitnegative",
	)
}
