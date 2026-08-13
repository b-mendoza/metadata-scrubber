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

type neutralPDFCPUInfo struct {
	producer     string
	creationDate string
	modDate      string
}

type neutralPDFCPUValueSetter func(*neutralPDFCPUInfo, string)

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

var neutralPDFCPUValueSetters = map[string]neutralPDFCPUValueSetter{
	"Producer":     func(info *neutralPDFCPUInfo, value string) { info.producer = value },
	"CreationDate": func(info *neutralPDFCPUInfo, value string) { info.creationDate = value },
	"ModDate":      func(info *neutralPDFCPUInfo, value string) { info.modDate = value },
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
	infoDictionary, err := dereferenceInfoDictionary(context)
	if err != nil || infoDictionary == nil {
		return err
	}

	keys, err := sortedDictionaryKeys(infoDictionary)
	if err != nil {
		return err
	}

	customFieldNumber := 0
	for _, key := range keys {
		customFieldNumber, err = analyzeInfoEntry(context, infoEntryAnalysis{
			analysis: analysis, infoDictionary: infoDictionary, key: key, customFieldNumber: customFieldNumber,
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func dereferenceInfoDictionary(context *model.Context) (types.Dict, error) {
	if context.Info == nil {
		return types.Dict{}, nil
	}
	infoDictionary, err := context.DereferenceDict(*context.Info)
	if err != nil {
		return nil, fmt.Errorf("dereference PDF Info dictionary: %w", err)
	}
	return infoDictionary, nil
}

type infoEntryAnalysis struct {
	analysis          *pdfAnalysis
	infoDictionary    types.Dict
	key               dictionaryKey
	customFieldNumber int
}

func analyzeInfoEntry(context *model.Context, entryAnalysis infoEntryAnalysis) (int, error) {
	logicalValue, err := infoObjectValue(context, entryAnalysis.infoDictionary[entryAnalysis.key.encoded])
	if err != nil {
		return entryAnalysis.customFieldNumber, fmt.Errorf("decode PDF Info field %q: %w", entryAnalysis.key.logical, err)
	}

	field, standard := standardInfoFields[entryAnalysis.key.logical]
	if !standard {
		entryAnalysis.customFieldNumber++
		field = standardInfoFieldDescriptor{
			name:   fmt.Sprintf("info.custom.%03d", entryAnalysis.customFieldNumber),
			label:  fmt.Sprintf("Custom document property %d", entryAnalysis.customFieldNumber),
			action: ActionRemove,
		}
	}
	if err := entryAnalysis.analysis.add(field.name, field.label, logicalValue, field.action); err != nil {
		return entryAnalysis.customFieldNumber, err
	}
	entryAnalysis.analysis.infoTargets = append(entryAnalysis.analysis.infoTargets, dictionaryEntryTarget{
		dictionary: entryAnalysis.infoDictionary, key: entryAnalysis.key.encoded,
	})
	return entryAnalysis.customFieldNumber, nil
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
		_ = storeMetadataStreamContent(state.context, metadataStreamContent{
			dictionary: dictionary, key: key, streamObject: streamObject,
		})
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
	if len(analysis.metadataTargets) != 0 || len(analysis.infoTargets) != 3 {
		return false
	}
	infoDictionary, err := dereferenceInfoDictionary(context)
	if err != nil || len(infoDictionary) != 3 {
		return false
	}

	trio, ok := readNeutralPDFCPUInfo(context, infoDictionary)
	if !ok || trio.producer != "pdfcpu "+model.VersionStr || trio.creationDate != trio.modDate {
		return false
	}
	_, validDate := types.DateTime(trio.creationDate, false)
	return validDate
}

func readNeutralPDFCPUInfo(context *model.Context, infoDictionary types.Dict) (neutralPDFCPUInfo, bool) {
	var trio neutralPDFCPUInfo
	for key, object := range infoDictionary {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return neutralPDFCPUInfo{}, false
		}
		setValue, known := neutralPDFCPUValueSetters[logicalKey]
		if !known {
			return neutralPDFCPUInfo{}, false
		}
		value, err := infoObjectValue(context, object)
		if err != nil {
			return neutralPDFCPUInfo{}, false
		}
		setValue(&trio, value)
	}
	return trio, true
}
