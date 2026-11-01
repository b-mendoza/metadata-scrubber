// Package nodeferfunclit reports deferred calls of function literals.
package nodeferfunclit

import (
	"go/ast"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "move this deferred cleanup into a named function and defer a call to it; " +
	"a named function keeps cleanup logic separate from the operation that it follows"

// Analyzer reports defer statements that call a function literal.
var Analyzer = &analysis.Analyzer{
	Name: "nodeferfunclit",
	Doc:  "report defer statements that call a function literal",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			if deferStatement, isDefer := node.(*ast.DeferStmt); isDefer {
				reportDeferredLiteral(pass, deferStatement)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportDeferredLiteral(pass *analysis.Pass, deferStatement *ast.DeferStmt) {
	if _, isFunctionLiteral := ast.Unparen(deferStatement.Call.Fun).(*ast.FuncLit); isFunctionLiteral {
		pass.Reportf(deferStatement.Call.Fun.Pos(), diagnosticMessage)
	}
}
