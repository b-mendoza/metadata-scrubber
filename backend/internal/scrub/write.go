package scrub

import (
	"errors"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

func verifyScrubbedPDF(outputBytes []byte) error {
	context, analysis, err := readAndAnalyzePDF(outputBytes)
	if err != nil {
		return err
	}
	if len(analysis.fields) != 0 && !hasNeutralPDFCPUTrio(context, analysis) {
		return errors.New("PDF metadata remained after scrub")
	}
	return nil
}

func removeAnalyzedMetadata(context *model.Context, analysis *pdfAnalysis) {
	for key := range analysis.infoDictionary {
		delete(analysis.infoDictionary, key)
	}
	for _, target := range analysis.metadataTargets {
		delete(target.dictionary, target.key)
	}

	context.Title = ""
	context.Subject = ""
	context.Author = ""
	context.Creator = ""
	context.Producer = ""
	context.XRefTable.CreationDate = ""
	context.ModDate = ""
	context.Keywords = ""
	context.KeywordList = map[string]bool{}
	context.Properties = map[string]string{}
	context.CatalogXMPMeta = nil
}

type neutralPDFCPUInfo struct {
	producer     string
	creationDate string
	modDate      string
}

func hasNeutralPDFCPUTrio(context *model.Context, analysis *pdfAnalysis) bool {
	if len(analysis.metadataTargets) != 0 || len(analysis.infoDictionary) != 3 {
		return false
	}

	trio, ok := readNeutralPDFCPUInfo(context, analysis.infoDictionary)
	if !ok || trio.producer != "pdfcpu "+model.VersionStr || trio.creationDate != trio.modDate {
		return false
	}
	_, validDate := types.DateTime(trio.creationDate, false)
	return validDate
}

func readNeutralPDFCPUInfo(context *model.Context, infoDictionary types.Dict) (neutralPDFCPUInfo, bool) {
	var trio neutralPDFCPUInfo
	for key, object := range infoDictionary {
		logicalKey, err := types.DecodeName(key)
		if err != nil {
			return neutralPDFCPUInfo{}, false
		}
		var target *string
		switch logicalKey {
		case "Producer":
			target = &trio.producer
		case "CreationDate":
			target = &trio.creationDate
		case "ModDate":
			target = &trio.modDate
		default:
			return neutralPDFCPUInfo{}, false
		}
		value, err := infoObjectValue(context, object)
		if err != nil {
			return neutralPDFCPUInfo{}, false
		}
		*target = value
	}
	return trio, true
}
