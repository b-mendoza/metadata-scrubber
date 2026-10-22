package scrub

import (
	"cmp"
	"context"
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

type traversalState struct {
	analysis        *pdfAnalysis
	context         *model.Context
	roles           map[int]objectRole
	metadataOrdinal int
	objectNumber    int
}

type metadataEntryInspector func(dictionary types.Dict, key string, nested bool) error

type structuralWalker struct {
	context         *model.Context
	inspectMetadata metadataEntryInspector
}

func sortedLiveObjectNumbers(pdfContext *model.Context) []int {
	objectNumbers := make([]int, 0, len(pdfContext.Table))
	for objectNumber, entry := range pdfContext.Table {
		if objectNumber == 0 || entry == nil || entry.Free || entry.Object == nil {
			continue
		}
		objectNumbers = append(objectNumbers, objectNumber)
	}
	slices.Sort(objectNumbers)
	return objectNumbers
}

func (walker structuralWalker) walkObject(object types.Object, nested bool) error {
	switch value := object.(type) {
	case types.Dict:
		return walker.walkDictionary(value, nested)
	case types.StreamDict:
		return walker.walkDictionary(value.Dict, nested)
	case types.ObjectStreamDict:
		return walker.walkDictionary(value.Dict, nested)
	case types.XRefStreamDict:
		return walker.walkDictionary(value.Dict, nested)
	case types.Array:
		return walker.walkArray(value)
	default:
		return nil
	}
}

func (walker structuralWalker) walkDictionary(dictionary types.Dict, nested bool) error {
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
	for _, key := range keys {
		if err := walker.walkDictionaryEntry(dictionary, key, nested); err != nil {
			return err
		}
	}
	return nil
}

func (walker structuralWalker) walkDictionaryEntry(
	dictionary types.Dict,
	key dictionaryKey,
	nested bool,
) error {
	if key.logical == "Metadata" {
		return walker.inspectMetadata(dictionary, key.encoded, nested)
	}
	value := dictionary[key.encoded]
	if _, indirect := value.(types.IndirectRef); indirect {
		return nil
	}
	return walker.walkObject(value, true)
}

func (walker structuralWalker) walkArray(array types.Array) error {
	for _, value := range array {
		if _, indirect := value.(types.IndirectRef); indirect {
			continue
		}
		if err := walker.walkObject(value, true); err != nil {
			return err
		}
	}
	return nil
}

func pdfObjectRoles(ctx context.Context, pdfContext *model.Context) (map[int]objectRole, error) {
	roles := make(map[int]objectRole, pdfContext.PageCount+1)
	if pdfContext.Root != nil {
		roles[pdfContext.Root.ObjectNumber.Value()] = objectRole{catalog: true}
	}
	for pageNumber := 1; pageNumber <= pdfContext.PageCount; pageNumber++ {
		pageReference, err := pdfContext.PageDictIndRef(ctx, pageNumber)
		if err != nil {
			return nil, fmt.Errorf("resolve PDF page %d: %w", pageNumber, err)
		}
		if pageReference != nil {
			roles[pageReference.ObjectNumber.Value()] = objectRole{pageNumber: pageNumber}
		}
	}
	return roles, nil
}

func dictionaryHasSignatureType(pdfContext *model.Context, dictionary types.Dict) (bool, error) {
	typeObject, exists := dictionary.Find("Type")
	if !exists {
		return false, nil
	}
	dereferencedType, err := pdfContext.Dereference(typeObject)
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

func pdfHasCachedSignature(pdfContext *model.Context) bool {
	return pdfHasCachedSignatureState(pdfContext) || pdfHasSignedIncrement(pdfContext)
}

func pdfHasCachedSignatureState(pdfContext *model.Context) bool {
	return pdfContext.SignatureExist ||
		pdfContext.AppendOnly ||
		len(pdfContext.URSignature) > 0 ||
		pdfContext.CertifiedSigObjNr > 0 ||
		!pdfContext.DTS.IsZero()
}

func pdfHasSignedIncrement(pdfContext *model.Context) bool {
	for _, incrementSignatures := range pdfContext.Signatures {
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
	slices.SortFunc(keys, func(firstKey dictionaryKey, secondKey dictionaryKey) int {
		return cmp.Or(
			cmp.Compare(firstKey.logical, secondKey.logical),
			cmp.Compare(firstKey.encoded, secondKey.encoded),
		)
	})
	return keys, nil
}
