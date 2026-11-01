package noerrortextresponse

import (
	"errors"
	"net/http"
)

type errorResponse struct {
	Error string
}

func writeError(w http.ResponseWriter, status int, message string) {}

func writeJSON(w http.ResponseWriter, body errorResponse) {}

type pathError struct{}

func (*pathError) Error() string { return "private path" }

func responses(w http.ResponseWriter, err error, typed *pathError) {
	writeError(w, http.StatusNotFound, err.Error())                // want "send a fixed public message instead of this error text; parser and provider error text can contain private URLs and storage keys"
	writeError(w, http.StatusNotFound, "failed: "+typed.Error())   // want "send a fixed public message instead of this error text"
	writeJSON(w, errorResponse{Error: errors.Unwrap(err).Error()}) // want "send a fixed public message instead of this error text"
	_, _ = w.Write([]byte(err.Error()))                            // want "send a fixed public message instead of this error text"
}
