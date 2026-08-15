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
	universeAny := types.Universe.Lookup("any")

	for _, file := range pass.Files {
		reportEmptyInterfaces(pass, file, universeAny, collectConstraintTermPositions(file))
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
	expression = unparenthesized(expression)

	if union, isUnion := expression.(*ast.BinaryExpr); isUnion && union.Op == token.OR {
		appendConstraintExpressionPositions(positions, union.X)
		appendConstraintExpressionPositions(positions, union.Y)
		return
	}

	if interfaceType, isInterfaceType := expression.(*ast.InterfaceType); isInterfaceType {
		appendEmbeddedConstraintPositions(positions, interfaceType)
	}
}

func unparenthesized(expression ast.Expr) ast.Expr {
	for {
		parenthesized, isParenthesized := expression.(*ast.ParenExpr)
		if !isParenthesized {
			return expression
		}
		expression = parenthesized.X
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
		parenthesized, isParenthesized := expression.(*ast.ParenExpr)
		if isParenthesized {
			expression = parenthesized.X
			continue
		}
		indexed, isIndexed := expression.(*ast.IndexExpr)
		if isIndexed {
			expression = indexed.X
			continue
		}
		indexList, isIndexList := expression.(*ast.IndexListExpr)
		if isIndexList {
			expression = indexList.X
			continue
		}
		break
	}
	selector, isSelector := expression.(*ast.SelectorExpr)
	if isSelector {
		return selector.Sel.Pos()
	}
	return expression.Pos()
}

func reportEmptyInterfaces(
	pass *analysis.Pass,
	root ast.Node,
	universeAny types.Object,
	constraintTermPositions map[token.Pos]struct{},
) {
	for node := range ast.Preorder(root) {
		if identifier, isIdentifier := node.(*ast.Ident); isIdentifier {
			reportIdentifier(pass, identifier, universeAny, constraintTermPositions)
			continue
		}

		if interfaceType, isInterfaceType := node.(*ast.InterfaceType); isInterfaceType {
			reportInterfaceType(pass, interfaceType, constraintTermPositions)
		}
	}
}

func reportIdentifier(
	pass *analysis.Pass,
	identifier *ast.Ident,
	universeAny types.Object,
	constraintTermPositions map[token.Pos]struct{},
) {
	if identifier.Name == "any" && pass.TypesInfo.Uses[identifier] == universeAny {
		reportDiagnostic(pass, identifier.Pos(), constraintTermPositions)
		return
	}
	if denotesEmptyInterface(identifier, pass.TypesInfo) {
		reportDiagnostic(pass, identifier.Pos(), constraintTermPositions)
	}
}

func reportInterfaceType(
	pass *analysis.Pass,
	interfaceType *ast.InterfaceType,
	constraintTermPositions map[token.Pos]struct{},
) {
	if len(interfaceType.Methods.List) == 0 {
		reportDiagnostic(pass, interfaceType.Interface, constraintTermPositions)
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
	constraintTermPositions map[token.Pos]struct{},
) {
	if _, isConstraintTerm := constraintTermPositions[position]; isConstraintTerm {
		pass.Reportf(position, typeParameterDiagnosticMessage)
		return
	}
	pass.Reportf(position, valueDiagnosticMessage)
}
