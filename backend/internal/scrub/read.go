package scrub

import (
	"bytes"
	"fmt"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// PDF limits assume a 10 MB input and cap decoded/image amplification separately.
const (
	maxPDFStreamBytes       int64 = MaxInputBytes
	maxPDFDecodeBytes       int64 = 20_000_000
	maxPDFImagePixels       int64 = 10_000_000
	maxPDFImageBytes        int64 = 40_000_000
	maxPDFObjectCount             = 100_000
	maxPDFObjectStreamCount       = 50_000
	maxPDFObjectStreamFirst int64 = 2_000_000
	maxPDFXRefEntries             = 100_000
	maxPDFRecursionDepth          = 64
)

type validatePDFContextOperation func(*model.Context) error

func readPDFWithValidator(inputBytes []byte, validate validatePDFContextOperation) (*model.Context, error) {
	if len(inputBytes) > MaxInputBytes {
		return nil, ErrInputTooLarge
	}

	context, err := api.ReadContext(bytes.NewReader(inputBytes), boundedPDFConfiguration())
	if err != nil {
		return nil, err
	}
	if err := validateAndOptimizePDFContext(context, validate); err != nil {
		return nil, err
	}
	return context, nil
}

func validateAndOptimizePDFContext(context *model.Context, validate validatePDFContextOperation) error {
	// pdfcpu v0.15.0 validation drops later parent links to an already-validated
	// metadata stream. Preserve those links so inspection and removal stay symmetric.
	metadataEntries, err := snapshotMetadataEntries(context)
	if err != nil {
		return err
	}
	// pdfcpu v0.15.0 catalog validation calls StreamDict.Decode with its 512 MiB
	// default. Decode every discovered metadata stream under our aggregate ceiling
	// and keep the bounded content cached through validation.
	if err := preflightMetadataEntries(context, metadataEntries); err != nil {
		return err
	}
	if err := validate(context); err != nil {
		return err
	}
	restoreMetadataEntries(metadataEntries)
	if err := api.OptimizeContext(context); err != nil {
		return err
	}
	return pdfcpu.CacheFormFonts(context)
}

func boundedPDFConfiguration() *model.Configuration {
	configuration := model.NewDefaultConfiguration()
	configuration.Cmd = model.REMOVEPROPERTIES
	configuration.PostProcessValidate = true
	configuration.Limits = model.ResourceLimits{
		MaxStreamBytes:       maxPDFStreamBytes,
		MaxDecodeBytes:       maxPDFDecodeBytes,
		MaxImagePixels:       maxPDFImagePixels,
		MaxImageBytes:        maxPDFImageBytes,
		MaxObjectCount:       maxPDFObjectCount,
		MaxObjectStreamCount: maxPDFObjectStreamCount,
		MaxObjectStreamFirst: maxPDFObjectStreamFirst,
		MaxXRefEntries:       maxPDFXRefEntries,
		MaxRecursionDepth:    maxPDFRecursionDepth,
	}

	return configuration
}

type metadataEntrySnapshot struct {
	dictionary types.Dict
	key        string
	value      types.Object
}

func preflightMetadataEntries(context *model.Context, snapshots []metadataEntrySnapshot) error {
	remainingDecodeBytes := int64(maxDecodedMetadataBytes)
	decodedIndirectObjects := make(map[types.IndirectRef]struct{})

	for _, snapshot := range snapshots {
		decodedBytes, err := preflightMetadataEntry(context, snapshot, remainingDecodeBytes, decodedIndirectObjects)
		if err != nil {
			return err
		}
		remainingDecodeBytes -= decodedBytes
	}
	return nil
}

func preflightMetadataEntry(
	context *model.Context,
	snapshot metadataEntrySnapshot,
	remainingDecodeBytes int64,
	decodedIndirectObjects map[types.IndirectRef]struct{},
) (int64, error) {
	switch stream := snapshot.value.(type) {
	case types.IndirectRef:
		return preflightIndirectMetadataStream(context, stream, remainingDecodeBytes, decodedIndirectObjects)
	case types.StreamDict:
		content, err := decodeMetadataStreamWithinBudget(&stream, remainingDecodeBytes, "preflight PDF metadata stream")
		if err != nil {
			return 0, err
		}
		if int64(len(content)) > remainingDecodeBytes {
			return 0, ErrInspectionLimit
		}
		stream.Content = content
		snapshot.dictionary[snapshot.key] = stream
		return int64(len(content)), nil
	default:
		return 0, nil
	}
}

func preflightIndirectMetadataStream(
	context *model.Context,
	reference types.IndirectRef,
	remainingDecodeBytes int64,
	decodedIndirectObjects map[types.IndirectRef]struct{},
) (int64, error) {
	if _, decoded := decodedIndirectObjects[reference]; decoded {
		return 0, nil
	}
	entry, found := context.FindTableEntry(reference.ObjectNumber.Value(), reference.GenerationNumber.Value())
	if !found || entry.Free || entry.Object == nil {
		return 0, nil
	}
	stream, ok := entry.Object.(types.StreamDict)
	if !ok {
		return 0, nil
	}
	content, err := decodeMetadataStreamWithinBudget(&stream, remainingDecodeBytes, "preflight PDF metadata stream")
	if err != nil {
		return 0, err
	}
	if int64(len(content)) > remainingDecodeBytes {
		return 0, ErrInspectionLimit
	}
	stream.Content = content
	entry.Object = stream
	decodedIndirectObjects[reference] = struct{}{}
	return int64(len(content)), nil
}

func releaseMetadataStreamCache(context *model.Context, snapshot metadataEntrySnapshot) error {
	switch stream := snapshot.value.(type) {
	case types.IndirectRef:
		entry, found := context.FindTableEntry(stream.ObjectNumber.Value(), stream.GenerationNumber.Value())
		if !found || entry.Object == nil {
			return nil
		}
		storedStream, ok := entry.Object.(types.StreamDict)
		if !ok {
			return nil
		}
		storedStream.Content = nil
		entry.Object = storedStream
		return nil
	case types.StreamDict:
		stream.Content = nil
		snapshot.dictionary[snapshot.key] = stream
		return nil
	default:
		return fmt.Errorf("unsupported metadata stream type %T", snapshot.value)
	}
}

func snapshotMetadataEntries(context *model.Context) ([]metadataEntrySnapshot, error) {
	snapshots := make([]metadataEntrySnapshot, 0)
	walker := structuralWalker{
		context: context,
		inspectMetadata: func(dictionary types.Dict, key string, _ bool) error {
			snapshots = append(snapshots, metadataEntrySnapshot{dictionary: dictionary, key: key, value: dictionary[key]})
			return nil
		},
	}

	for _, objectNumber := range sortedLiveObjectNumbers(context) {
		entry := context.Table[objectNumber]
		if err := walker.walkObject(entry.Object, false); err != nil {
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
