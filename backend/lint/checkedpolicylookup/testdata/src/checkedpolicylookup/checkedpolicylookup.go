package checkedpolicylookup

// policy:map
var actions = map[string]int{"known": 1}

func uncheckedAssignment(key string) int {
	value := actions[key] // want "use the comma-ok form \\(value, ok := m\\[key\\]\\) and handle the missing key; this map is marked // policy:map"

	return value
}

func uncheckedReturn(key string) int {
	return actions[key] // want "use the comma-ok form \\(value, ok := m\\[key\\]\\) and handle the missing key; this map is marked // policy:map"
}

func uncheckedBlankOkAssignment(key string) int {
	value, _ := actions[key] // want "use the comma-ok form \\(value, ok := m\\[key\\]\\) and handle the missing key; this map is marked // policy:map"

	return value
}

func uncheckedBlankOkValueDeclaration(key string) int {
	var value, _ = actions[key] // want "use the comma-ok form \\(value, ok := m\\[key\\]\\) and handle the missing key; this map is marked // policy:map"

	return value
}
