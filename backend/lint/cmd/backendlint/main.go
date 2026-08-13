package main

import (
	"golang.org/x/tools/go/analysis/multichecker"

	"metadata-scrubber/lint/checkedpolicylookup"
	"metadata-scrubber/lint/nohiddentestsignal"
	"metadata-scrubber/lint/noswitch"
)

func main() {
	multichecker.Main(
		noswitch.Analyzer,
		nohiddentestsignal.Analyzer,
		checkedpolicylookup.Analyzer,
	)
}
