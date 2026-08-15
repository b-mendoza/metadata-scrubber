package noemptyinterfacepolicy

import "noemptyinterfacealiases"

//policy:allow-any: this function accepts values from an untyped source.
func markedFunction(value any) {}

//policy:allow-any: this function accepts values from an untyped source.
func markedFunctionWithBodyLeak(value any) {
	var leaked any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	_ = leaked
}

//policy:allow-any: this function accepts values from an untyped source.
func markedFunctionWithMarkedLocal(value any) {
	//policy:allow-any: this local value receives data from an untyped source.
	var local any
	_ = local
}

func unmarkedSiblingFunction(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

type (
	//policy:allow-any: this type keeps values from an untyped source.
	markedTypeSpec           any
	unmarkedTypeSpec         any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	trailingMarkedTypeSpec   any //policy:allow-any: this type keeps values from another untyped source.
	trailingUnmarkedTypeSpec any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

var (
	//policy:allow-any: this value receives data from an untyped source.
	markedValueSpec           any
	unmarkedValueSpec         any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	trailingMarkedValueSpec   any //policy:allow-any: this value receives data from another untyped source.
	trailingUnmarkedValueSpec any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

func localDeclarationMarkers() {
	//policy:allow-any: this local value receives data from an untyped source.
	var markedLocal any
	var unmarkedLocal any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	_, _ = markedLocal, unmarkedLocal
}

type fieldMarkers struct {
	//policy:allow-any: this field receives data from an untyped source.
	markedField           any
	unmarkedField         any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	trailingMarkedField   any //policy:allow-any: this field receives data from another untyped source.
	trailingUnmarkedField any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any
func invalidBareMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any:
func invalidEmptyReason(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-anything
func invalidLongerMarker(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

//policy:allow-any:missing-space
func invalidMissingSpace(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

// policy:allow-any: surrounding space does not change this marker.
func validSurroundingSpace(value any) {}

//policy:allow-any: this alias names values from an untyped source.
type Dynamic = any

var dynamicValue Dynamic // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

//policy:allow-any: this defined type names values from an untyped source.
type Dynamic2 interface{}

var dynamicValue2 Dynamic2 // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

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
