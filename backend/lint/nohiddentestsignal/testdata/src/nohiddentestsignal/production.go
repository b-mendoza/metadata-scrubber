package nohiddentestsignal

import "time"

type helper struct{}

func (helper) Skip(string) {}

func allowedOutsideTestFile() {
	var localHelper helper
	localHelper.Skip("allowed")
	time.Sleep(time.Second)
}
