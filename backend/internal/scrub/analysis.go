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

// pdfAnalysis embeds the summaryBuilder so that the inspected field list has a
// single owner from the first append through to the sorted result.
type pdfAnalysis struct {
	summaryBuilder
	infoTargets     []dictionaryEntryTarget
	metadataTargets []dictionaryEntryTarget
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

func analyzePDF(context *model.Context, origin InspectionOrigin) (*pdfAnalysis, error) {
	if pdfHasCachedSignature(context) {
		return nil, ErrSignedPDF
	}

	analysis := &pdfAnalysis{summaryBuilder: summaryBuilder{fields: make([]Field, 0)}}

	if err := analyzeInfoDictionary(context, analysis); err != nil {
		return nil, err
	}
	if err := analyzeObjectMetadata(context, analysis); err != nil {
		return nil, err
	}

	if origin == PostWriteVerification && hasNeutralPDFCPUTrio(context, analysis) {
		analysis.discardFields()
		return analysis, nil
	}

	slices.SortStableFunc(analysis.fields, func(firstField, secondField Field) int {
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
	if infoDictionary == nil {
		return nil
	}

	keys, err := sortedDictionaryKeys(infoDictionary)
	if err != nil {
		return err
	}

	customFieldNumber := 0
	for _, key := range keys {
		logicalValue, err := infoObjectValue(context, infoDictionary[key.encoded])
		if err != nil {
			return fmt.Errorf("decode PDF Info field %q: %w", key.logical, err)
		}

		field, standard := standardInfoFields[key.logical]
		name, label, action := field.name, field.label, field.action
		if !standard {
			customFieldNumber++
			name = fmt.Sprintf("info.custom.%03d", customFieldNumber)
			label = fmt.Sprintf("Custom document property %d", customFieldNumber)
			action = ActionRemove
		}

		if err := analysis.add(name, label, logicalValue, action); err != nil {
			return err
		}
		analysis.infoTargets = append(analysis.infoTargets, dictionaryEntryTarget{dictionary: infoDictionary, key: key.encoded})
	}

	return nil
}

func analyzeObjectMetadata(context *model.Context, analysis *pdfAnalysis) error {
	roles, err := pdfObjectRoles(context)
	if err != nil {
		return err
	}

	seenTargets := &metadataTargetTracker{}
	for _, objectNumber := range sortedLiveObjectNumbers(context) {
		entry := context.Table[objectNumber]
		state := traversalState{
			analysis:     analysis,
			context:      context,
			roles:        roles,
			seenTargets:  seenTargets,
			objectNumber: objectNumber,
		}
		walker := structuralWalker{context: context, inspectMetadata: state.inspectMetadataEntry}
		if err := walker.walkObject(entry.Object, nil); err != nil {
			return err
		}
	}

	return nil
}

func (state *traversalState) inspectMetadataEntry(dictionary types.Dict, key string, path []int) error {
	if state.seenTargets.contains(state.objectNumber, path, key) {
		return nil
	}

	streamObject := dictionary[key]
	streamDictionary, _, err := state.context.DereferenceStreamDict(streamObject)
	if err != nil {
		return fmt.Errorf("dereference PDF metadata stream: %w", err)
	}
	if streamDictionary == nil {
		return errors.New("PDF metadata entry does not reference a stream")
	}
	defer func() {
		streamDictionary.Content = nil
		storeMetadataStreamContent(state.context, dictionary, key, streamObject, nil)
	}()

	content, err := decodeMetadataStreamWithinBudget(streamDictionary, state.analysis.remainingDecodedMetadataBytes(), "decode PDF metadata stream")
	if err != nil {
		return err
	}
	if !utf8.Valid(content) {
		return errors.New("PDF metadata stream is not valid UTF-8")
	}

	name, label := state.metadataIdentity(path)
	if err := state.analysis.addMetadataBytes(name, label, content, ActionRemove); err != nil {
		return err
	}
	state.seenTargets.add(state.objectNumber, path, key)
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

func (state *traversalState) metadataIdentity(path []int) (string, string) {
	role := state.roles[state.objectNumber]
	if len(path) == 0 && role.catalog {
		return "metadata.catalog", "Document metadata"
	}
	if len(path) == 0 && role.pageNumber > 0 {
		return fmt.Sprintf("metadata.page.%04d", role.pageNumber), fmt.Sprintf("Page %d metadata", role.pageNumber)
	}

	state.metadataOrdinal++
	return fmt.Sprintf("metadata.object.%06d.%03d", state.objectNumber, state.metadataOrdinal),
		fmt.Sprintf("Embedded metadata %d", state.metadataOrdinal)
}

func hasNeutralPDFCPUTrio(context *model.Context, analysis *pdfAnalysis) bool {
	if len(analysis.metadataTargets) != 0 || len(analysis.infoTargets) != 3 || context.Info == nil {
		return false
	}
	infoDictionary, err := context.DereferenceDict(*context.Info)
	if err != nil || len(infoDictionary) != 3 {
		return false
	}

	var trio struct {
		producer     string
		creationDate string
		modDate      string
	}
	for key, object := range infoDictionary {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return false
		}
		if logicalKey != "Producer" && logicalKey != "CreationDate" && logicalKey != "ModDate" {
			return false
		}
		value, err := infoObjectValue(context, object)
		if err != nil {
			return false
		}

		switch logicalKey {
		case "Producer":
			trio.producer = value
		case "CreationDate":
			trio.creationDate = value
		case "ModDate":
			trio.modDate = value
		}
	}

	if trio.producer != "pdfcpu "+model.VersionStr || trio.creationDate != trio.modDate {
		return false
	}
	_, validDate := types.DateTime(trio.creationDate, false)
	return validDate
}
