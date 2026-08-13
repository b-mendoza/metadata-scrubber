package nohiddentestsignal

import (
	"testing"
	"time"
)

func TestHiddenSignals(t *testing.T) {
	t.Skip("missing prerequisite")        // want "do not hide a failing test signal with t.Skip"
	t.Skipf("missing %s", "prerequisite") // want "do not hide a failing test signal with t.Skipf"
	t.SkipNow()                           // want "do not hide a failing test signal with t.SkipNow"
	time.Sleep(time.Second)               // want "do not hide a failing test signal with time.Sleep"
}
