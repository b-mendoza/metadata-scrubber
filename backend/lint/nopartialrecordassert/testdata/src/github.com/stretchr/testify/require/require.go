// Package require is a minimal stand-in for testify/require in analyzer tests.
package require

type TestingT interface {
	Errorf(format string, args ...any)
	FailNow()
}

type Assertions struct{}

func New(t TestingT) *Assertions { return &Assertions{} }

func Contains(t TestingT, s any, contains any, msgAndArgs ...any)           {}
func Containsf(t TestingT, s any, contains any, msg string, args ...any)    {}
func NotContains(t TestingT, s any, contains any, msgAndArgs ...any)        {}
func NotContainsf(t TestingT, s any, contains any, msg string, args ...any) {}
func Equal(t TestingT, expected any, actual any, msgAndArgs ...any)         {}
func (*Assertions) Contains(s any, contains any, msgAndArgs ...any)         {}
func (*Assertions) NotContains(s any, contains any, msgAndArgs ...any)      {}
