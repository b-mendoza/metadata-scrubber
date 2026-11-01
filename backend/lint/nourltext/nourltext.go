// Package nourltext reports URLs built by joining text.
package nourltext

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const diagnosticMessage = "build this URL with url.URL and set each part in its own field; " +
	"joining URL text lets input change the scheme, host, or path"

// Analyzer reports text joins and fmt.Sprintf formats that start with an HTTP URL scheme.
var Analyzer = &analysis.Analyzer{
	Name: "nourltext",
	Doc:  "report URLs built by joining text that starts with an HTTP URL scheme",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		for node := range ast.Preorder(file) {
			switch expression := node.(type) {
			case *ast.BinaryExpr:
				reportJoinedURL(pass, expression)
			case *ast.CallExpr:
				reportFormattedURL(pass, expression)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportJoinedURL(pass *analysis.Pass, join *ast.BinaryExpr) {
	if join.Op != token.ADD || pass.TypesInfo.Types[join].Value != nil {
		return
	}
	if startsWithURLScheme(pass.TypesInfo, join.X) {
		pass.Reportf(join.Pos(), diagnosticMessage)
	}
}

func reportFormattedURL(pass *analysis.Pass, call *ast.CallExpr) {
	function, isFunction := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !isFunction || function.Pkg() == nil || function.Pkg().Path() != "fmt" || function.Name() != "Sprintf" {
		return
	}
	if len(call.Args) > 1 && startsWithURLScheme(pass.TypesInfo, call.Args[0]) {
		pass.Reportf(call.Pos(), diagnosticMessage)
	}
}

func startsWithURLScheme(typeInfo *types.Info, expression ast.Expr) bool {
	value := typeInfo.Types[expression].Value
	if value == nil || value.Kind() != constant.String {
		return false
	}
	text := strings.ToLower(constant.StringVal(value))
	return strings.HasPrefix(text, "http://") || strings.HasPrefix(text, "https://")
}
