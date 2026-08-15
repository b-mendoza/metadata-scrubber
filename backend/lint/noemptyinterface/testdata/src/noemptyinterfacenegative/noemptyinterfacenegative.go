package noemptyinterfacenegative

type any int

var shadowed any

type nonEmpty interface {
	M()
}
