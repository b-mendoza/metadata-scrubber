// Package header defines constants for the HTTP header names the backend sets,
// so handlers reference one canonical spelling instead of repeating string
// literals and risking typos. It mirrors the frontend headers module
// (frontend/src/shared/constants/http/headers/headers.mod.ts).
//
// Status codes and request methods are intentionally absent: net/http already
// provides those as constants (http.StatusOK, http.MethodGet, ...), so wrapping
// them here would only duplicate the standard library.
package header

const (
	// ContentType declares the media type of the response body.
	ContentType = "Content-Type"
	// ContentDisposition controls inline vs attachment rendering and the
	// suggested download filename.
	ContentDisposition = "Content-Disposition"

	// AccessControlAllowOrigin is the CORS header listing the allowed origins.
	AccessControlAllowOrigin = "Access-Control-Allow-Origin"
	// AccessControlAllowMethods is the CORS header listing the allowed methods.
	AccessControlAllowMethods = "Access-Control-Allow-Methods"
	// AccessControlAllowHeaders is the CORS header listing the allowed request headers.
	AccessControlAllowHeaders = "Access-Control-Allow-Headers"
)
