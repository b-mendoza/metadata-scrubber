package nourltext

import "fmt"

const secureScheme = "HTTPS://"

func joinedURLs(accountID string, path string) []string {
	return []string{
		"https://" + accountID + ".r2.cloudflarestorage.com", // want "build this URL with url.URL and set each part in its own field; joining URL text lets input change the scheme, host, or path"
		"http://example.test/" + path,                        // want "build this URL with url.URL and set each part in its own field"
		secureScheme + accountID,                             // want "build this URL with url.URL and set each part in its own field"
		fmt.Sprintf("https://%s.example.test", accountID),    // want "build this URL with url.URL and set each part in its own field"
	}
}
