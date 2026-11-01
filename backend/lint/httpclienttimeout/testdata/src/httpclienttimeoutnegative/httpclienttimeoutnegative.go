package httpclienttimeoutnegative

import (
	"net/http"
	"time"
)

type Client struct{}

func clients(transport http.RoundTripper) (*http.Client, Client, *Client) {
	return &http.Client{Transport: transport, Timeout: time.Second}, Client{}, new(Client)
}
