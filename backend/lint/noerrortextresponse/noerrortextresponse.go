// Package noerrortextresponse reports error text written to HTTP responses.
package noerrortextresponse

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const diagnosticMessage = "send a fixed public message instead of this error text; " +
	"parser and provider error text can contain private URLs and storage keys"

// Analyzer reports Error() calls in the arguments of a call that writes an HTTP response.
var Analyzer = &analysis.Analyzer{
	Name: "noerrortextresponse",
	Doc:  "report Error() calls in the arguments of a call that takes or acts on an http.ResponseWriter",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	errorType, _ := types.Universe.Lookup("error").Type().Underlying().(*types.Interface)
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			if call, isCall := node.(*ast.CallExpr); isCall && writesResponse(pass.TypesInfo, call) {
				reportErrorTextArguments(pass, errorType, call)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

// writesResponse reports whether call takes an http.ResponseWriter argument or is a
// method called on an http.ResponseWriter.
func writesResponse(typeInfo *types.Info, call *ast.CallExpr) bool {
	if selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr); isSelector {
		if selection, isMethod := typeInfo.Selections[selector]; isMethod && isResponseWriter(selection.Recv()) {
			return true
		}
	}
	function, isFunction := typeutil.Callee(typeInfo, call).(*types.Func)
	if !isFunction {
		return false
	}
	for parameter := range function.Signature().Params().Variables() {
		if isResponseWriter(parameter.Type()) {
			return true
		}
	}
	return false
}

func reportErrorTextArguments(pass *analysis.Pass, errorType *types.Interface, call *ast.CallExpr) {
	for _, argument := range call.Args {
		for node := range ast.Preorder(argument) {
			if isErrorTextCall(pass.TypesInfo, errorType, node) {
				pass.Reportf(node.Pos(), diagnosticMessage)
			}
		}
	}
}

// isErrorTextCall reports whether node is a call of Error() on a value that implements error.
func isErrorTextCall(typeInfo *types.Info, errorType *types.Interface, node ast.Node) bool {
	call, isCall := node.(*ast.CallExpr)
	if !isCall || len(call.Args) != 0 {
		return false
	}
	selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	return isSelector && selector.Sel.Name == "Error" && types.Implements(typeInfo.TypeOf(selector.X), errorType)
}

func isResponseWriter(valueType types.Type) bool {
	named, isNamed := types.Unalias(valueType).(*types.Named)
	return isNamed && named.Obj().Pkg() != nil &&
		named.Obj().Pkg().Path() == "net/http" && named.Obj().Name() == "ResponseWriter"
}
