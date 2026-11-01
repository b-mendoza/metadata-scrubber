package nourltextnegative

import "fmt"

const constantEndpoint = "https://" + "example.test"

func allowedText(name string, baseURL string) []string {
	return []string{
		constantEndpoint,
		"uploads/" + name,
		baseURL + "/api/files",
		`<Result xmlns="http://example.test/doc">` + name,
		fmt.Sprintf("https://example.test"),
		fmt.Sprintf("file %s", name),
	}
}
