package nolocalfunclit

var packageCallback = func() {} // want "write this function literal inline at its call or struct field, or declare a named function; a function stored in a variable moves its captured values away from their use"

func boundLiterals() {
	first, second := (func() {}), 2 // want "write this function literal inline at its call or struct field, or declare a named function"
	_, _ = first, second
}
