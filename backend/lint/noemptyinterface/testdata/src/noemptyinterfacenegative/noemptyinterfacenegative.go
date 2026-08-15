package noemptyinterfacenegative

type any int

var shadowed any

type nonEmpty interface {
	M()
}

func comparableConstraint[T comparable](value T) {}

var standardError error
