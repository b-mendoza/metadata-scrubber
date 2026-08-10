// Package mediatype defines constants for the MIME media types that httpx sends
// in Content-Type headers, instead of inline string literals. It is not the one
// place for every media type: storage declares PDFContentType for PDF uploads.
// Go's standard library has no constants for media types, unlike status codes.
package mediatype

const (
	// JSON is the media type for JSON response bodies.
	JSON = "application/json"
)
