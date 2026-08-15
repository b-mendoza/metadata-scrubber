// Package nohiddentestsignal reports calls that hide test failures.
package nohiddentestsignal

import (
	"go/ast"
	"go/types"
	"path/filepath"
	"strings"

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

//policy:allow-any: the x/tools analysis API fixes this return type.
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

	return baseName != "_test.go" && strings.HasSuffix(baseName, "_test.go")
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

		function := selectedFunction(pass, selector)
		if function == nil || function.Pkg() == nil {
			continue
		}

		reportForbiddenCall(pass, selector, function)
	}
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
