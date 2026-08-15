package noemptyinterface

var value any // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"

type emptyFieldHolder struct {
	value interface{} // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

func accept(value any) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

func generic[T any](value T) { // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
}

var values = map[string]any{ // want "declare a concrete type, or mark the declaration with //policy:allow-any and a reason"
	"answer": 42,
}
