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
	builder         *summaryBuilder
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
	switch value := object.(type) {
	case types.Dict:
		return walker.walkDictionary(value, path)
	case types.StreamDict:
		return walker.walkDictionary(value.Dict, path)
	case types.ObjectStreamDict:
		return walker.walkDictionary(value.Dict, path)
	case types.XRefStreamDict:
		return walker.walkDictionary(value.Dict, path)
	case types.Array:
		return walker.walkArray(value, path)
	default:
		return nil
	}
}

func (walker structuralWalker) walkDictionary(dictionary types.Dict, path []int) error {
	if dictionaryHasSignatureType(walker.context, dictionary) {
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
			if err := walker.inspectMetadata(dictionary, key, path); err != nil {
				return err
			}
			continue
		}

		value := dictionary[key]
		if _, indirect := value.(types.IndirectRef); indirect {
			continue
		}
		childPath := append(slices.Clone(path), keyIndex+1)
		if err := walker.walkObject(value, childPath); err != nil {
			return err
		}
	}

	return nil
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

func (state *traversalState) inspectObject(object types.Object, path []int) error {
	walker := structuralWalker{context: state.context, inspectMetadata: state.inspectMetadataEntry}
	return walker.walkObject(object, path)
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

func sortedDictionaryKeys(dictionary types.Dict) ([]string, error) {
	keys := make([]string, 0, len(dictionary))
	logicalKeys := make(map[string]string, len(dictionary))
	for key := range dictionary {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return nil, fmt.Errorf("decode PDF dictionary key: %w", err)
		}
		keys = append(keys, key)
		logicalKeys[key] = logicalKey
	}
	slices.SortFunc(keys, func(firstKey, secondKey string) int {
		return cmp.Or(
			cmp.Compare(logicalKeys[firstKey], logicalKeys[secondKey]),
			cmp.Compare(firstKey, secondKey),
		)
	})
	return keys, nil
}
