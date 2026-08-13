package nohiddentestsignalnegative

import "testing"

type helper struct{}

func (helper) Skip(string) {}

func TestAllowedCalls(t *testing.T) {
	t.Helper()

	var localHelper helper
	localHelper.Skip("not testing.T")
}
