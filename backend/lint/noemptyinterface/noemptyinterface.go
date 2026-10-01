// Package noemptyinterface reports empty interface types.
package noemptyinterface

import (
	"go/ast"
	"go/token"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

const (
	typeParameterDiagnosticMessage = "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
	valueDiagnosticMessage         = "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

// Analyzer reports empty interface types.
var Analyzer = &analysis.Analyzer{
	Name: "noemptyinterface",
	Doc:  "report empty interface types",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		constraintTerms := collectConstraintTermPositions(file)
		reportEmptyInterfaces(pass, file, constraintTerms)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func collectConstraintTermPositions(file *ast.File) map[token.Pos]struct{} {
	positions := make(map[token.Pos]struct{})
	for node := range ast.Preorder(file) {
		if functionType, isFunctionType := node.(*ast.FuncType); isFunctionType {
			appendConstraintTermPositions(positions, functionType.TypeParams)
		}
		if typeSpecification, isTypeSpecification := node.(*ast.TypeSpec); isTypeSpecification {
			appendConstraintTermPositions(positions, typeSpecification.TypeParams)
		}
	}
	return positions
}

func appendConstraintTermPositions(positions map[token.Pos]struct{}, typeParameters *ast.FieldList) {
	if typeParameters == nil {
		return
	}
	for _, field := range typeParameters.List {
		appendConstraintExpressionPositions(positions, field.Type)
	}
}

func appendConstraintExpressionPositions(positions map[token.Pos]struct{}, expression ast.Expr) {
	positions[typeParameterConstraintPosition(expression)] = struct{}{}
	expression = ast.Unparen(expression)

	if union, isUnion := expression.(*ast.BinaryExpr); isUnion && union.Op == token.OR {
		appendConstraintExpressionPositions(positions, union.X)
		appendConstraintExpressionPositions(positions, union.Y)
		return
	}

	if interfaceType, isInterfaceType := expression.(*ast.InterfaceType); isInterfaceType {
		appendEmbeddedConstraintPositions(positions, interfaceType)
	}
}

func appendEmbeddedConstraintPositions(positions map[token.Pos]struct{}, interfaceType *ast.InterfaceType) {
	for _, field := range interfaceType.Methods.List {
		if len(field.Names) == 0 {
			appendConstraintExpressionPositions(positions, field.Type)
		}
	}
}

func typeParameterConstraintPosition(expression ast.Expr) token.Pos {
	for {
		switch term := ast.Unparen(expression).(type) {
		case *ast.IndexExpr:
			expression = term.X
		case *ast.IndexListExpr:
			expression = term.X
		case *ast.SelectorExpr:
			return term.Sel.Pos()
		default:
			return term.Pos()
		}
	}
}

func reportEmptyInterfaces(pass *analysis.Pass, root ast.Node, constraintTerms map[token.Pos]struct{}) {
	for node := range ast.Preorder(root) {
		if identifier, isIdentifier := node.(*ast.Ident); isIdentifier && denotesEmptyInterface(identifier, pass.TypesInfo) {
			reportDiagnostic(pass, identifier.Pos(), constraintTerms)
		}
		if interfaceType, isInterfaceType := node.(*ast.InterfaceType); isInterfaceType && len(interfaceType.Methods.List) == 0 {
			reportDiagnostic(pass, interfaceType.Interface, constraintTerms)
		}
	}
}

func denotesEmptyInterface(identifier *ast.Ident, typeInfo *types.Info) bool {
	typeName, isTypeName := typeInfo.Uses[identifier].(*types.TypeName)
	if !isTypeName {
		return false
	}

	typeOfName := types.Unalias(typeName.Type())
	if _, isTypeParameter := typeOfName.(*types.TypeParam); isTypeParameter {
		return false
	}

	underlyingType := typeOfName.Underlying()
	interfaceType, isInterface := underlyingType.(*types.Interface)
	return isInterface && interfaceType.Empty()
}

func reportDiagnostic(
	pass *analysis.Pass,
	position token.Pos,
	constraintTerms map[token.Pos]struct{},
) {
	if _, isConstraintTerm := constraintTerms[position]; isConstraintTerm {
		pass.Reportf(position, typeParameterDiagnosticMessage)
		return
	}
	pass.Reportf(position, valueDiagnosticMessage)
}
