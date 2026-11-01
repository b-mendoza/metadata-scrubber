package nonilloggernegative

import "log/slog"

type Logger struct{}

func checks(handler slog.Handler, local *Logger, logger *slog.Logger, other *slog.Logger) bool {
	return handler == nil || local == nil || logger == other
}
