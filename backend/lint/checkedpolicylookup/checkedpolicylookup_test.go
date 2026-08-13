package checkedpolicylookup_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/checkedpolicylookup"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		checkedpolicylookup.Analyzer,
		"checkedpolicylookup",
		"checkedpolicylookupnegative",
	)
}
