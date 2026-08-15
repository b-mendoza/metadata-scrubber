package noemptyinterface

var value any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

type emptyFieldHolder struct {
	value interface{} // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func accept(value any) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func generic[T any](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

type genericType[T interface{}] struct { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
	value T
}

type namedEmpty interface{} // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

type aliasEmpty = interface{} // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

func namedConstraint[T namedEmpty](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

func aliasConstraint[T aliasEmpty](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

func unionConstraintAnyLast[T ~int | any](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

func unionConstraintAnyFirst[T any | ~int](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

func embeddedConstraint[T interface{ any }](value T) { // want "declare an explicit type constraint; an unconstrained type parameter hides the declaration's real contract"
}

func nestedMapConstraint[T ~map[string]any](value T) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func nestedMethodConstraint[T interface{ M(any) }](value T) { // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

var values = map[string]any{ // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	"answer": 42,
}
