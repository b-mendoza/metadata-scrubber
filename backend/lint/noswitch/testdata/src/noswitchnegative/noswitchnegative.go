package noswitchnegative

func lookup(value string) (int, bool) {
	values := map[string]int{"known": 1}
	result, ok := values[value]

	return result, ok
}
