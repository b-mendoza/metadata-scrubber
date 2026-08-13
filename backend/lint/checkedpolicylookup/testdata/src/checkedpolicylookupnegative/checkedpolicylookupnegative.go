package checkedpolicylookupnegative

//policy:map
var actions = map[string]int{"known": 1}

var otherActions = map[string]int{"known": 1}

func checkedLookup(key string) (int, bool) {
	value, ok := actions[key]

	return value, ok
}

func unmarkedLookup(key string) int {
	return otherActions[key]
}
