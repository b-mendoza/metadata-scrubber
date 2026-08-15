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
	marker            = "policy:allow-any"
	diagnosticMessage = "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
)

type sourceRange struct {
	start token.Pos
	end   token.Pos
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
		exemptions := collectExemptions(file)
		reportEmptyInterfaces(pass, file, universeAny, exemptions)
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
	exemptions []sourceRange,
) {
	for node := range ast.Preorder(root) {
		if identifier, isIdentifier := node.(*ast.Ident); isIdentifier {
			reportIdentifier(pass, identifier, universeAny, exemptions)
			continue
		}

		if interfaceType, isInterfaceType := node.(*ast.InterfaceType); isInterfaceType {
			reportInterfaceType(pass, interfaceType, exemptions)
		}
	}
}

func reportIdentifier(
	pass *analysis.Pass,
	identifier *ast.Ident,
	universeAny types.Object,
	exemptions []sourceRange,
) {
	if identifier.Name == "any" && pass.TypesInfo.Uses[identifier] == universeAny {
		reportUnlessExempt(pass, identifier.Pos(), exemptions)
		return
	}
	if denotesEmptyInterface(identifier, pass.TypesInfo) {
		reportUnlessExempt(pass, identifier.Pos(), exemptions)
	}
}

func reportInterfaceType(pass *analysis.Pass, interfaceType *ast.InterfaceType, exemptions []sourceRange) {
	if len(interfaceType.Methods.List) == 0 {
		reportUnlessExempt(pass, interfaceType.Interface, exemptions)
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

func reportUnlessExempt(pass *analysis.Pass, position token.Pos, exemptions []sourceRange) {
	if isExempt(position, exemptions) {
		return
	}
	pass.Reportf(position, diagnosticMessage)
}

func isExempt(position token.Pos, exemptions []sourceRange) bool {
	for _, exemption := range exemptions {
		if exemption.start <= position && position <= exemption.end {
			return true
		}
	}
	return false
}
