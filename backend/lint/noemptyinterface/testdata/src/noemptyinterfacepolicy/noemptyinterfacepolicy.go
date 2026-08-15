package noemptyinterfacepolicy

import "noemptyinterfacealiases"

// policy:allow-any -- this function accepts an empty interface at its boundary.
func markedLiteralFunction(value interface{}) {}

func unmarkedSiblingFunction(value interface{}) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

// policy:allow-any -- this function accepts values from an untyped source.
func markedAnyFunction(value any) {}

// policy:allow-any -- this function accepts an empty interface in its signature.
func signatureOnly(value any) {
	var leaked any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	_ = leaked

	// policy:allow-any -- this local value comes from an untyped source.
	var allowedLocal any
	_ = allowedLocal
}

// policy:allow-any -- this declaration groups values from an untyped source.
var (
	groupedValue        any
	groupedLiteralValue interface{}
)

func markedLocalDeclaration() {
	// policy:allow-any -- this declaration groups local values from an untyped source.
	var (
		groupedLocal        any
		groupedLocalLiteral interface{}
	)
	_, _ = groupedLocal, groupedLocalLiteral
}

type (
	// policy:allow-any -- this type keeps values from an untyped source.
	markedType   any
	unmarkedType any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

type trailingMarkedType any // policy:allow-any -- this type keeps values from an untyped source.

type markerFields struct {
	// policy:allow-any -- this field receives data from an untyped source.
	documentedField any
	unmarkedField   any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

	trailingField         any // policy:allow-any -- this field receives data from an untyped source.
	unmarkedTrailingField any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

var (
	// policy:allow-any -- this value receives data from an untyped source.
	documentedValue any
	unmarkedValue   any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

var trailingValue any // policy:allow-any -- this value receives data from an untyped source.

//policy:allow-any
func bareMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any:
func emptyReasonMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-anything: this token is longer than the marker.
func longerTokenMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any:this marker has no space after the second colon.
func missingSpaceMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

// policy:allow-any: this is the old colon form.
func oldColonMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any -- this marker has no space after the comment token.
func noCommentSpaceMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

// policy:allow-any --
func newEmptyReasonMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

// policy:allow-any --  this marker has two spaces before the reason.
func extraReasonSpaceMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

var selectedDynamicValue noemptyinterfacealiases.Dynamic // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

var selectedDynamicValue2 noemptyinterfacealiases.Dynamic2 // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

type embeddedAny interface {
	any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func comparableConstraint[T comparable](value T) {}

type nonEmpty interface {
	M()
}

var standardError error
