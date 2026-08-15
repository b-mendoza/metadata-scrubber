// Package noemptyinterface reports empty interface types.
package noemptyinterface

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const (
	marker                         = "policy:allow-any"
	typeParameterDiagnosticMessage = "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
	valueDiagnosticMessage         = "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

type sourceRange struct {
	start token.Pos
	end   token.Pos
}

type diagnosticRanges struct {
	exemptions              []sourceRange
	constraintTermPositions map[token.Pos]struct{}
}

// Analyzer reports empty interface types without a policy marker.
var Analyzer = &analysis.Analyzer{
	Name: "noemptyinterface",
	Doc:  "report empty interface types without a policy marker",
	Run:  run,
}

//policy:allow-any: the x/tools analysis API fixes this return type.
func run(pass *analysis.Pass) (any, error) {
	universeAny := types.Universe.Lookup("any")

	for _, file := range pass.Files {
		ranges := diagnosticRanges{
			exemptions:              collectExemptions(file),
			constraintTermPositions: collectConstraintTermPositions(file),
		}
		reportEmptyInterfaces(pass, file, universeAny, ranges)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func collectExemptions(file *ast.File) []sourceRange {
	var exemptions []sourceRange
	for node := range ast.Preorder(file) {
		if nodeHasMarker(node) {
			end := node.End()
			if declaration, isFunction := node.(*ast.FuncDecl); isFunction && declaration.Body != nil {
				end = declaration.Body.Lbrace
			}
			exemptions = append(exemptions, sourceRange{start: node.Pos(), end: end})
		}
	}
	return exemptions
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

func nodeHasMarker(node ast.Node) bool {
	doc, comment := attachedComments(node)
	return hasMarker(doc) || hasMarker(comment)
}

func attachedComments(node ast.Node) (*ast.CommentGroup, *ast.CommentGroup) {
	if declaration, isFunction := node.(*ast.FuncDecl); isFunction {
		return declaration.Doc, nil
	}
	if declaration, isGeneral := node.(*ast.GenDecl); isGeneral {
		return declaration.Doc, nil
	}
	if spec, isType := node.(*ast.TypeSpec); isType {
		return spec.Doc, spec.Comment
	}
	if spec, isValue := node.(*ast.ValueSpec); isValue {
		return spec.Doc, spec.Comment
	}
	if field, isField := node.(*ast.Field); isField {
		return field.Doc, field.Comment
	}
	return nil, nil
}

func hasMarker(commentGroup *ast.CommentGroup) bool {
	if commentGroup == nil {
		return false
	}

	for _, comment := range commentGroup.List {
		commentText, isLineComment := strings.CutPrefix(comment.Text, "//")
		if !isLineComment {
			continue
		}
		commentText = strings.TrimSpace(commentText)
		reason, hasPrefix := strings.CutPrefix(commentText, marker+": ")
		if hasPrefix && reason != "" && strings.TrimSpace(reason) == reason {
			return true
		}
	}

	return false
}

func reportEmptyInterfaces(
	pass *analysis.Pass,
	root ast.Node,
	universeAny types.Object,
	ranges diagnosticRanges,
) {
	for node := range ast.Preorder(root) {
		if identifier, isIdentifier := node.(*ast.Ident); isIdentifier {
			reportIdentifier(pass, identifier, universeAny, ranges)
			continue
		}

		if interfaceType, isInterfaceType := node.(*ast.InterfaceType); isInterfaceType {
			reportInterfaceType(pass, interfaceType, ranges)
		}
	}
}

func reportIdentifier(
	pass *analysis.Pass,
	identifier *ast.Ident,
	universeAny types.Object,
	ranges diagnosticRanges,
) {
	if identifier.Name == "any" && pass.TypesInfo.Uses[identifier] == universeAny {
		reportUnlessExempt(pass, identifier.Pos(), ranges)
		return
	}
	if denotesEmptyInterface(identifier, pass.TypesInfo) {
		reportUnlessExempt(pass, identifier.Pos(), ranges)
	}
}

func reportInterfaceType(pass *analysis.Pass, interfaceType *ast.InterfaceType, ranges diagnosticRanges) {
	if len(interfaceType.Methods.List) == 0 {
		reportUnlessExempt(pass, interfaceType.Interface, ranges)
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

func reportUnlessExempt(pass *analysis.Pass, position token.Pos, ranges diagnosticRanges) {
	for _, exemption := range ranges.exemptions {
		if exemption.start <= position && position <= exemption.end {
			return
		}
	}
	if _, isConstraintTerm := ranges.constraintTermPositions[position]; isConstraintTerm {
		pass.Reportf(position, typeParameterDiagnosticMessage)
		return
	}
	pass.Reportf(position, valueDiagnosticMessage)
}
