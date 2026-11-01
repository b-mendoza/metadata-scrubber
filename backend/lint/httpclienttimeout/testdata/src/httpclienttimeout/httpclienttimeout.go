package httpclienttimeout

import "net/http"

func clients(transport http.RoundTripper) []*http.Client {
	return []*http.Client{
		&http.Client{}, // want "set Timeout on this http\\.Client; without an overall timeout a stalled response keeps the request open even while the caller stays connected"
		{Transport: transport}, // want "set Timeout on this http\\.Client"
		new(http.Client),       // want "set Timeout on this http\\.Client"
	}
}
