package nonillogger

import "log/slog"

type service struct {
	logger *slog.Logger
}

func newService(logger *slog.Logger) *service {
	if logger == nil { // want "remove this nil check and require a non-nil \\*slog\\.Logger from the caller; a nil-logger fallback hides a missing dependency"
		logger = slog.New(slog.DiscardHandler)
	}
	return &service{logger: logger}
}

func (instance *service) hasLogger() bool {
	return nil != instance.logger // want "remove this nil check and require a non-nil \\*slog\\.Logger from the caller"
}
