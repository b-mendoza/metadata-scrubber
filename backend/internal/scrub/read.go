package scrub

import (
	"bytes"
	"errors"
	"fmt"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	pdfcpu "github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/filter"
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

func readPDF(inputBytes []byte) (*model.Context, error) {
	return readPDFWithValidator(inputBytes, api.ValidateContext)
}

func readPDFWithValidator(inputBytes []byte, validate validatePDFContextOperation) (*model.Context, error) {
	if len(inputBytes) > MaxInputBytes {
		return nil, ErrInputTooLarge
	}
	if validate == nil {
		return nil, errors.New("PDF context validator is nil")
	}

	configuration := boundedPDFConfiguration()
	context, err := api.ReadContext(bytes.NewReader(inputBytes), configuration)
	if err != nil {
		return nil, err
	}

	// pdfcpu v0.14.0 validation drops later parent links to an already-validated
	// metadata stream. Preserve those links so inspection and removal stay symmetric.
	metadataEntries, err := snapshotMetadataEntries(context)
	if err != nil {
		return nil, err
	}
	// pdfcpu v0.14.0 catalog validation calls StreamDict.Decode with its 512 MiB
	// default. Decode every discovered metadata stream under our aggregate ceiling
	// and keep the bounded content cached through validation.
	if err := preflightMetadataEntries(context, metadataEntries); err != nil {
		return nil, err
	}
	if err := validate(context); err != nil {
		return nil, err
	}
	restoreMetadataEntries(metadataEntries)
	if err := api.OptimizeContext(context); err != nil {
		return nil, err
	}
	if err := pdfcpu.CacheFormFonts(context); err != nil {
		return nil, err
	}

	return context, nil
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
