// Package nolocalfunclit reports function literals stored in plain variables.
package nolocalfunclit

import (
	"go/ast"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "write this function literal inline at its call or struct field, or declare a named function; " +
	"a function stored in a variable moves its captured values away from their use"

// Analyzer reports function literals that are bound to a plain variable name.
var Analyzer = &analysis.Analyzer{
	Name: "nolocalfunclit",
	Doc:  "report function literals bound to a plain variable name",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			switch statement := node.(type) {
			case *ast.AssignStmt:
				reportBoundLiterals(pass, statement.Lhs, statement.Rhs)
			case *ast.ValueSpec:
				reportBoundLiterals(pass, identifierExpressions(statement.Names), statement.Values)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func identifierExpressions(names []*ast.Ident) []ast.Expr {
	expressions := make([]ast.Expr, 0, len(names))
	for _, name := range names {
		expressions = append(expressions, name)
	}
	return expressions
}

func reportBoundLiterals(pass *analysis.Pass, targets []ast.Expr, values []ast.Expr) {
	if len(targets) != len(values) {
		return
	}
	for index, value := range values {
		if _, isFunctionLiteral := ast.Unparen(value).(*ast.FuncLit); !isFunctionLiteral {
			continue
		}
		if name, isName := targets[index].(*ast.Ident); isName && name.Name != "_" {
			pass.Reportf(value.Pos(), diagnosticMessage)
		}
	}
}
