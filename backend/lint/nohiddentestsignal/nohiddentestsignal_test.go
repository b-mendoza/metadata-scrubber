package nohiddentestsignal_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nohiddentestsignal"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nohiddentestsignal.Analyzer,
		"nohiddentestsignal",
		"nohiddentestsignalnegative",
	)
}
