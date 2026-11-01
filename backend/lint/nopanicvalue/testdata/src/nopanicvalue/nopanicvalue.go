package nopanicvalue

import (
	"fmt"
	"log/slog"
)

func logPanicValue(logger *slog.Logger) {
	recovered := recover()
	if recovered != nil {
		logger.Error("panic", "value", recovered) // want "compare the recovered panic value only with nil, or pass it to panic; a panic value can contain private data, so record only that a panic occurred"
	}
}

func formatPanicValue() string {
	return fmt.Sprint(recover()) // want "compare the recovered panic value only with nil, or pass it to panic"
}

func storePanicValue(values []any) {
	var recovered = recover()
	values[0] = recovered // want "compare the recovered panic value only with nil, or pass it to panic"
}

func assignPanicValue() (result any) {
	result = recover() // want "compare the recovered panic value only with nil, or pass it to panic"
	return
}
