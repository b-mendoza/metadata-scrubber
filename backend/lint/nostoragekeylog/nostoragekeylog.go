// Package nostoragekeylog reports raw storage keys in log calls.
package nostoragekeylog

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const (
	storageKeyTypeName = "storageKey"
	digestMethodName   = "digest"
	diagnosticMessage  = "log storageKey.digest() instead of the raw storage key; " +
		"the key identifies a stored object, and its digest lets logs follow one file without exposing it"
)

// Analyzer reports values of a type named storageKey, or values that contain one, in the
// arguments of log/slog calls. The storageKey digest method is the allowed way to log a key.
var Analyzer = &analysis.Analyzer{
	Name: "nostoragekeylog",
	Doc:  "report storageKey values, or values that contain one, in the arguments of log/slog calls",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			if call, isCall := node.(*ast.CallExpr); isCall && callsSlog(pass.TypesInfo, call) {
				reportRawKeyArguments(pass, call)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func callsSlog(typeInfo *types.Info, call *ast.CallExpr) bool {
	function, isFunction := typeutil.Callee(typeInfo, call).(*types.Func)
	return isFunction && function.Pkg() != nil && function.Pkg().Path() == "log/slog"
}

func reportRawKeyArguments(pass *analysis.Pass, call *ast.CallExpr) {
	for _, argument := range call.Args {
		reportRawKeys(pass, argument)
	}
}

func reportRawKeys(pass *analysis.Pass, argument ast.Expr) {
	ast.Inspect(argument, func(node ast.Node) bool {
		expression, isExpression := node.(ast.Expr)
		if !isExpression || isDigestMethod(pass.TypesInfo, expression) {
			return false
		}
		// A nested log/slog call, such as slog.String, gets its own check in run.
		if nestedCall, isCall := expression.(*ast.CallExpr); isCall && callsSlog(pass.TypesInfo, nestedCall) {
			return false
		}
		if containsStorageKey(pass.TypesInfo.TypeOf(expression), map[types.Type]bool{}) {
			pass.Reportf(expression.Pos(), diagnosticMessage)
			return false
		}
		// A field selection logs only the selected field, so the rest of the struct does not matter.
		return !isFieldSelection(pass.TypesInfo, expression)
	})
}

func isFieldSelection(typeInfo *types.Info, expression ast.Expr) bool {
	selector, isSelector := expression.(*ast.SelectorExpr)
	if !isSelector {
		return false
	}
	selection, isSelection := typeInfo.Selections[selector]
	return isSelection && selection.Kind() == types.FieldVal
}

func isDigestMethod(typeInfo *types.Info, expression ast.Expr) bool {
	selector, isSelector := expression.(*ast.SelectorExpr)
	if !isSelector || selector.Sel.Name != digestMethodName {
		return false
	}
	selection, isSelection := typeInfo.Selections[selector]
	return isSelection && selection.Kind() == types.MethodVal && isStorageKey(selection.Recv())
}

// containsStorageKey reports whether valueType is a storageKey or holds one in a field,
// element, map key, or pointer target.
func containsStorageKey(valueType types.Type, visited map[types.Type]bool) bool {
	if valueType == nil || visited[valueType] {
		return false
	}
	visited[valueType] = true
	if isStorageKey(valueType) {
		return true
	}
	for _, heldType := range heldTypes(valueType) {
		if containsStorageKey(heldType, visited) {
			return true
		}
	}
	return false
}

// heldTypes returns the types that a value of valueType holds directly.
func heldTypes(valueType types.Type) []types.Type {
	switch underlying := valueType.Underlying().(type) {
	case *types.Pointer:
		return []types.Type{underlying.Elem()}
	case *types.Slice:
		return []types.Type{underlying.Elem()}
	case *types.Array:
		return []types.Type{underlying.Elem()}
	case *types.Map:
		return []types.Type{underlying.Key(), underlying.Elem()}
	case *types.Struct:
		var fieldTypes []types.Type
		for field := range underlying.Fields() {
			fieldTypes = append(fieldTypes, field.Type())
		}
		return fieldTypes
	default:
		return nil
	}
}

func isStorageKey(valueType types.Type) bool {
	if pointer, isPointer := types.Unalias(valueType).(*types.Pointer); isPointer {
		valueType = pointer.Elem()
	}
	named, isNamed := types.Unalias(valueType).(*types.Named)
	return isNamed && named.Obj().Name() == storageKeyTypeName
}
