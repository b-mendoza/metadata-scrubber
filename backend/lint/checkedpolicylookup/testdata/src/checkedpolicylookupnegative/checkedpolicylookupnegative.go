package checkedpolicylookupnegative

//policy:map
var actions = map[string]int{"known": 1}

var otherActions = map[string]int{"known": 1}

// policy:map -- this marker must not have a reason.
var reasonMarkedActions = map[string]int{"known": 1}

func checkedLookup(key string) (int, bool) {
	value, ok := actions[key]

	return value, ok
}

func checkedDiscardedValueLookup(key string) bool {
	_, ok := actions[key]

	return ok
}

func unmarkedLookup(key string) int {
	return otherActions[key]
}

func oldMarkerLookup(key string) int {
	return actions[key]
}

func reasonMarkerLookup(key string) int {
	return reasonMarkedActions[key]
}
