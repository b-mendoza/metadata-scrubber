package noemptyinterfacepolicy

import "noemptyinterfacealiases"

//policy:allow-any: marker comments do not exempt function parameters.
func markedFunction(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

type markedFieldHolder struct {
	//policy:allow-any: marker comments do not exempt fields.
	value any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func markedLocalDeclaration() {
	//policy:allow-any: marker comments do not exempt local declarations.
	var value any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	_ = value
}

type (
	//policy:allow-any: marker comments do not exempt type specifications.
	markedType any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

var trailingMarkerValue any /* // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time" */ //policy:allow-any: trailing marker comments do not exempt value specifications.

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
