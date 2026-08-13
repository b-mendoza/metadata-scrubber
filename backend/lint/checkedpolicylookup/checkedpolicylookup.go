// Package checkedpolicylookup reports unchecked lookups in marked policy maps.
package checkedpolicylookup

import (
	"go/ast"
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

const (
	marker            = "policy:map"
	diagnosticMessage = "require the comma-ok form for lookups in a //policy:map"
)

// Analyzer reports unchecked index expressions for maps marked with //policy:map.
var Analyzer = &analysis.Analyzer{
	Name: "checkedpolicylookup",
	Doc:  "report unchecked lookups in maps marked with //policy:map",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	policyMaps := collectPolicyMaps(pass)
	checkedLookups := collectCheckedLookups(pass.Files)

	for _, file := range pass.Files {
		reportUncheckedLookups(pass, file, policyMaps, checkedLookups)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

func reportUncheckedLookups(
	pass *analysis.Pass,
	file *ast.File,
	policyMaps map[types.Object]bool,
	checkedLookups map[*ast.IndexExpr]bool,
) {
	ast.Inspect(file, func(node ast.Node) bool {
		indexExpression, isIndexExpression := node.(*ast.IndexExpr)
		if !isIndexExpression || checkedLookups[indexExpression] {
			return true
		}

		identifier, isIdentifier := indexExpression.X.(*ast.Ident)
		if isIdentifier && policyMaps[pass.TypesInfo.Uses[identifier]] {
			pass.Reportf(indexExpression.Lbrack, diagnosticMessage)
		}

		return true
	})
}

func collectPolicyMaps(pass *analysis.Pass) map[types.Object]bool {
	policyMaps := make(map[types.Object]bool)

	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			declaration, isDeclaration := node.(*ast.GenDecl)
			if !isDeclaration || !hasMarker(declaration.Doc) {
				return true
			}

			collectDeclarationPolicyMaps(pass, declaration, policyMaps)

			return false
		})
	}

	return policyMaps
}

func collectDeclarationPolicyMaps(
	pass *analysis.Pass,
	declaration *ast.GenDecl,
	policyMaps map[types.Object]bool,
) {
	for _, specification := range declaration.Specs {
		valueSpecification, isValueSpecification := specification.(*ast.ValueSpec)
		if !isValueSpecification {
			continue
		}

		collectValueSpecificationPolicyMaps(pass, valueSpecification, policyMaps)
	}
}

func collectValueSpecificationPolicyMaps(
	pass *analysis.Pass,
	valueSpecification *ast.ValueSpec,
	policyMaps map[types.Object]bool,
) {
	for _, name := range valueSpecification.Names {
		object := pass.TypesInfo.Defs[name]
		if object != nil && isMap(object.Type()) {
			policyMaps[object] = true
		}
	}
}

func hasMarker(commentGroup *ast.CommentGroup) bool {
	if commentGroup == nil {
		return false
	}

	for _, comment := range commentGroup.List {
		if strings.TrimSpace(strings.TrimPrefix(comment.Text, "//")) == marker {
			return true
		}
	}

	return false
}

func isMap(valueType types.Type) bool {
	_, isMapType := valueType.Underlying().(*types.Map)

	return isMapType
}

func collectCheckedLookups(files []*ast.File) map[*ast.IndexExpr]bool {
	checkedLookups := make(map[*ast.IndexExpr]bool)

	for _, file := range files {
		ast.Inspect(file, func(node ast.Node) bool {
			assignment, isAssignment := node.(*ast.AssignStmt)
			if isAssignment {
				markCheckedLookup(checkedLookups, assignment.Lhs, assignment.Rhs)

				return true
			}

			valueSpecification, isValueSpecification := node.(*ast.ValueSpec)
			if isValueSpecification {
				markCheckedLookup(
					checkedLookups,
					identifiersAsExpressions(valueSpecification.Names),
					valueSpecification.Values,
				)
			}

			return true
		})
	}

	return checkedLookups
}

func markCheckedLookup(checkedLookups map[*ast.IndexExpr]bool, leftExpressions, rightExpressions []ast.Expr) {
	if len(leftExpressions) != 2 || len(rightExpressions) != 1 {
		return
	}

	indexExpression, isIndexExpression := rightExpressions[0].(*ast.IndexExpr)
	if isIndexExpression {
		checkedLookups[indexExpression] = true
	}
}

func identifiersAsExpressions(identifiers []*ast.Ident) []ast.Expr {
	expressions := make([]ast.Expr, len(identifiers))
	for index, identifier := range identifiers {
		expressions[index] = identifier
	}

	return expressions
}
