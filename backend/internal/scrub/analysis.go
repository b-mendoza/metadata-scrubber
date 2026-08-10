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
	fields          []Field
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

	analysis := &pdfAnalysis{}
	builder := &summaryBuilder{fields: make([]Field, 0)}

	if err := analyzeInfoDictionary(context, analysis, builder); err != nil {
		return nil, err
	}
	if err := analyzeObjectMetadata(context, analysis, builder); err != nil {
		return nil, err
	}

	if origin == PostWriteVerification && hasNeutralPDFCPUTrio(context, analysis) {
		analysis.fields = []Field{}
		return analysis, nil
	}

	slices.SortStableFunc(builder.fields, func(firstField, secondField Field) int {
		return cmp.Or(
			cmp.Compare(firstField.Name, secondField.Name),
			cmp.Compare(firstField.Label, secondField.Label),
		)
	})
	analysis.fields = builder.fields

	return analysis, nil
}

func analyzeInfoDictionary(context *model.Context, analysis *pdfAnalysis, builder *summaryBuilder) error {
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
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return fmt.Errorf("decode PDF Info key: %w", err)
		}
		logicalValue, err := infoObjectValue(context, infoDictionary[key])
		if err != nil {
			return fmt.Errorf("decode PDF Info field %q: %w", logicalKey, err)
		}

		field, standard := standardInfoFields[logicalKey]
		name, label, action := field.name, field.label, field.action
		if !standard {
			customFieldNumber++
			name = fmt.Sprintf("info.custom.%03d", customFieldNumber)
			label = fmt.Sprintf("Custom document property %d", customFieldNumber)
			action = ActionRemove
		}

		if err := builder.add(name, label, logicalValue, action); err != nil {
			return err
		}
		analysis.infoTargets = append(analysis.infoTargets, dictionaryEntryTarget{dictionary: infoDictionary, key: key})
	}

	return nil
}

func analyzeObjectMetadata(context *model.Context, analysis *pdfAnalysis, builder *summaryBuilder) error {
	roles, err := pdfObjectRoles(context)
	if err != nil {
		return err
	}

	seenTargets := make(map[string]struct{})
	for _, objectNumber := range sortedLiveObjectNumbers(context) {
		entry := context.Table[objectNumber]
		state := traversalState{
			analysis:     analysis,
			builder:      builder,
			context:      context,
			roles:        roles,
			seenTargets:  seenTargets,
			objectNumber: objectNumber,
		}
		if err := state.inspectObject(entry.Object, nil); err != nil {
			return err
		}
	}

	return nil
}

func (state *traversalState) inspectMetadataEntry(dictionary types.Dict, key string, path []int) error {
	targetIdentity := fmt.Sprintf("%d:%v:%s", state.objectNumber, path, key)
	if _, exists := state.seenTargets[targetIdentity]; exists {
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
	defer releaseDecodedMetadataStream(state.context, dictionary, key, streamObject, streamDictionary)

	remainingDecodeBytes := state.builder.remainingDecodedMetadataBytes()
	if remainingDecodeBytes == 0 {
		return ErrInspectionLimit
	}
	content, err := streamDictionary.DecodeLengthWithLimit(-1, min(maxPDFDecodeBytes, remainingDecodeBytes))
	if errors.Is(err, filter.ErrDecodeLimitExceeded) {
		return ErrInspectionLimit
	}
	if err != nil {
		return fmt.Errorf("decode PDF metadata stream: %w", err)
	}
	if !utf8.Valid(content) {
		return errors.New("PDF metadata stream is not valid UTF-8")
	}

	name, label := state.metadataIdentity(path)
	if err := state.builder.addMetadataBytes(name, label, content, ActionRemove); err != nil {
		return err
	}
	state.seenTargets[targetIdentity] = struct{}{}
	state.analysis.metadataTargets = append(state.analysis.metadataTargets, dictionaryEntryTarget{dictionary: dictionary, key: key})

	return nil
}

func releaseDecodedMetadataStream(
	context *model.Context,
	dictionary types.Dict,
	key string,
	streamObject types.Object,
	streamDictionary *types.StreamDict,
) {
	streamDictionary.Content = nil
	storeMetadataStreamContent(context, dictionary, key, streamObject, nil)
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

	values := make(map[string]string, 3)
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
		values[logicalKey] = value
	}

	if values["Producer"] != "pdfcpu "+model.VersionStr || values["CreationDate"] != values["ModDate"] {
		return false
	}
	_, validDate := types.DateTime(values["CreationDate"], false)
	return validDate
}
