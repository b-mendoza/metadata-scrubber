// Package plugin registers the backend analyzers with golangci-lint.
package plugin

import (
	"github.com/golangci/plugin-module-register/register"
	"golang.org/x/tools/go/analysis"

	"metadata-scrubber/lint/checkedpolicylookup"
	"metadata-scrubber/lint/noemptyinterface"
	"metadata-scrubber/lint/nohiddentestsignal"
	"metadata-scrubber/lint/noswitch"
)

type analyzerPlugin struct {
	analyzer *analysis.Analyzer
	loadMode string
}

//nolint:gochecknoinits // The module plugin API registers linters during package initialization.
func init() {
	register.Plugin(noswitch.Analyzer.Name, newPlugin(noswitch.Analyzer, register.LoadModeSyntax))
	register.Plugin(
		nohiddentestsignal.Analyzer.Name,
		newPlugin(nohiddentestsignal.Analyzer, register.LoadModeTypesInfo),
	)
	register.Plugin(
		checkedpolicylookup.Analyzer.Name,
		newPlugin(checkedpolicylookup.Analyzer, register.LoadModeTypesInfo),
	)
	register.Plugin(
		noemptyinterface.Analyzer.Name,
		newPlugin(noemptyinterface.Analyzer, register.LoadModeTypesInfo),
	)
}

func newPlugin(analyzer *analysis.Analyzer, loadMode string) register.NewPlugin {
	plugin := analyzerPlugin{analyzer: analyzer, loadMode: loadMode}
	return plugin.construct
}

// policy:allow-any -- the plugin-module-register API fixes this parameter type.
func (plugin analyzerPlugin) construct(_ any) (register.LinterPlugin, error) {
	return plugin, nil
}

func (plugin analyzerPlugin) BuildAnalyzers() ([]*analysis.Analyzer, error) {
	return []*analysis.Analyzer{plugin.analyzer}, nil
}

func (plugin analyzerPlugin) GetLoadMode() string {
	return plugin.loadMode
}
