// Package main checks application code with the backend analyzers.
package main

import (
	"golang.org/x/tools/go/analysis/multichecker"

	"metadata-scrubber/lint/httpclienttimeout"
	"metadata-scrubber/lint/nodeferfunclit"
	"metadata-scrubber/lint/noemptyinterface"
	"metadata-scrubber/lint/noerrortextresponse"
	"metadata-scrubber/lint/nohiddentestsignal"
	"metadata-scrubber/lint/nolocalfunclit"
	"metadata-scrubber/lint/nonillogger"
	"metadata-scrubber/lint/nopanicvalue"
	"metadata-scrubber/lint/nopartialrecordassert"
	"metadata-scrubber/lint/nostoragekeylog"
	"metadata-scrubber/lint/notestpackagevar"
	"metadata-scrubber/lint/nourltext"
)

func main() {
	multichecker.Main(
		httpclienttimeout.Analyzer,
		nodeferfunclit.Analyzer,
		noemptyinterface.Analyzer,
		noerrortextresponse.Analyzer,
		nohiddentestsignal.Analyzer,
		nolocalfunclit.Analyzer,
		nonillogger.Analyzer,
		nopanicvalue.Analyzer,
		nopartialrecordassert.Analyzer,
		nostoragekeylog.Analyzer,
		notestpackagevar.Analyzer,
		nourltext.Analyzer,
	)
}
