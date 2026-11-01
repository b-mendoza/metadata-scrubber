package noerrortextresponsenegative

import (
	"log/slog"
	"net/http"
)

type validationResult struct{}

func (validationResult) Error() int { return 0 }

func writeError(w http.ResponseWriter, status int, message string) {}

func responses(w http.ResponseWriter, logger *slog.Logger, err error, result validationResult) string {
	writeError(w, http.StatusNotFound, "source file not found")
	writeError(w, result.Error(), "invalid request")
	logger.Error("could not inspect file", slog.Any("error", err))
	return err.Error()
}
