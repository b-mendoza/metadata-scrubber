package noemptyinterfacepolicy

import "noemptyinterfacealiases"

//policy:allow-any: this function accepts values from an untyped source.
func markedFunction(value any) {}

//policy:allow-any: this function accepts values from an untyped source.
func markedFunctionWithBodyLeak(value any) {
	var leaked any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	_ = leaked
}

//policy:allow-any: this function accepts values from an untyped source.
func markedFunctionWithMarkedLocal(value any) {
	//policy:allow-any: this local value receives data from an untyped source.
	var local any
	_ = local
}

func unmarkedSiblingFunction(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

type (
	//policy:allow-any: this type keeps values from an untyped source.
	markedTypeSpec           any
	unmarkedTypeSpec         any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	trailingMarkedTypeSpec   any //policy:allow-any: this type keeps values from another untyped source.
	trailingUnmarkedTypeSpec any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
)

var (
	//policy:allow-any: this value receives data from an untyped source.
	markedValueSpec           any
	unmarkedValueSpec         any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	trailingMarkedValueSpec   any //policy:allow-any: this value receives data from another untyped source.
	trailingUnmarkedValueSpec any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
)

func localDeclarationMarkers() {
	//policy:allow-any: this local value receives data from an untyped source.
	var markedLocal any
	var unmarkedLocal any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	_, _ = markedLocal, unmarkedLocal
}

type fieldMarkers struct {
	//policy:allow-any: this field receives data from an untyped source.
	markedField           any
	unmarkedField         any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	trailingMarkedField   any //policy:allow-any: this field receives data from another untyped source.
	trailingUnmarkedField any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

//policy:allow-any
func invalidBareMarker(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

//policy:allow-any:
func invalidEmptyReason(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

//policy:allow-anything
func invalidLongerMarker(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

//policy:allow-any:missing-space
func invalidMissingSpace(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

// policy:allow-any: surrounding space does not change this marker.
func validSurroundingSpace(value any) {}

//policy:allow-any: this alias names values from an untyped source.
type Dynamic = any

var dynamicValue Dynamic // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"

//policy:allow-any: this defined type names values from an untyped source.
type Dynamic2 interface{}

var dynamicValue2 Dynamic2 // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"

var selectedDynamicValue noemptyinterfacealiases.Dynamic // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"

var selectedDynamicValue2 noemptyinterfacealiases.Dynamic2 // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"

type embeddedAny interface {
	any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

func comparableConstraint[T comparable](value T) {}

type nonEmpty interface {
	M()
}

var standardError error
