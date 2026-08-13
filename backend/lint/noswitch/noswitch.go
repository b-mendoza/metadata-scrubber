// Package noswitch reports switch statements.
package noswitch

import (
	"go/ast"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "use a lookup map that returns an explicit error for unknown keys"

// Analyzer reports each expression switch and type switch.
var Analyzer = &analysis.Analyzer{
	Name: "noswitch",
	Doc:  "report switch statements",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			switchStatement, isSwitchStatement := node.(*ast.SwitchStmt)
			if isSwitchStatement {
				pass.Reportf(switchStatement.Switch, diagnosticMessage)

				return true
			}

			typeSwitchStatement, isTypeSwitchStatement := node.(*ast.TypeSwitchStmt)
			if isTypeSwitchStatement {
				pass.Reportf(typeSwitchStatement.Switch, diagnosticMessage)
			}

			return true
		})
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}
