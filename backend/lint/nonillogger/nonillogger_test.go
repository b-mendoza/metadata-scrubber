package nonillogger_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/nonillogger"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		nonillogger.Analyzer,
		"nonillogger",
		"nonilloggernegative",
	)
}
