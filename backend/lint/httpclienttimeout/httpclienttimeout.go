// Package httpclienttimeout reports production HTTP clients without an overall timeout.
package httpclienttimeout

import (
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "set Timeout on this http.Client; " +
	"without an overall timeout a stalled response keeps the request open even while the caller stays connected"

// Analyzer reports http.Client values in non-test files that do not set Timeout.
var Analyzer = &analysis.Analyzer{
	Name: "httpclienttimeout",
	Doc:  "report http.Client values in non-test files that do not set Timeout",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if strings.HasSuffix(pass.Fset.File(file.FileStart).Name(), "_test.go") {
			continue
		}
		for node := range ast.Preorder(file) {
			switch expression := node.(type) {
			case *ast.CompositeLit:
				reportLiteralWithoutTimeout(pass, expression)
			case *ast.CallExpr:
				reportNewClient(pass, expression)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportLiteralWithoutTimeout(pass *analysis.Pass, literal *ast.CompositeLit) {
	literalType := pass.TypesInfo.TypeOf(literal)
	// An elided literal inside []*http.Client{...} has the pointer type.
	if pointer, isPointer := types.Unalias(literalType).(*types.Pointer); isPointer {
		literalType = pointer.Elem()
	}
	if !isHTTPClient(literalType) || setsTimeout(literal) {
		return
	}
	pass.Reportf(literal.Pos(), diagnosticMessage)
}

func setsTimeout(literal *ast.CompositeLit) bool {
	for _, element := range literal.Elts {
		field, isField := element.(*ast.KeyValueExpr)
		if !isField {
			continue
		}
		if key, isKey := field.Key.(*ast.Ident); isKey && key.Name == "Timeout" {
			return true
		}
	}
	return false
}

func reportNewClient(pass *analysis.Pass, call *ast.CallExpr) {
	identifier, isIdentifier := ast.Unparen(call.Fun).(*ast.Ident)
	if !isIdentifier || len(call.Args) != 1 {
		return
	}
	if _, isBuiltin := pass.TypesInfo.Uses[identifier].(*types.Builtin); !isBuiltin || identifier.Name != "new" {
		return
	}
	if isHTTPClient(pass.TypesInfo.TypeOf(call.Args[0])) {
		pass.Reportf(call.Pos(), diagnosticMessage)
	}
}

func isHTTPClient(valueType types.Type) bool {
	named, isNamed := types.Unalias(valueType).(*types.Named)
	return isNamed && named.Obj().Pkg() != nil &&
		named.Obj().Pkg().Path() == "net/http" && named.Obj().Name() == "Client"
}
