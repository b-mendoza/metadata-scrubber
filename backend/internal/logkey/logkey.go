// Package logkey names the attribute keys in application logs.
// One constant for each fact keeps one field name across packages, so log
// queries do not depend on which package wrote the record.
package logkey

const (
	// Error holds an error value.
	Error = "error"
	// Failure holds the fixed public message of an unexpected request failure.
	Failure = "failure"
	// Addr holds the listen address of the HTTP server.
	Addr = "addr"

	// Method holds the HTTP request method.
	Method = "method"
	// Path holds the HTTP request path.
	Path = "path"
	// RemoteAddr holds the network address of the client.
	RemoteAddr = "remote_addr"
	// UserAgent holds the User-Agent request header.
	UserAgent = "user_agent"
	// Status holds the HTTP response status code.
	Status = "status"
	// Bytes holds the number of response body bytes written.
	Bytes = "bytes"
	// Panicked records that the request handler panicked. It never holds the panic value.
	Panicked = "panicked"
	// DurationMS holds the elapsed time in milliseconds.
	DurationMS = "duration_ms"

	// Stage holds the name of a file-pipeline stage.
	Stage = "stage"
	// StorageKeyDigest holds a short hash of a storage key, never the key itself.
	StorageKeyDigest = "storage_key_digest"
	// Outcome holds the result of a file-pipeline stage.
	Outcome = "outcome"
)
