package notestpackagevarnegative

import "testing"

type workflow struct {
	download func() string
}

var shared = workflow{download: func() string { return "real" }}

func TestLocalWrites(t *testing.T) {
	instance := workflow{download: func() string { return "fake" }}
	instance.download = func() string { return "other fake" }
	var count int
	count++
	_, _ = instance, count
}
