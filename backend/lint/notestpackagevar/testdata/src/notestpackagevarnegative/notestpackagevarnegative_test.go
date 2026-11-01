package notestpackagevarnegative

import "testing"

type workflow struct {
	download func() string
}

var shared = workflow{download: func() string { return "real" }}

func TestLocalWrites(t *testing.T) {
	instance := workflow{download: func() string { return "fake" }}
	instance.download = func() string { return "other fake" }
	copied := shared
	copied.download = func() string { return "copy" }
	var count int
	count++
	_, _ = instance, count
}
