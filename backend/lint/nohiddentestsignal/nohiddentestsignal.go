// Package nohiddentestsignal reports calls that hide test failures.
package nohiddentestsignal

import (
	"go/ast"
	"go/types"
	"path/filepath"

	"golang.org/x/tools/go/analysis"
)

const (
	testingPackagePath = "testing"
	timePackagePath    = "time"
)

var forbiddenTestingMethods = map[string]string{
	"Skip":    "do not hide a failing test signal with t.Skip",
	"Skipf":   "do not hide a failing test signal with t.Skipf",
	"SkipNow": "do not hide a failing test signal with t.SkipNow",
}

// Analyzer reports test skips and sleeps in Go test files.
var Analyzer = &analysis.Analyzer{
	Name: "nohiddentestsignal",
	Doc:  "report test skips and sleeps in Go test files",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		filename := pass.Fset.PositionFor(file.Pos(), false).Filename
		if !isTestFilename(filename) {
			continue
		}

		inspectTestFile(pass, file)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func isTestFilename(filename string) bool {
	baseName := filepath.Base(filename)

	return len(baseName) > len("_test.go") && baseName[len(baseName)-len("_test.go"):] == "_test.go"
}

func inspectTestFile(pass *analysis.Pass, file *ast.File) {
	ast.Inspect(file, func(node ast.Node) bool {
		call, isCall := node.(*ast.CallExpr)
		if !isCall {
			return true
		}

		selector, isSelector := call.Fun.(*ast.SelectorExpr)
		if !isSelector {
			return true
		}

		function := selectedFunction(pass, selector)
		if function == nil || function.Pkg() == nil {
			return true
		}

		reportForbiddenCall(pass, selector, function)

		return true
	})
}

func selectedFunction(pass *analysis.Pass, selector *ast.SelectorExpr) *types.Func {
	selection := pass.TypesInfo.Selections[selector]
	if selection != nil {
		function, _ := selection.Obj().(*types.Func)

		return function
	}

	function, _ := pass.TypesInfo.Uses[selector.Sel].(*types.Func)

	return function
}

func reportForbiddenCall(pass *analysis.Pass, selector *ast.SelectorExpr, function *types.Func) {
	packagePath := function.Pkg().Path()
	if packagePath == testingPackagePath {
		message, forbidden := forbiddenTestingMethods[function.Name()]
		if forbidden {
			pass.Reportf(selector.Sel.Pos(), "%s", message)
		}

		return
	}

	if packagePath == timePackagePath && function.Name() == "Sleep" {
		pass.Reportf(selector.Sel.Pos(), "do not hide a failing test signal with time.Sleep")
	}
}
