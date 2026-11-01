// Package nopartialrecordassert reports partial membership checks on slices of records in tests.
package nopartialrecordassert

import (
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const diagnosticMessage = "compare the complete slice with require.Equal, or with require.ElementsMatch when its order is not deterministic; " +
	"a membership check on a slice of records misses an extra record, such as a false success log"

var checkedPackages = map[string]bool{
	"github.com/stretchr/testify/assert":  true,
	"github.com/stretchr/testify/require": true,
}

var membershipChecks = map[string]bool{
	"Contains":     true,
	"Containsf":    true,
	"NotContains":  true,
	"NotContainsf": true,
}

// Analyzer reports testify Contains and NotContains checks on slices of structs in Go test files.
var Analyzer = &analysis.Analyzer{
	Name: "nopartialrecordassert",
	Doc:  "report testify Contains and NotContains checks on slices or arrays of structs in Go test files",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if !strings.HasSuffix(pass.Fset.File(file.FileStart).Name(), "_test.go") {
			continue
		}
		for node := range ast.Preorder(file) {
			if call, isCall := node.(*ast.CallExpr); isCall {
				reportMembershipCheck(pass, call)
			}
		}
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportMembershipCheck(pass *analysis.Pass, call *ast.CallExpr) {
	function, isFunction := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !isFunction || function.Pkg() == nil || !checkedPackages[function.Pkg().Path()] || !membershipChecks[function.Name()] {
		return
	}
	// Package functions take the test value first. Assertions methods do not.
	containerIndex := 1
	if function.Signature().Recv() != nil {
		containerIndex = 0
	}
	if containerIndex < len(call.Args) && holdsRecords(pass.TypesInfo.TypeOf(call.Args[containerIndex])) {
		pass.Reportf(call.Pos(), diagnosticMessage)
	}
}

func holdsRecords(containerType types.Type) bool {
	if containerType == nil {
		return false
	}
	var element types.Type
	switch container := containerType.Underlying().(type) {
	case *types.Slice:
		element = container.Elem()
	case *types.Array:
		element = container.Elem()
	default:
		return false
	}
	if pointer, isPointer := element.Underlying().(*types.Pointer); isPointer {
		element = pointer.Elem()
	}
	_, isStruct := element.Underlying().(*types.Struct)
	return isStruct
}
