// Package assert is a minimal stand-in for testify/assert in analyzer tests.
package assert

type TestingT interface {
	Errorf(format string, args ...any)
}

func Contains(t TestingT, s any, contains any, msgAndArgs ...any) bool    { return true }
func NotContains(t TestingT, s any, contains any, msgAndArgs ...any) bool { return true }
