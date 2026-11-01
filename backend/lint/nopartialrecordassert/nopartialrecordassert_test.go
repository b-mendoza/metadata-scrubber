package nopartialrecordassert_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nopartialrecordassert"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nopartialrecordassert.Analyzer,
		"nopartialrecordassert",
		"nopartialrecordassertnegative",
	)
}
