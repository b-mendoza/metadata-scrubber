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

//policy:allow-any: the x/tools analysis API fixes this return type.
func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			if switchStatement, isSwitchStatement := node.(*ast.SwitchStmt); isSwitchStatement {
				pass.Reportf(switchStatement.Switch, diagnosticMessage)
			}

			if typeSwitchStatement, isTypeSwitchStatement := node.(*ast.TypeSwitchStmt); isTypeSwitchStatement {
				pass.Reportf(typeSwitchStatement.Switch, diagnosticMessage)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}
