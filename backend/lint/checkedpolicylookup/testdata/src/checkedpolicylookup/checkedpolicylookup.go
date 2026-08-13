package checkedpolicylookup

//policy:map
var actions = map[string]int{"known": 1}

func uncheckedAssignment(key string) int {
	value := actions[key] // want "require the comma-ok form for lookups in a //policy:map"

	return value
}

func uncheckedReturn(key string) int {
	return actions[key] // want "require the comma-ok form for lookups in a //policy:map"
}
