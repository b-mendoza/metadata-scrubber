package scrub

import (
	"bytes"
	"context"
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

type validatePDFContextOperation func(context.Context, *model.Context) error

func readPDFWithValidator(ctx context.Context, inputBytes []byte, validate validatePDFContextOperation) (*model.Context, error) {
	if len(inputBytes) > MaxInputBytes {
		return nil, ErrInputTooLarge
	}

	pdfContext, err := api.ReadContext(ctx, bytes.NewReader(inputBytes), boundedPDFConfiguration())
	if err != nil {
		return nil, err
	}
	if err := validateAndOptimizePDFContext(ctx, pdfContext, validate); err != nil {
		return nil, err
	}
	return pdfContext, nil
}

func validateAndOptimizePDFContext(ctx context.Context, pdfContext *model.Context, validate validatePDFContextOperation) error {
	// Preserve shared metadata links across validation so inspection and removal stay symmetric.
	metadataEntries, err := snapshotMetadataEntries(pdfContext)
	if err != nil {
		return err
	}
	// Preflight the aggregate metadata budget; pdfcpu limits each stream separately.
	if err := preflightMetadataEntries(pdfContext, metadataEntries); err != nil {
		return err
	}
	if err := validate(ctx, pdfContext); err != nil {
		return err
	}
	restoreMetadataEntries(metadataEntries)
	if err := api.OptimizeContext(ctx, pdfContext); err != nil {
		return err
	}
	return pdfcpu.CacheFormFonts(pdfContext)
}

func boundedPDFConfiguration() *model.Configuration {
	configuration := model.NewStatelessConfiguration()
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

func preflightMetadataEntries(pdfContext *model.Context, snapshots []metadataEntrySnapshot) error {
	remainingDecodeBytes := int64(maxDecodedMetadataBytes)
	decodedIndirectObjects := make(map[types.IndirectRef]struct{})

	for _, snapshot := range snapshots {
		decodedBytes, err := preflightMetadataEntry(pdfContext, snapshot, remainingDecodeBytes, decodedIndirectObjects)
		if err != nil {
			return err
		}
		remainingDecodeBytes -= decodedBytes
	}
	return nil
}

func preflightMetadataEntry(
	pdfContext *model.Context,
	snapshot metadataEntrySnapshot,
	remainingDecodeBytes int64,
	decodedIndirectObjects map[types.IndirectRef]struct{},
) (int64, error) {
	switch stream := snapshot.value.(type) {
	case types.IndirectRef:
		return preflightIndirectMetadataStream(pdfContext, stream, remainingDecodeBytes, decodedIndirectObjects)
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
	pdfContext *model.Context,
	reference types.IndirectRef,
	remainingDecodeBytes int64,
	decodedIndirectObjects map[types.IndirectRef]struct{},
) (int64, error) {
	if _, decoded := decodedIndirectObjects[reference]; decoded {
		return 0, nil
	}
	entry, found := pdfContext.FindTableEntry(reference.ObjectNumber.Value(), reference.GenerationNumber.Value())
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

func releaseMetadataStreamCache(pdfContext *model.Context, snapshot metadataEntrySnapshot) error {
	switch stream := snapshot.value.(type) {
	case types.IndirectRef:
		entry, found := pdfContext.FindTableEntry(stream.ObjectNumber.Value(), stream.GenerationNumber.Value())
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

func snapshotMetadataEntries(pdfContext *model.Context) ([]metadataEntrySnapshot, error) {
	snapshots := make([]metadataEntrySnapshot, 0)
	walker := structuralWalker{
		context: pdfContext,
		inspectMetadata: func(dictionary types.Dict, key string, _ bool) error {
			snapshots = append(snapshots, metadataEntrySnapshot{dictionary: dictionary, key: key, value: dictionary[key]})
			return nil
		},
	}

	for _, objectNumber := range sortedLiveObjectNumbers(pdfContext) {
		entry := pdfContext.Table[objectNumber]
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
