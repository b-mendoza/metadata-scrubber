package nolocalfunclitnegative

type handler struct {
	callback func()
}

func run(callback func()) {
	callback()
}

func inlineLiterals(instance *handler, callbacks map[string]func()) {
	run(func() {})
	instance.callback = func() {}
	_ = func() {}
	_ = handler{callback: func() {}}
}
