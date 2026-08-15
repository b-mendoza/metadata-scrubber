// Package plugin registers the backend analyzers with golangci-lint.
package plugin

import (
	"github.com/golangci/plugin-module-register/register"
	"golang.org/x/tools/go/analysis"

	"metadata-scrubber/lint/checkedpolicylookup"
	"metadata-scrubber/lint/noemptyinterface"
	"metadata-scrubber/lint/nohiddentestsignal"
)

type analyzerPlugin struct {
	analyzer *analysis.Analyzer
	loadMode string
}

//nolint:gochecknoinits // The module plugin API registers linters during package initialization.
func init() {
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

	return func(_ any) (register.LinterPlugin, error) { //nolint:noemptyinterface // the plugin-module-register API fixes this parameter type.
		return plugin, nil
	}
}

func (plugin analyzerPlugin) BuildAnalyzers() ([]*analysis.Analyzer, error) {
	return []*analysis.Analyzer{plugin.analyzer}, nil
}

func (plugin analyzerPlugin) GetLoadMode() string {
	return plugin.loadMode
}
