package scrub

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

func (analysis *pdfAnalysis) add(name string, label string, value string, action FieldAction) error {
	return analysis.addField(Field{
		Name: name, Label: label, Preview: truncateUTF8(value), OriginalByteSize: len(value), Action: action,
	})
}

func (analysis *pdfAnalysis) remainingDecodedMetadataBytes() int64 {
	return maxDecodedMetadataBytes - analysis.decodedMetadataBytes
}

func (analysis *pdfAnalysis) addMetadataBytes(name string, label string, value []byte) error {
	if int64(len(value)) > analysis.remainingDecodedMetadataBytes() {
		return ErrInspectionLimit
	}

	preview := truncateUTF8(string(value[:min(len(value), maxFieldPreviewBytes)]))
	if err := analysis.addField(Field{
		Name: name, Label: label, Preview: preview, OriginalByteSize: len(value), Action: ActionRemove,
	}); err != nil {
		return err
	}
	analysis.decodedMetadataBytes += int64(len(value))
	return nil
}

func (analysis *pdfAnalysis) addField(field Field) error {
	if len(analysis.fields) >= maxInspectionFields {
		return ErrInspectionLimit
	}

	fieldBytes := len(field.Name) + len(field.Label) + len(field.Preview) + len(field.Action) + len(strconv.Itoa(field.OriginalByteSize))
	if analysis.totalBytes+fieldBytes > maxInspectionBytes {
		return ErrInspectionLimit
	}

	analysis.totalBytes += fieldBytes
	analysis.fields = append(analysis.fields, field)
	return nil
}

func truncateUTF8(value string) string {
	previewLength := min(len(value), maxFieldPreviewBytes)
	for previewLength > 0 && !utf8.ValidString(value[:previewLength]) {
		previewLength--
	}
	return strings.Clone(value[:previewLength])
}
