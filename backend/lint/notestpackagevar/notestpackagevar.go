// Package notestpackagevar reports test code that writes package variables.
package notestpackagevar

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "pass this test dependency as an argument or set a field on the test instance; " +
	"writing a package variable changes the dependency for every test and request that runs at the same time"

// Analyzer reports writes to package-level variables of the same package in Go test files.
var Analyzer = &analysis.Analyzer{
	Name: "notestpackagevar",
	Doc:  "report writes to same-package package-level variables in Go test files",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if !strings.HasSuffix(pass.Fset.File(file.FileStart).Name(), "_test.go") {
			continue
		}
		for node := range ast.Preorder(file) {
			switch statement := node.(type) {
			case *ast.AssignStmt:
				reportAssignment(pass, statement)
			case *ast.IncDecStmt:
				reportPackageVariableWrite(pass, statement.X)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportAssignment(pass *analysis.Pass, assignment *ast.AssignStmt) {
	if assignment.Tok == token.DEFINE {
		return
	}
	for _, target := range assignment.Lhs {
		reportPackageVariableWrite(pass, target)
	}
}

func reportPackageVariableWrite(pass *analysis.Pass, target ast.Expr) {
	variable, isVariable := pass.TypesInfo.Uses[rootIdentifier(pass.TypesInfo, target)].(*types.Var)
	if isVariable && variable.Parent() == pass.Pkg.Scope() {
		pass.Reportf(target.Pos(), diagnosticMessage)
	}
}

// rootIdentifier returns the variable that a write changes: value for value.field[index].
func rootIdentifier(typeInfo *types.Info, target ast.Expr) *ast.Ident {
	for {
		switch expression := ast.Unparen(target).(type) {
		case *ast.Ident:
			return expression
		case *ast.SelectorExpr:
			if _, isFieldSelection := typeInfo.Selections[expression]; !isFieldSelection {
				return nil
			}
			target = expression.X
		case *ast.IndexExpr:
			target = expression.X
		case *ast.StarExpr:
			target = expression.X
		default:
			return nil
		}
	}
}
