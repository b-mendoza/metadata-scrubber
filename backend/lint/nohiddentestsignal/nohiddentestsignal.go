// Package nohiddentestsignal reports calls that hide test failures.
package nohiddentestsignal

import (
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

// Analyzer reports test skips and sleeps in Go test files.
var Analyzer = &analysis.Analyzer{
	Name: "nohiddentestsignal",
	Doc:  "report test skips and sleeps in Go test files",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if !strings.HasSuffix(pass.Fset.File(file.FileStart).Name(), "_test.go") {
			continue
		}

		inspectTestFile(pass, file)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func inspectTestFile(pass *analysis.Pass, file *ast.File) {
	for node := range ast.Preorder(file) {
		call, isCall := node.(*ast.CallExpr)
		if !isCall {
			continue
		}

		selector, isSelector := call.Fun.(*ast.SelectorExpr)
		if !isSelector {
			continue
		}

		function, _ := pass.TypesInfo.ObjectOf(selector.Sel).(*types.Func)
		if function == nil || function.Pkg() == nil {
			continue
		}

		reportForbiddenCall(pass, selector, function)
	}
}

func reportForbiddenCall(pass *analysis.Pass, selector *ast.SelectorExpr, function *types.Func) {
	switch function.Pkg().Path() + "." + function.Name() {
	case "testing.Skip", "testing.Skipf", "testing.SkipNow":
		pass.Reportf(selector.Sel.Pos(), "remove t.%s; make the test prerequisite explicit and fail when it is missing", function.Name())
	case "time.Sleep":
		pass.Reportf(selector.Sel.Pos(), "replace time.Sleep with synchronization on the condition that the test needs")
	}
}
