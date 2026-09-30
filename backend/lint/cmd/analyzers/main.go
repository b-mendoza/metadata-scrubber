// Package main checks application code with the backend analyzers.
package main

import (
	"golang.org/x/tools/go/analysis/multichecker"

	"metadata-scrubber/lint/noemptyinterface"
	"metadata-scrubber/lint/nohiddentestsignal"
)

func main() {
	multichecker.Main(noemptyinterface.Analyzer, nohiddentestsignal.Analyzer)
}
