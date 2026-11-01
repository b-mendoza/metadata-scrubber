package httpclienttimeout_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/httpclienttimeout"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		httpclienttimeout.Analyzer,
		"httpclienttimeout",
		"httpclienttimeoutnegative",
	)
}
