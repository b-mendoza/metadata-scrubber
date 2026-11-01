package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"

	"metadata-scrubber/internal/httpx/header"
	"metadata-scrubber/internal/httpx/mediatype"
)

type reachabilityResponse struct {
	Status string `json:"status"`
}

type workflowConfigResponse struct {
	MaxFileSizeBytes int `json:"maxFileSizeBytes"`
}

type uploadRequest struct {
	FileName      string `json:"fileName"`
	FileSizeBytes int64  `json:"fileSizeBytes"`
}

type uploadResponse struct {
	StorageKey storageKey `json:"storageKey"`
	UploadURL  string     `json:"uploadUrl"`
}

type dryRunRequest struct {
	StorageKey storageKey `json:"storageKey"`
}

type publicField struct {
	Name             string            `json:"name"`
	Label            string            `json:"label"`
	Preview          string            `json:"preview"`
	OriginalByteSize int               `json:"originalByteSize"`
	Action           publicFieldAction `json:"action"`
}

type dryRunResponse struct {
	ETag   string        `json:"etag"`
	Fields []publicField `json:"fields"`
}

type scrubRequest struct {
	StorageKey storageKey `json:"storageKey"`
	ETag       string     `json:"etag"`
}

type scrubResponse struct {
	Status string              `json:"status"`
	Result scrubResponseResult `json:"result"`
}

type scrubResponseResult struct {
	DownloadURL string `json:"downloadUrl"`
}

type downloadGrantRequest struct {
	StorageKey storageKey `json:"storageKey"`
	ETag       string     `json:"etag"`
}

type downloadGrantResponse struct {
	DownloadURL string `json:"downloadUrl"`
	ExpiresAt   string `json:"expiresAt"`
}

type deleteRequest struct {
	StorageKey storageKey `json:"storageKey"`
}

type deleteResponse struct {
	Status string `json:"status"`
}

func writeJSON[T reachabilityResponse | workflowConfigResponse | uploadResponse | dryRunResponse | scrubResponse | downloadGrantResponse | deleteResponse](
	w http.ResponseWriter,
	status int,
	body T,
) error {
	w.Header().Set(header.ContentType, mediatype.JSON)
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(body)
}

func decodeJSONRequest[T uploadRequest | dryRunRequest | scrubRequest | downloadGrantRequest | deleteRequest](
	handler *Handler,
	w http.ResponseWriter,
	request *http.Request,
) (T, bool) {
	var zero T
	if !handler.requestHasJSONMediaType(w, request) {
		return zero, false
	}

	request.Body = http.MaxBytesReader(w, request.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	var input T
	err := decoder.Decode(&input)
	if err == nil {
		err = decoder.Decode(&struct{}{})
		if errors.Is(err, io.EOF) {
			return input, true
		}
	}
	handler.writeError(w, request, http.StatusBadRequest, "invalid JSON request")
	return zero, false
}

func (handler *Handler) requestHasJSONMediaType(w http.ResponseWriter, request *http.Request) bool {
	contentType, _, err := mime.ParseMediaType(request.Header.Get(header.ContentType))
	if err == nil && contentType == mediatype.JSON {
		return true
	}
	handler.writeError(w, request, http.StatusUnsupportedMediaType, "Content-Type must be application/json")
	return false
}

const storageKeyDigestBytes = 6

// storageKey is the public file reference. It can identify a stored object, so
// logs must record its digest and not its value.
type storageKey string

// digest returns a short hash that lets logs follow one file without exposing its key.
func (key storageKey) digest() string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:storageKeyDigestBytes])
}

func parseStorageKey(key storageKey) (string, bool) {
	matches := storageKeyPattern.FindStringSubmatch(string(key))
	if len(matches) != 2 {
		return "", false
	}
	return matches[1], true
}
