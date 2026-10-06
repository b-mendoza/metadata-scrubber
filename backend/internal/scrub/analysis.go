package scrub

import (
	"cmp"
	"errors"
	"fmt"
	"slices"
	"unicode/utf8"

	"github.com/pdfcpu/pdfcpu/pkg/filter"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type dictionaryEntryTarget struct {
	dictionary types.Dict
	key        string
}

type pdfAnalysis struct {
	fields               []Field
	totalBytes           int
	decodedMetadataBytes int64
	infoDictionary       types.Dict
	metadataTargets      []dictionaryEntryTarget
}

type standardInfoFieldDescriptor struct {
	name   string
	label  string
	action FieldAction
}

var standardInfoFields = map[string]standardInfoFieldDescriptor{
	"Author":       {name: "info.author", label: "Author", action: ActionRemove},
	"CreationDate": {name: "info.creation_date", label: "Creation date", action: ActionReplace},
	"Creator":      {name: "info.creator", label: "Creator", action: ActionRemove},
	"Keywords":     {name: "info.keywords", label: "Keywords", action: ActionRemove},
	"ModDate":      {name: "info.mod_date", label: "Modification date", action: ActionReplace},
	"Producer":     {name: "info.producer", label: "Producer", action: ActionReplace},
	"Subject":      {name: "info.subject", label: "Subject", action: ActionRemove},
	"Title":        {name: "info.title", label: "Title", action: ActionRemove},
	"Trapped":      {name: "info.trapped", label: "Trapped", action: ActionRemove},
}

func analyzePDF(context *model.Context) (*pdfAnalysis, error) {
	if pdfHasCachedSignature(context) {
		return nil, ErrSignedPDF
	}

	analysis := &pdfAnalysis{fields: make([]Field, 0)}

	if err := analyzeInfoDictionary(context, analysis); err != nil {
		return nil, err
	}
	if err := analyzeObjectMetadata(context, analysis); err != nil {
		return nil, err
	}

	slices.SortStableFunc(analysis.fields, func(firstField Field, secondField Field) int {
		return cmp.Or(
			cmp.Compare(firstField.Name, secondField.Name),
			cmp.Compare(firstField.Label, secondField.Label),
		)
	})

	return analysis, nil
}

func analyzeInfoDictionary(context *model.Context, analysis *pdfAnalysis) error {
	if context.Info == nil {
		return nil
	}
	infoDictionary, err := context.DereferenceDict(*context.Info)
	if err != nil {
		return fmt.Errorf("dereference PDF Info dictionary: %w", err)
	}
	analysis.infoDictionary = infoDictionary
	keys, err := sortedDictionaryKeys(infoDictionary)
	if err != nil {
		return err
	}
	return analyzeInfoFields(context, analysis, keys)
}

func analyzeInfoFields(context *model.Context, analysis *pdfAnalysis, keys []dictionaryKey) error {
	customFieldNumber := 0
	for _, key := range keys {
		logicalValue, err := infoObjectValue(context, analysis.infoDictionary[key.encoded])
		if err != nil {
			return fmt.Errorf("decode PDF Info field %q: %w", key.logical, err)
		}
		field, standard := standardInfoFields[key.logical]
		if !standard {
			customFieldNumber++
			field = standardInfoFieldDescriptor{
				name:   fmt.Sprintf("info.custom.%03d", customFieldNumber),
				label:  fmt.Sprintf("Custom document property %d", customFieldNumber),
				action: ActionRemove,
			}
		}
		if err := analysis.add(field.name, field.label, logicalValue, field.action); err != nil {
			return err
		}
	}
	return nil
}

func analyzeObjectMetadata(context *model.Context, analysis *pdfAnalysis) error {
	roles, err := pdfObjectRoles(context)
	if err != nil {
		return err
	}

	for _, objectNumber := range sortedLiveObjectNumbers(context) {
		entry := context.Table[objectNumber]
		state := traversalState{
			analysis:     analysis,
			context:      context,
			roles:        roles,
			objectNumber: objectNumber,
		}
		walker := structuralWalker{context: context, inspectMetadata: state.inspectMetadataEntry}
		if err := walker.walkObject(entry.Object, false); err != nil {
			return err
		}
	}

	return nil
}

func (state *traversalState) inspectMetadataEntry(dictionary types.Dict, key string, nested bool) error {
	streamObject := dictionary[key]
	streamDictionary, _, err := state.context.DereferenceStreamDict(streamObject)
	if err != nil {
		return fmt.Errorf("dereference PDF metadata stream: %w", err)
	}
	if streamDictionary == nil {
		return errors.New("PDF metadata entry does not reference a stream")
	}
	snapshot := metadataEntrySnapshot{dictionary: dictionary, key: key, value: streamObject}
	bodyErr := state.analyzeMetadataStream(streamDictionary, dictionary, key, nested)
	streamDictionary.Content = nil
	cleanupErr := releaseMetadataStreamCache(state.context, snapshot)
	if cleanupErr != nil {
		return errors.Join(bodyErr, fmt.Errorf("release PDF metadata stream cache: %w", cleanupErr))
	}
	return bodyErr
}

func (state *traversalState) analyzeMetadataStream(streamDictionary *types.StreamDict, dictionary types.Dict, key string, nested bool) error {
	content, err := decodeMetadataStreamWithinBudget(streamDictionary, state.analysis.remainingDecodedMetadataBytes(), "decode PDF metadata stream")
	if err != nil {
		return err
	}
	if !utf8.Valid(content) {
		return errors.New("PDF metadata stream is not valid UTF-8")
	}

	name, label := state.metadataIdentity(nested)
	if err := state.analysis.addMetadataBytes(name, label, content); err != nil {
		return err
	}
	state.analysis.metadataTargets = append(state.analysis.metadataTargets, dictionaryEntryTarget{dictionary: dictionary, key: key})

	return nil
}

// decodeMetadataStreamWithinBudget decodes one metadata stream under the remaining
// aggregate budget and reports every limit breach as ErrInspectionLimit. Each caller
// supplies its own message for an underlying decode failure.
func decodeMetadataStreamWithinBudget(streamDictionary *types.StreamDict, remainingDecodeBytes int64, decodeErrorContext string) ([]byte, error) {
	if remainingDecodeBytes <= 0 {
		return nil, ErrInspectionLimit
	}
	content, err := streamDictionary.DecodeLengthWithLimit(-1, min(maxPDFDecodeBytes, remainingDecodeBytes))
	if errors.Is(err, filter.ErrDecodeLimitExceeded) {
		return nil, ErrInspectionLimit
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", decodeErrorContext, err)
	}
	return content, nil
}

func (state *traversalState) metadataIdentity(nested bool) (name string, label string) {
	role := state.roles[state.objectNumber]
	if !nested && role.catalog {
		return "metadata.catalog", "Document metadata"
	}
	if !nested && role.pageNumber > 0 {
		return fmt.Sprintf("metadata.page.%04d", role.pageNumber), fmt.Sprintf("Page %d metadata", role.pageNumber)
	}

	state.metadataOrdinal++
	return fmt.Sprintf("metadata.object.%06d.%03d", state.objectNumber, state.metadataOrdinal),
		fmt.Sprintf("Embedded metadata %d", state.metadataOrdinal)
}
