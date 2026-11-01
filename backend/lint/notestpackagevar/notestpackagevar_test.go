package notestpackagevar_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/notestpackagevar"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		notestpackagevar.Analyzer,
		"notestpackagevar",
		"notestpackagevarnegative",
	)
}
