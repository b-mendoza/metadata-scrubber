package noemptyinterfacemarkers

//policy:allow-any: this function accepts values from an untyped source.
func markedFunction(value any) {} // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"

type markerFields struct {
	//policy:allow-any: this field receives data from an untyped source.
	documentedField any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
}

func markedLocalDeclaration() {
	//policy:allow-any: this local value receives data from an untyped source.
	var local any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
	_ = local
}

type (
	//policy:allow-any: this type keeps values from an untyped source.
	documentedType any // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
)

var trailingValue any //policy:allow-any: this value receives data from an untyped source. // want "declare the specific type this code handles; the empty interface accepts every value and defers type errors to run time"
