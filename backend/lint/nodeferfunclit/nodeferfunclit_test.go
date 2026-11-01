package nodeferfunclit_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nodeferfunclit"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nodeferfunclit.Analyzer,
		"nodeferfunclit",
		"nodeferfunclitnegative",
	)
}
