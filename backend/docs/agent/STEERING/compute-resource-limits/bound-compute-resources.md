# Bound PDF parsing resources

Scope: PDF reads, parsing, and inspection in `internal/scrub`. The 10 MiB input ceiling limits raw bytes, not decoded data or parser growth. Keep the independent resource limits at the shared read boundary.

## Do's

### Correct: Check input size and use the bounded parser configuration

Context: [`internal/scrub/read.go`](../../../../internal/scrub/read.go). `MaxInputBytes` is `10_485_760`; the exported error is `ErrInputTooLarge`. This shared path also checks parsing and validation failures.

```go
func readPDFWithValidator(inputBytes []byte, validate validatePDFContextOperation) (*model.Context, error) {
	if len(inputBytes) > MaxInputBytes {
		return nil, ErrInputTooLarge
	}

	context, err := api.ReadContext(bytes.NewReader(inputBytes), boundedPDFConfiguration())
	if err != nil {
		return nil, err
	}
	if err := validateAndOptimizePDFContext(context, validate); err != nil {
		return nil, err
	}
	return context, nil
}
```

### Correct: Set every decoded, image, and structural limit

Context: `boundedPDFConfiguration` in [`internal/scrub/read.go`](../../../../internal/scrub/read.go). Keep all nine fields. Changing a ceiling needs measured evidence and corresponding contract tests.

```go
func boundedPDFConfiguration() *model.Configuration {
	configuration := model.NewDefaultConfiguration()
	configuration.Cmd = model.REMOVEPROPERTIES
	configuration.PostProcessValidate = true
	configuration.Limits = model.ResourceLimits{
		MaxStreamBytes:       maxPDFStreamBytes,
		MaxDecodeBytes:       maxPDFDecodeBytes,
		MaxImagePixels:       maxPDFImagePixels,
		MaxImageBytes:        maxPDFImageBytes,
		MaxObjectCount:       maxPDFObjectCount,
		MaxObjectStreamCount: maxPDFObjectStreamCount,
		MaxObjectStreamFirst: maxPDFObjectStreamFirst,
		MaxXRefEntries:       maxPDFXRefEntries,
		MaxRecursionDepth:    maxPDFRecursionDepth,
	}

	return configuration
}
```

The offset-zero `%PDF-` check in [`internal/sniff/sniff.go`](../../../../internal/sniff/sniff.go) selects candidates only. It does not replace bounded parsing and structural validation.

## Don'ts

### Wrong: Replace the bounded configuration with parser defaults

Wrong replacement for the read call in `readPDFWithValidator`, after the size check. The API and error handling are real, but the explicit resource limits are missing.

```go
context, err := api.ReadContext(bytes.NewReader(inputBytes), model.NewDefaultConfiguration())
if err != nil {
    return nil, err
}
```

### Wrong: Treat the file size or prefix as a parsing guarantee

```text
The input is below 10 MiB and starts with %PDF-, so it is structurally valid.
Decoded streams and images need no separate limits.
```
