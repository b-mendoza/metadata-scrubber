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
	"Skip":    "remove t.Skip; make the test prerequisite explicit and fail when it is missing",
	"Skipf":   "remove t.Skipf; make the test prerequisite explicit and fail when it is missing",
	"SkipNow": "remove t.SkipNow; make the test prerequisite explicit and fail when it is missing",
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
		pass.Reportf(selector.Sel.Pos(), "replace time.Sleep with synchronization on the condition that the test needs")
	}
}
