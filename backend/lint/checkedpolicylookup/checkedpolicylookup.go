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
	diagnosticMessage = "use the comma-ok form (value, ok := m[key]) and handle the missing key; this map is marked //policy:map"
)

// Analyzer reports unchecked index expressions for maps marked with //policy:map.
var Analyzer = &analysis.Analyzer{
	Name: "checkedpolicylookup",
	Doc:  "report unchecked lookups in maps marked with //policy:map",
	Run:  run,
}

func run(pass *analysis.Pass) (any, error) {
	policyMaps := collectPolicyMaps(pass)
	checkedLookups := make(map[*ast.IndexExpr]bool)

	for _, file := range pass.Files {
		reportUncheckedLookups(pass, file, policyMaps, checkedLookups)
	}

	return nil, nil //nolint:nilnil // An analyzer without ResultType must return a nil result.
}

//nolint:gocognit // Keep the preorder checks together so checked nodes are marked before their index child.
func reportUncheckedLookups(
	pass *analysis.Pass,
	file *ast.File,
	policyMaps map[types.Object]bool,
	checkedLookups map[*ast.IndexExpr]bool,
) {
	for node := range ast.Preorder(file) {
		assignment, isAssignment := node.(*ast.AssignStmt)
		if isAssignment {
			markCheckedAssignmentLookup(checkedLookups, assignment)
		}

		valueSpecification, isValueSpecification := node.(*ast.ValueSpec)
		if isValueSpecification {
			markCheckedValueSpecificationLookup(checkedLookups, valueSpecification)
		}

		indexExpression, isIndexExpression := node.(*ast.IndexExpr)
		if !isIndexExpression || checkedLookups[indexExpression] {
			continue
		}

		identifier, isIdentifier := indexExpression.X.(*ast.Ident)
		if isIdentifier && policyMaps[pass.TypesInfo.Uses[identifier]] {
			pass.Reportf(indexExpression.Lbrack, diagnosticMessage)
		}
	}
}

//nolint:cyclop,gocognit // Keep the marked declaration scan inline so ast.Inspect can prune its subtree.
func collectPolicyMaps(pass *analysis.Pass) map[types.Object]bool {
	policyMaps := make(map[types.Object]bool)

	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			declaration, isDeclaration := node.(*ast.GenDecl)
			if !isDeclaration || !hasMarker(declaration.Doc) {
				return true
			}

			for _, specification := range declaration.Specs {
				valueSpecification, isValueSpecification := specification.(*ast.ValueSpec)
				if !isValueSpecification {
					continue
				}

				for _, name := range valueSpecification.Names {
					object := pass.TypesInfo.Defs[name]
					if object == nil {
						continue
					}

					_, isMapType := object.Type().Underlying().(*types.Map)
					if isMapType {
						policyMaps[object] = true
					}
				}
			}

			return false
		})
	}

	return policyMaps
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

func markCheckedAssignmentLookup(
	checkedLookups map[*ast.IndexExpr]bool,
	assignment *ast.AssignStmt,
) {
	if len(assignment.Lhs) != 2 {
		return
	}

	markCheckedLookup(checkedLookups, assignment.Lhs[1], assignment.Rhs)
}

func markCheckedValueSpecificationLookup(
	checkedLookups map[*ast.IndexExpr]bool,
	valueSpecification *ast.ValueSpec,
) {
	if len(valueSpecification.Names) != 2 {
		return
	}

	markCheckedLookup(checkedLookups, valueSpecification.Names[1], valueSpecification.Values)
}

func markCheckedLookup(
	checkedLookups map[*ast.IndexExpr]bool,
	secondLeftItem ast.Expr,
	rightExpressions []ast.Expr,
) {
	identifier, isIdentifier := secondLeftItem.(*ast.Ident)
	if (isIdentifier && identifier.Name == "_") || len(rightExpressions) != 1 {
		return
	}

	indexExpression, isIndexExpression := rightExpressions[0].(*ast.IndexExpr)
	if isIndexExpression {
		checkedLookups[indexExpression] = true
	}
}
