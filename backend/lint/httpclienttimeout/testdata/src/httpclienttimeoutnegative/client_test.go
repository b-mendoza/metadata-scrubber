package httpclienttimeoutnegative

import "net/http"

func testClient(transport http.RoundTripper) *http.Client {
	return &http.Client{Transport: transport}
}
