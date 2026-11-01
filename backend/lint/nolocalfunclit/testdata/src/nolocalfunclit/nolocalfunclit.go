package nolocalfunclit

var packageCallback = func() {} // want "write this function literal inline at its call or struct field, or declare a named function; a function stored in a variable moves its captured values away from their use"

func boundLiterals() {
	defined := func(value int) int { return value } // want "write this function literal inline at its call or struct field, or declare a named function"
	var declared = func() {}                        // want "write this function literal inline at its call or struct field, or declare a named function"
	var assigned func()
	assigned = func() {} // want "write this function literal inline at its call or struct field, or declare a named function"
	first, second := func() {}, 2 // want "write this function literal inline at its call or struct field, or declare a named function"
	_, _, _, _, _ = defined, declared, assigned, first, second
}
