// Package noemptyinterface reports empty interface types.
package noemptyinterface

import (
	"go/ast"
	"go/token"
	"go/types"
	"slices"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const (
	allowAnyMarkerPrefix           = "policy:allow-any: "
	typeParameterDiagnosticMessage = "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
	valueDiagnosticMessage         = "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

type sourceRange struct {
	start token.Pos
	end   token.Pos
}

type diagnosticPolicy struct {
	constraintTermPositions map[token.Pos]struct{}
	exemptionRanges         []sourceRange
}

// Analyzer reports empty interface types.
var Analyzer = &analysis.Analyzer{
	Name: "noemptyinterface",
	Doc:  "report empty interface types unless an attached //policy:allow-any: <reason> marker exempts the containing declaration",
	Run:  run,
}

//policy:allow-any: the x/tools analysis API fixes this return type.
func run(pass *analysis.Pass) (any, error) {
	universeAny := types.Universe.Lookup("any")

	for _, file := range pass.Files {
		policy := diagnosticPolicy{
			constraintTermPositions: collectConstraintTermPositions(file),
			exemptionRanges:         collectExemptionRanges(file),
		}
		reportEmptyInterfaces(pass, file, universeAny, policy)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func collectExemptionRanges(file *ast.File) []sourceRange {
	ranges := make([]sourceRange, 0)
	for node := range ast.Preorder(file) {
		exemption, isMarked := exemptionRangeForNode(node)
		if isMarked {
			ranges = append(ranges, exemption)
		}
	}

	return ranges
}

func exemptionRangeForNode(node ast.Node) (sourceRange, bool) {
	if declaration, isFunctionDeclaration := node.(*ast.FuncDecl); isFunctionDeclaration {
		return functionExemptionRange(declaration)
	}
	if declaration, isGeneralDeclaration := node.(*ast.GenDecl); isGeneralDeclaration {
		return markedNodeRange(declaration, declaration.Doc)
	}
	if specification, isTypeSpecification := node.(*ast.TypeSpec); isTypeSpecification {
		return markedNodeRange(specification, specification.Doc, specification.Comment)
	}
	if specification, isValueSpecification := node.(*ast.ValueSpec); isValueSpecification {
		return markedNodeRange(specification, specification.Doc, specification.Comment)
	}
	if field, isField := node.(*ast.Field); isField {
		return markedNodeRange(field, field.Doc, field.Comment)
	}

	return sourceRange{}, false
}

func functionExemptionRange(declaration *ast.FuncDecl) (sourceRange, bool) {
	if !hasAllowAnyMarker(declaration.Doc) {
		return sourceRange{}, false
	}

	end := declaration.End()
	if declaration.Body != nil {
		end = declaration.Body.Lbrace
	}

	return sourceRange{start: declaration.Pos(), end: end}, true
}

func markedNodeRange(node ast.Node, commentGroups ...*ast.CommentGroup) (sourceRange, bool) {
	if !hasAllowAnyMarker(commentGroups...) {
		return sourceRange{}, false
	}

	return sourceRange{start: node.Pos(), end: node.End()}, true
}

func hasAllowAnyMarker(commentGroups ...*ast.CommentGroup) bool {
	for _, commentGroup := range commentGroups {
		if commentGroup != nil && slices.ContainsFunc(commentGroup.List, isAllowAnyMarker) {
			return true
		}
	}

	return false
}

func isAllowAnyMarker(comment *ast.Comment) bool {
	if !strings.HasPrefix(comment.Text, "//") {
		return false
	}

	text := strings.TrimSpace(strings.TrimPrefix(comment.Text, "//"))
	reason, hasPrefix := strings.CutPrefix(text, allowAnyMarkerPrefix)

	return hasPrefix && reason != "" && strings.TrimSpace(reason) == reason
}

func isExempt(position token.Pos, ranges []sourceRange) bool {
	for _, exemption := range ranges {
		if exemption.start <= position && position <= exemption.end {
			return true
		}
	}

	return false
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
	policy diagnosticPolicy,
) {
	for node := range ast.Preorder(root) {
		if identifier, isIdentifier := node.(*ast.Ident); isIdentifier {
			reportIdentifier(pass, identifier, universeAny, policy)
			continue
		}

		if interfaceType, isInterfaceType := node.(*ast.InterfaceType); isInterfaceType {
			reportInterfaceType(pass, interfaceType, policy)
		}
	}
}

func reportIdentifier(
	pass *analysis.Pass,
	identifier *ast.Ident,
	universeAny types.Object,
	policy diagnosticPolicy,
) {
	if identifier.Name == "any" && pass.TypesInfo.Uses[identifier] == universeAny {
		reportDiagnostic(pass, identifier.Pos(), policy)
		return
	}
	if denotesEmptyInterface(identifier, pass.TypesInfo) {
		reportDiagnostic(pass, identifier.Pos(), policy)
	}
}

func reportInterfaceType(
	pass *analysis.Pass,
	interfaceType *ast.InterfaceType,
	policy diagnosticPolicy,
) {
	if len(interfaceType.Methods.List) == 0 {
		reportDiagnostic(pass, interfaceType.Interface, policy)
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
	policy diagnosticPolicy,
) {
	if isExempt(position, policy.exemptionRanges) {
		return
	}
	if _, isConstraintTerm := policy.constraintTermPositions[position]; isConstraintTerm {
		pass.Reportf(position, typeParameterDiagnosticMessage)
		return
	}
	pass.Reportf(position, valueDiagnosticMessage)
}
