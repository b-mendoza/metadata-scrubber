package noemptyinterface_test

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"

	"metadata-scrubber/lint/noemptyinterface"
)

func TestAnalyzer(t *testing.T) {
	t.Parallel()

	analysistest.Run(
		t,
		analysistest.TestData(),
		noemptyinterface.Analyzer,
		"noemptyinterface",
		"noemptyinterfacealiases",
		"noemptyinterfacenegative",
	)
}
