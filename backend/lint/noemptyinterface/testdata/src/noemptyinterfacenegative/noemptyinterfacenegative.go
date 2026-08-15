package noemptyinterfacenegative

type any int

var shadowed any

type nonEmpty interface {
	M()
}

//policy:allow-any: this callback receives values from an untyped external source.
func allowedFunction(value interface{}) {}

//policy:allow-any: this registry stores values with different concrete types.
var allowedValues = map[string]interface{}{}
