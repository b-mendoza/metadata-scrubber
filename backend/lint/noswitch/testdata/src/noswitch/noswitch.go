package noswitch

func expressionSwitch(value string) string {
	switch value { // want "use a lookup map that returns an explicit error for unknown keys"
	case "known":
		return value
	default:
		return ""
	}
}

func initializerSwitch() int {
	switch value := 1; value { // want "use a lookup map that returns an explicit error for unknown keys"
	case 1:
		return value
	default:
		return 0
	}
}

func conditionlessSwitch(value bool) bool {
	switch { // want "use a lookup map that returns an explicit error for unknown keys"
	case value:
		return true
	default:
		return false
	}
}

func typeSwitch(value any) string {
	switch typedValue := value.(type) { // want "use a lookup map that returns an explicit error for unknown keys"
	case string:
		return typedValue
	default:
		return ""
	}
}
