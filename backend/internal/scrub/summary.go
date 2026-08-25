package scrub

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

type summaryBuilder struct {
	fields               []Field
	totalBytes           int
	decodedMetadataBytes int64
}

func (builder *summaryBuilder) add(name string, label string, value string, action FieldAction) error {
	return builder.addField(Field{
		Name: name, Label: label, Preview: truncateUTF8(value), OriginalByteSize: len(value), Action: action,
	})
}

func (builder *summaryBuilder) remainingDecodedMetadataBytes() int64 {
	return maxDecodedMetadataBytes - builder.decodedMetadataBytes
}

func (builder *summaryBuilder) addMetadataBytes(name string, label string, value []byte, action FieldAction) error {
	if int64(len(value)) > builder.remainingDecodedMetadataBytes() {
		return ErrInspectionLimit
	}

	preview := truncateUTF8(string(value[:min(len(value), maxFieldPreviewBytes)]))
	if err := builder.addField(Field{
		Name: name, Label: label, Preview: preview, OriginalByteSize: len(value), Action: action,
	}); err != nil {
		return err
	}
	builder.decodedMetadataBytes += int64(len(value))
	return nil
}

func (builder *summaryBuilder) addField(field Field) error {
	if !field.Action.valid() {
		return fmt.Errorf("invalid field action %q", field.Action)
	}
	if len(builder.fields) >= maxInspectionFields {
		return ErrInspectionLimit
	}

	fieldBytes := len(field.Name) + len(field.Label) + len(field.Preview) + len(field.Action) + len(strconv.Itoa(field.OriginalByteSize))
	if builder.totalBytes+fieldBytes > maxInspectionBytes {
		return ErrInspectionLimit
	}

	builder.totalBytes += fieldBytes
	builder.fields = append(builder.fields, field)
	return nil
}

// discardFields empties the summary and its byte accounting, so a later add
// starts from the same state as a new builder. The field list stays non-nil
// because InspectPDF returns it to the caller.
func (builder *summaryBuilder) discardFields() {
	builder.fields = []Field{}
	builder.totalBytes = 0
	builder.decodedMetadataBytes = 0
}

func truncateUTF8(value string) string {
	previewLength := min(len(value), maxFieldPreviewBytes)
	for previewLength > 0 && !utf8.ValidString(value[:previewLength]) {
		previewLength--
	}
	return strings.Clone(value[:previewLength])
}
