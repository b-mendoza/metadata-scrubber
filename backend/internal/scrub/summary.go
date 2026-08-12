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

func (builder *summaryBuilder) add(name, label, value string, action FieldAction) error {
	return builder.addPreview(name, label, truncateUTF8(value), len(value), action)
}

func (builder *summaryBuilder) remainingDecodedMetadataBytes() int64 {
	return maxDecodedMetadataBytes - builder.decodedMetadataBytes
}

func (builder *summaryBuilder) addMetadataBytes(name, label string, value []byte, action FieldAction) error {
	if int64(len(value)) > builder.remainingDecodedMetadataBytes() {
		return ErrInspectionLimit
	}

	preview := truncateUTF8(string(value[:min(len(value), maxFieldPreviewBytes)]))
	if err := builder.addPreview(name, label, preview, len(value), action); err != nil {
		return err
	}
	builder.decodedMetadataBytes += int64(len(value))
	return nil
}

func (builder *summaryBuilder) addPreview(name, label, preview string, originalByteSize int, action FieldAction) error {
	if !action.valid() {
		return fmt.Errorf("invalid field action %q", action)
	}
	if len(builder.fields) >= maxInspectionFields {
		return ErrInspectionLimit
	}

	field := Field{
		Name:             name,
		Label:            label,
		Preview:          preview,
		OriginalByteSize: originalByteSize,
		Action:           action,
	}
	fieldBytes := len(field.Name) + len(field.Label) + len(field.Preview) + len(field.Action) + len(strconv.Itoa(field.OriginalByteSize))
	if builder.totalBytes+fieldBytes > maxInspectionBytes {
		return ErrInspectionLimit
	}

	builder.totalBytes += fieldBytes
	builder.fields = append(builder.fields, field)
	return nil
}

func truncateUTF8(value string) string {
	previewLength := min(len(value), maxFieldPreviewBytes)
	for !utf8.ValidString(value[:previewLength]) {
		previewLength--
	}
	return strings.Clone(value[:previewLength])
}
