// Package nonillogger reports nil checks on *slog.Logger values.
package nonillogger

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

const diagnosticMessage = "remove this nil check and require a non-nil *slog.Logger from the caller; " +
	"a nil-logger fallback hides a missing dependency"

// Analyzer reports comparisons of a *slog.Logger value with nil.
var Analyzer = &analysis.Analyzer{
	Name: "nonillogger",
	Doc:  "report comparisons of a *slog.Logger value with nil",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			if comparison, isBinary := node.(*ast.BinaryExpr); isBinary {
				reportNilLoggerCheck(pass, comparison)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportNilLoggerCheck(pass *analysis.Pass, comparison *ast.BinaryExpr) {
	if comparison.Op != token.EQL && comparison.Op != token.NEQ {
		return
	}
	if comparesLoggerWithNil(pass.TypesInfo, comparison.X, comparison.Y) ||
		comparesLoggerWithNil(pass.TypesInfo, comparison.Y, comparison.X) {
		pass.Reportf(comparison.Pos(), diagnosticMessage)
	}
}

func comparesLoggerWithNil(typeInfo *types.Info, operand ast.Expr, other ast.Expr) bool {
	return typeInfo.Types[other].IsNil() && isLoggerPointer(typeInfo.TypeOf(operand))
}

func isLoggerPointer(operandType types.Type) bool {
	pointer, isPointer := types.Unalias(operandType).(*types.Pointer)
	if !isPointer {
		return false
	}
	named, isNamed := types.Unalias(pointer.Elem()).(*types.Named)
	return isNamed && named.Obj().Pkg() != nil &&
		named.Obj().Pkg().Path() == "log/slog" && named.Obj().Name() == "Logger"
}
