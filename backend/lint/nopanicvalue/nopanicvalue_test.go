package nopanicvalue_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nopanicvalue"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nopanicvalue.Analyzer,
		"nopanicvalue",
		"nopanicvaluenegative",
	)
}
