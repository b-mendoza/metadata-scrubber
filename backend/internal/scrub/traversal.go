package scrub

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type objectRole struct {
	catalog    bool
	pageNumber int
}

type dictionaryKey struct {
	encoded string
	logical string
}

type metadataTargetIdentity struct {
	objectNumber int
	path         []int
	key          string
}

type metadataTargetTracker struct {
	identities []metadataTargetIdentity
}

func (tracker *metadataTargetTracker) contains(objectNumber int, path []int, key string) bool {
	for _, identity := range tracker.identities {
		if identity.objectNumber == objectNumber && identity.key == key && slices.Equal(identity.path, path) {
			return true
		}
	}
	return false
}

func (tracker *metadataTargetTracker) add(objectNumber int, path []int, key string) {
	tracker.identities = append(tracker.identities, metadataTargetIdentity{
		objectNumber: objectNumber,
		path:         slices.Clone(path),
		key:          key,
	})
}

type traversalState struct {
	analysis        *pdfAnalysis
	context         *model.Context
	roles           map[int]objectRole
	seenTargets     *metadataTargetTracker
	metadataOrdinal int
	objectNumber    int
}

type metadataEntryInspector func(dictionary types.Dict, key string, path []int) error

type structuralWalker struct {
	context         *model.Context
	inspectMetadata metadataEntryInspector
}

type structuralObjectWalker func(structuralWalker, types.Object, []int) error

func newStructuralObjectWalkers() map[string]structuralObjectWalker {
	return map[string]structuralObjectWalker{
		"types.Dict":             walkDictionaryObject,
		"types.StreamDict":       walkStreamDictionaryObject,
		"types.ObjectStreamDict": walkObjectStreamDictionaryObject,
		"types.XRefStreamDict":   walkXRefStreamDictionaryObject,
		"types.Array":            walkArrayObject,
	}
}

func sortedLiveObjectNumbers(context *model.Context) []int {
	objectNumbers := make([]int, 0, len(context.Table))
	for objectNumber, entry := range context.Table {
		if objectNumber == 0 || entry == nil || entry.Free || entry.Object == nil {
			continue
		}
		objectNumbers = append(objectNumbers, objectNumber)
	}
	slices.Sort(objectNumbers)
	return objectNumbers
}

func (walker structuralWalker) walkObject(object types.Object, path []int) error {
	walk, known := newStructuralObjectWalkers()[fmt.Sprintf("%T", object)]
	if !known {
		return nil
	}
	return walk(walker, object, path)
}

func walkDictionaryObject(walker structuralWalker, object types.Object, path []int) error {
	value, ok := object.(types.Dict)
	if !ok {
		return fmt.Errorf("unsupported dictionary object type %T", object)
	}
	return walker.walkDictionary(value, path)
}

func walkStreamDictionaryObject(walker structuralWalker, object types.Object, path []int) error {
	value, ok := object.(types.StreamDict)
	if !ok {
		return fmt.Errorf("unsupported stream dictionary object type %T", object)
	}
	return walker.walkDictionary(value.Dict, path)
}

func walkObjectStreamDictionaryObject(walker structuralWalker, object types.Object, path []int) error {
	value, ok := object.(types.ObjectStreamDict)
	if !ok {
		return fmt.Errorf("unsupported object stream dictionary type %T", object)
	}
	return walker.walkDictionary(value.Dict, path)
}

func walkXRefStreamDictionaryObject(walker structuralWalker, object types.Object, path []int) error {
	value, ok := object.(types.XRefStreamDict)
	if !ok {
		return fmt.Errorf("unsupported xref stream dictionary type %T", object)
	}
	return walker.walkDictionary(value.Dict, path)
}

func walkArrayObject(walker structuralWalker, object types.Object, path []int) error {
	value, ok := object.(types.Array)
	if !ok {
		return fmt.Errorf("unsupported array object type %T", object)
	}
	return walker.walkArray(value, path)
}

func (walker structuralWalker) walkDictionary(dictionary types.Dict, path []int) error {
	hasSignatureType, err := dictionaryHasSignatureType(walker.context, dictionary)
	if err != nil {
		return err
	}
	if hasSignatureType {
		return ErrSignedPDF
	}

	keys, err := sortedDictionaryKeys(dictionary)
	if err != nil {
		return err
	}
	for keyIndex, key := range keys {
		if err := walker.walkDictionaryEntry(dictionary, key, keyIndex, path); err != nil {
			return err
		}
	}
	return nil
}

func (walker structuralWalker) walkDictionaryEntry(
	dictionary types.Dict,
	key dictionaryKey,
	keyIndex int,
	path []int,
) error {
	if key.logical == "Metadata" {
		return walker.inspectMetadata(dictionary, key.encoded, path)
	}
	value := dictionary[key.encoded]
	if _, indirect := value.(types.IndirectRef); indirect {
		return nil
	}
	childPath := append(slices.Clone(path), keyIndex+1)
	return walker.walkObject(value, childPath)
}

func (walker structuralWalker) walkArray(array types.Array, path []int) error {
	for valueIndex, value := range array {
		if _, indirect := value.(types.IndirectRef); indirect {
			continue
		}
		childPath := append(slices.Clone(path), valueIndex+1)
		if err := walker.walkObject(value, childPath); err != nil {
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

func dictionaryHasSignatureType(context *model.Context, dictionary types.Dict) (bool, error) {
	typeObject, exists := dictionary.Find("Type")
	if !exists {
		return false, nil
	}
	dereferencedType, err := context.Dereference(typeObject)
	if err != nil {
		return false, fmt.Errorf("dereference PDF dictionary Type: %w", err)
	}
	name, ok := dereferencedType.(types.Name)
	if !ok {
		return false, nil
	}
	decodedName, err := types.DecodeName(name.Value())
	if err != nil {
		return false, fmt.Errorf("decode PDF dictionary Type: %w", err)
	}
	return decodedName == "Sig" || decodedName == "DocTimeStamp", nil
}

func pdfHasCachedSignature(context *model.Context) bool {
	return pdfHasCachedSignatureState(context) || pdfHasSignedIncrement(context)
}

func pdfHasCachedSignatureState(context *model.Context) bool {
	return context.SignatureExist ||
		context.AppendOnly ||
		len(context.URSignature) > 0 ||
		context.CertifiedSigObjNr > 0 ||
		!context.DTS.IsZero()
}

func pdfHasSignedIncrement(context *model.Context) bool {
	for _, incrementSignatures := range context.Signatures {
		for _, signature := range incrementSignatures {
			if signature.Signed {
				return true
			}
		}
	}
	return false
}

// sortedDictionaryKeys returns every dictionary key with its decoded logical
// name, so that callers never decode the same key a second time.
func sortedDictionaryKeys(dictionary types.Dict) ([]dictionaryKey, error) {
	keys := make([]dictionaryKey, 0, len(dictionary))
	for key := range dictionary {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return nil, fmt.Errorf("decode PDF dictionary key: %w", err)
		}
		keys = append(keys, dictionaryKey{encoded: key, logical: logicalKey})
	}
	slices.SortFunc(keys, func(firstKey, secondKey dictionaryKey) int {
		return cmp.Or(
			cmp.Compare(firstKey.logical, secondKey.logical),
			cmp.Compare(firstKey.encoded, secondKey.encoded),
		)
	})
	return keys, nil
}
