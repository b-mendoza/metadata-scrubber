package scrub

import (
	"bytes"
	"errors"
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
	indirectReference, indirect := snapshot.value.(types.IndirectRef)
	if indirect {
		if _, decoded := decodedIndirectObjects[indirectReference]; decoded {
			return 0, nil
		}
	}

	streamDictionary := metadataStreamForPreflight(context, snapshot.value)
	if streamDictionary == nil {
		return 0, nil
	}
	content, err := decodeMetadataStreamForPreflight(streamDictionary, remainingDecodeBytes)
	if err != nil {
		return 0, err
	}
	if err := storeMetadataStreamContent(context, metadataStreamContent{
		dictionary: snapshot.dictionary, key: snapshot.key, streamObject: snapshot.value, content: content,
	}); err != nil {
		return 0, err
	}
	if indirect {
		decodedIndirectObjects[indirectReference] = struct{}{}
	}
	return int64(len(content)), nil
}

// metadataStreamForPreflight returns a pointer to a copy of the value held by
// the xref-table entry or the parent dictionary, so a write through it never
// reaches that owner. storeMetadataStreamContent must re-resolve the entry to
// cache decoded content.
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
		content, err = decodeMetadataStreamWithinBudget(streamDictionary, remainingDecodeBytes, "preflight PDF metadata stream")
		if err != nil {
			return nil, err
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

type metadataStreamContent struct {
	dictionary   types.Dict
	key          string
	streamObject types.Object
	content      []byte
}

func storeMetadataStreamContent(context *model.Context, streamContent metadataStreamContent) error {
	switch streamContent.streamObject.(type) {
	case types.IndirectRef:
		return storeIndirectMetadataStreamContent(context, streamContent)
	case types.StreamDict:
		return storeDirectMetadataStreamContent(context, streamContent)
	default:
		return fmt.Errorf("unsupported metadata stream type %T", streamContent.streamObject)
	}
}

func storeIndirectMetadataStreamContent(context *model.Context, streamContent metadataStreamContent) error {
	stream, ok := streamContent.streamObject.(types.IndirectRef)
	if !ok {
		return fmt.Errorf("unsupported indirect metadata stream type %T", streamContent.streamObject)
	}
	entry, storedStream, found := resolveIndirectMetadataStream(context, stream)
	if !found {
		return nil
	}
	storedStream.Content = streamContent.content
	entry.Object = storedStream
	return nil
}

func storeDirectMetadataStreamContent(_ *model.Context, streamContent metadataStreamContent) error {
	stream, ok := streamContent.streamObject.(types.StreamDict)
	if !ok {
		return fmt.Errorf("unsupported direct metadata stream type %T", streamContent.streamObject)
	}
	stream.Content = streamContent.content
	streamContent.dictionary[streamContent.key] = stream
	return nil
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
