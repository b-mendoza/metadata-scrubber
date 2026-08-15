package nohiddentestsignal

import (
	"testing"
	"time"
)

func TestHiddenSignals(t *testing.T) {
	t.Skip("missing prerequisite")        // want "remove t\\.Skip; make the test prerequisite explicit and fail when it is missing"
	t.Skipf("missing %s", "prerequisite") // want "remove t\\.Skipf; make the test prerequisite explicit and fail when it is missing"
	t.SkipNow()                           // want "remove t\\.SkipNow; make the test prerequisite explicit and fail when it is missing"
	time.Sleep(time.Second)               // want "replace time\\.Sleep with synchronization on the condition that the test needs"
}
