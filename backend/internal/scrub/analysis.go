package scrub

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
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

type summaryBuilder struct {
	fields               []Field
	totalBytes           int
	decodedMetadataBytes int64
}

type objectRole struct {
	catalog    bool
	pageNumber int
}

type traversalState struct {
	analysis        *pdfAnalysis
	builder         *summaryBuilder
	context         *model.Context
	roles           map[int]objectRole
	seenTargets     map[string]struct{}
	metadataOrdinal int
	objectNumber    int
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
		analysis.infoTargets = nil
		return analysis, nil
	}

	sort.Slice(builder.fields, func(firstIndex, secondIndex int) bool {
		firstField := builder.fields[firstIndex]
		secondField := builder.fields[secondIndex]
		if firstField.Name == secondField.Name {
			return firstField.Label < secondField.Label
		}
		return firstField.Name < secondField.Name
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

		name, label, action, standard := standardInfoField(logicalKey)
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

func standardInfoField(key string) (string, string, FieldAction, bool) {
	fields := map[string]struct {
		name   string
		label  string
		action FieldAction
	}{
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
	field, exists := fields[key]
	if !exists {
		return "", "", "", false
	}
	return field.name, field.label, field.action, true
}

func analyzeObjectMetadata(context *model.Context, analysis *pdfAnalysis, builder *summaryBuilder) error {
	roles, err := pdfObjectRoles(context)
	if err != nil {
		return err
	}

	objectNumbers := make([]int, 0, len(context.Table))
	for objectNumber, entry := range context.Table {
		if objectNumber == 0 || entry == nil || entry.Free || entry.Object == nil {
			continue
		}
		objectNumbers = append(objectNumbers, objectNumber)
	}
	sort.Ints(objectNumbers)

	seenTargets := make(map[string]struct{})
	for _, objectNumber := range objectNumbers {
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

func pdfObjectRoles(context *model.Context) (map[int]objectRole, error) {
	roles := make(map[int]objectRole, context.PageCount+1)
	if context.Root != nil {
		roles[context.Root.ObjectNumber.Value()] = objectRole{catalog: true}
	}
	for pageNumber := 1; pageNumber <= context.PageCount; pageNumber++ {
		pageReference, err := context.PageDictIndRef(pageNumber)
		if err != nil {
			return nil, fmt.Errorf("resolve PDF page %d: %w", pageNumber, err)
		}
		if pageReference != nil {
			roles[pageReference.ObjectNumber.Value()] = objectRole{pageNumber: pageNumber}
		}
	}
	return roles, nil
}

func (state *traversalState) inspectObject(object types.Object, path []int) error {
	switch value := object.(type) {
	case types.Dict:
		return state.inspectDictionary(value, path)
	case types.StreamDict:
		return state.inspectDictionary(value.Dict, path)
	case types.ObjectStreamDict:
		return state.inspectDictionary(value.Dict, path)
	case types.XRefStreamDict:
		return state.inspectDictionary(value.Dict, path)
	case types.Array:
		return state.inspectArray(value, path)
	case types.IndirectRef:
		return nil
	default:
		return nil
	}
}

func (state *traversalState) inspectDictionary(dictionary types.Dict, path []int) error {
	if dictionaryHasSignatureType(state.context, dictionary) {
		return ErrSignedPDF
	}

	keys, err := sortedDictionaryKeys(dictionary)
	if err != nil {
		return err
	}
	for keyIndex, key := range keys {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return fmt.Errorf("decode PDF dictionary key: %w", err)
		}
		if logicalKey == "Metadata" {
			if err := state.inspectMetadataEntry(dictionary, key, path); err != nil {
				return err
			}
			continue
		}

		value := dictionary[key]
		if _, indirect := value.(types.IndirectRef); indirect {
			continue
		}
		childPath := appendPath(path, keyIndex+1)
		if err := state.inspectObject(value, childPath); err != nil {
			return err
		}
	}

	return nil
}

func (state *traversalState) inspectArray(array types.Array, path []int) error {
	for valueIndex, value := range array {
		if _, indirect := value.(types.IndirectRef); indirect {
			continue
		}
		if err := state.inspectObject(value, appendPath(path, valueIndex+1)); err != nil {
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

func dictionaryHasSignatureType(context *model.Context, dictionary types.Dict) bool {
	typeObject, exists := dictionary.Find("Type")
	if !exists {
		return false
	}
	dereferencedType, err := context.Dereference(typeObject)
	if err != nil {
		return false
	}
	name, ok := dereferencedType.(types.Name)
	if !ok {
		return false
	}
	decodedName, err := types.DecodeName(name.Value())
	return err == nil && (decodedName == "Sig" || decodedName == "DocTimeStamp")
}

func pdfHasCachedSignature(context *model.Context) bool {
	if context.SignatureExist || context.AppendOnly || len(context.URSignature) > 0 || context.CertifiedSigObjNr > 0 || !context.DTS.IsZero() {
		return true
	}
	for _, incrementSignatures := range context.Signatures {
		for _, signature := range incrementSignatures {
			if signature.Signed {
				return true
			}
		}
	}
	return false
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

func (builder *summaryBuilder) add(name, label, value string, action FieldAction) error {
	return builder.addPreview(name, label, truncateUTF8(value, maxFieldPreviewBytes), len(value), action)
}

func (builder *summaryBuilder) remainingDecodedMetadataBytes() int64 {
	return maxDecodedMetadataBytes - builder.decodedMetadataBytes
}

func (builder *summaryBuilder) addMetadataBytes(name, label string, value []byte, action FieldAction) error {
	if !utf8.Valid(value) {
		return errors.New("metadata preview is not valid UTF-8")
	}
	if int64(len(value)) > builder.remainingDecodedMetadataBytes() {
		return ErrInspectionLimit
	}

	previewBytes := truncateUTF8Bytes(value, maxFieldPreviewBytes)
	if err := builder.addPreview(name, label, string(previewBytes), len(value), action); err != nil {
		return err
	}
	builder.decodedMetadataBytes += int64(len(value))
	return nil
}

func (builder *summaryBuilder) addPreview(name, label, preview string, originalByteSize int, action FieldAction) error {
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

func truncateUTF8(value string, byteLimit int) string {
	previewLength := min(len(value), byteLimit)
	for !utf8.ValidString(value[:previewLength]) {
		previewLength--
	}
	return strings.Clone(value[:previewLength])
}

func truncateUTF8Bytes(value []byte, byteLimit int) []byte {
	previewLength := min(len(value), byteLimit)
	for !utf8.Valid(value[:previewLength]) {
		previewLength--
	}
	return value[:previewLength]
}

func sortedDictionaryKeys(dictionary types.Dict) ([]string, error) {
	keys := make([]string, 0, len(dictionary))
	for key := range dictionary {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(firstIndex, secondIndex int) bool {
		firstKey, firstErr := types.DecodeName(keys[firstIndex])
		secondKey, secondErr := types.DecodeName(keys[secondIndex])
		if firstErr != nil || secondErr != nil || firstKey == secondKey {
			return keys[firstIndex] < keys[secondIndex]
		}
		return firstKey < secondKey
	})
	for _, key := range keys {
		if _, err := types.DecodeName(key); err != nil {
			return nil, fmt.Errorf("decode PDF dictionary key: %w", err)
		}
	}
	return keys, nil
}

func appendPath(path []int, component int) []int {
	childPath := make([]int, len(path)+1)
	copy(childPath, path)
	childPath[len(path)] = component
	return childPath
}
