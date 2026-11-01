package nopanicvaluenegative

import "log/slog"

func recordPanic(logger *slog.Logger) {
	recovered := recover()
	if recovered != nil {
		logger.Error("panic", slog.Bool("panicked", true))
	}
	if nil == recovered {
		return
	}
	panic(recovered)
}

func discardPanic() {
	recover()
	_ = recover()
	if recover() != nil {
		return
	}
}
