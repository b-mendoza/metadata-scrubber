package scrub

import (
	"errors"
	"fmt"

	"github.com/pdfcpu/pdfcpu/pkg/filter"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type metadataEntrySnapshot struct {
	dictionary types.Dict
	key        string
	value      types.Object
}

func preflightMetadataEntries(context *model.Context, snapshots []metadataEntrySnapshot) error {
	remainingDecodeBytes := int64(maxDecodedMetadataBytes)
	decodedIndirectObjects := make(map[types.IndirectRef]struct{})

	for _, snapshot := range snapshots {
		indirectReference, indirect := snapshot.value.(types.IndirectRef)
		if indirect {
			if _, decoded := decodedIndirectObjects[indirectReference]; decoded {
				continue
			}
		}

		streamDictionary := metadataStreamForPreflight(context, snapshot.value)
		if streamDictionary == nil {
			continue
		}

		content, err := decodeMetadataStreamForPreflight(streamDictionary, remainingDecodeBytes)
		if err != nil {
			return err
		}
		storeMetadataStreamContent(context, snapshot.dictionary, snapshot.key, snapshot.value, streamDictionary.Content)
		remainingDecodeBytes -= int64(len(content))
		if indirect {
			decodedIndirectObjects[indirectReference] = struct{}{}
		}
	}

	return nil
}

func metadataStreamForPreflight(context *model.Context, object types.Object) *types.StreamDict {
	if indirectReference, indirect := object.(types.IndirectRef); indirect {
		entry, streamDictionary, found := resolveIndirectMetadataStream(context, indirectReference)
		if !found || entry.Free {
			return nil
		}
		return &streamDictionary
	}

	streamDictionary, stream := object.(types.StreamDict)
	if !stream {
		return nil
	}
	return &streamDictionary
}

func decodeMetadataStreamForPreflight(streamDictionary *types.StreamDict, remainingDecodeBytes int64) ([]byte, error) {
	if remainingDecodeBytes <= 0 {
		return nil, ErrInspectionLimit
	}

	content := streamDictionary.Content
	if content == nil {
		var err error
		content, err = streamDictionary.DecodeLengthWithLimit(-1, min(maxPDFDecodeBytes, remainingDecodeBytes))
		if errors.Is(err, filter.ErrDecodeLimitExceeded) {
			return nil, ErrInspectionLimit
		}
		if err != nil {
			return nil, fmt.Errorf("preflight PDF metadata stream: %w", err)
		}
	}
	if int64(len(content)) > remainingDecodeBytes {
		return nil, ErrInspectionLimit
	}
	return content, nil
}

func resolveIndirectMetadataStream(
	context *model.Context,
	indirectReference types.IndirectRef,
) (*model.XRefTableEntry, types.StreamDict, bool) {
	entry, found := context.FindTableEntry(
		indirectReference.ObjectNumber.Value(),
		indirectReference.GenerationNumber.Value(),
	)
	if !found || entry.Object == nil {
		return nil, types.StreamDict{}, false
	}
	streamDictionary, stream := entry.Object.(types.StreamDict)
	if !stream {
		return nil, types.StreamDict{}, false
	}
	return entry, streamDictionary, true
}

func storeMetadataStreamContent(
	context *model.Context,
	dictionary types.Dict,
	key string,
	streamObject types.Object,
	content []byte,
) {
	switch stream := streamObject.(type) {
	case types.IndirectRef:
		entry, storedStream, found := resolveIndirectMetadataStream(context, stream)
		if !found {
			return
		}
		storedStream.Content = content
		entry.Object = storedStream
	case types.StreamDict:
		stream.Content = content
		dictionary[key] = stream
	}
}

func snapshotMetadataEntries(context *model.Context) ([]metadataEntrySnapshot, error) {
	snapshots := make([]metadataEntrySnapshot, 0)
	walker := structuralWalker{
		context: context,
		inspectMetadata: func(dictionary types.Dict, key string, _ []int) error {
			snapshots = append(snapshots, metadataEntrySnapshot{dictionary: dictionary, key: key, value: dictionary[key]})
			return nil
		},
	}

	for _, objectNumber := range sortedLiveObjectNumbers(context) {
		entry := context.Table[objectNumber]
		if err := walker.walkObject(entry.Object, nil); err != nil {
			return nil, err
		}
	}

	return snapshots, nil
}

func restoreMetadataEntries(snapshots []metadataEntrySnapshot) {
	for _, snapshot := range snapshots {
		if _, exists := snapshot.dictionary[snapshot.key]; !exists {
			snapshot.dictionary[snapshot.key] = snapshot.value
		}
	}
}
