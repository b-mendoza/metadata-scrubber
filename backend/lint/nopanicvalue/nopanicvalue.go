// Package nopanicvalue reports uses of a recovered panic value.
package nopanicvalue

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

const diagnosticMessage = "compare the recovered panic value only with nil, or pass it to panic; " +
	"a panic value can contain private data, so record only that a panic occurred"

// Analyzer reports recovered panic values used for anything except a nil comparison or a repeated panic.
var Analyzer = &analysis.Analyzer{
	Name:     "nopanicvalue",
	Doc:      "report recovered panic values used for anything except a nil comparison or a repeated panic",
	Requires: []*analysis.Analyzer{inspect.Analyzer},
	Run:      run,
}

func run(pass *analysis.Pass) (any, error) {
	files, _ := pass.ResultOf[inspect.Analyzer].(*inspector.Inspector)
	root := files.Root()
	for call := range root.Preorder((*ast.CallExpr)(nil)) {
		if isBuiltinCall(pass.TypesInfo, call.Node(), "recover") {
			checkRecoveredValue(pass, root, call)
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func checkRecoveredValue(pass *analysis.Pass, root inspector.Cursor, call inspector.Cursor) {
	if isAllowedUse(pass.TypesInfo, call) {
		return
	}
	target := boundTarget(call)
	if target != nil && target.Name == "_" {
		return
	}
	variable, isVariable := pass.TypesInfo.ObjectOf(target).(*types.Var)
	if !isVariable {
		pass.Reportf(call.Node().Pos(), diagnosticMessage)
		return
	}
	for use := range root.Preorder((*ast.Ident)(nil)) {
		identifier, _ := use.Node().(*ast.Ident)
		if pass.TypesInfo.Uses[identifier] == variable && !isAllowedUse(pass.TypesInfo, use) {
			pass.Reportf(identifier.Pos(), diagnosticMessage)
		}
	}
}

// isAllowedUse accepts a discarded value, a nil comparison, and a repeated panic.
func isAllowedUse(typeInfo *types.Info, value inspector.Cursor) bool {
	switch parent := value.Parent().Node().(type) {
	case *ast.ExprStmt:
		return true
	case *ast.ParenExpr:
		return isAllowedUse(typeInfo, value.Parent())
	case *ast.BinaryExpr:
		return isNilComparison(typeInfo, parent)
	case *ast.CallExpr:
		return isBuiltinCall(typeInfo, parent, "panic")
	default:
		return false
	}
}

// boundTarget returns the name that receives the recovered value, or nil when the
// value goes to anything except a plain name.
func boundTarget(call inspector.Cursor) *ast.Ident {
	var targets []ast.Expr
	var values []ast.Expr
	switch parent := call.Parent().Node().(type) {
	case *ast.AssignStmt:
		targets, values = parent.Lhs, parent.Rhs
	case *ast.ValueSpec:
		for _, name := range parent.Names {
			targets = append(targets, name)
		}
		values = parent.Values
	}
	for index, value := range values {
		if value == call.Node() && index < len(targets) {
			identifier, _ := targets[index].(*ast.Ident)
			return identifier
		}
	}
	return nil
}

func isNilComparison(typeInfo *types.Info, comparison *ast.BinaryExpr) bool {
	return (comparison.Op == token.EQL || comparison.Op == token.NEQ) &&
		(typeInfo.Types[comparison.X].IsNil() || typeInfo.Types[comparison.Y].IsNil())
}

func isBuiltinCall(typeInfo *types.Info, node ast.Node, name string) bool {
	call, isCall := node.(*ast.CallExpr)
	if !isCall {
		return false
	}
	builtin, isBuiltin := typeutil.Callee(typeInfo, call).(*types.Builtin)
	return isBuiltin && builtin.Name() == name
}
