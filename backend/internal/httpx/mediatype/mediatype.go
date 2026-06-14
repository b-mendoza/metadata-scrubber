// Package mediatype defines constants for the MIME media types the backend sends
// in Content-Type headers, keeping these values in one place instead of inline
// string literals. Go's standard library has no constants for these, so unlike
// status codes they are worth centralizing here.
package mediatype

const (
	// JSON is the media type for JSON response bodies.
	JSON = "application/json"
	// OctetStream is the media type for arbitrary binary downloads.
	OctetStream = "application/octet-stream"
)
