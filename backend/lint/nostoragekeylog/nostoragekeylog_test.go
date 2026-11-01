package nostoragekeylog_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nostoragekeylog"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nostoragekeylog.Analyzer,
		"nostoragekeylog",
		"nostoragekeylognegative",
	)
}
