package scrub

import (
	"context"
	"errors"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

func verifyScrubbedPDF(ctx context.Context, outputBytes []byte) error {
	pdfContext, analysis, err := readAndAnalyzePDF(ctx, outputBytes)
	if err != nil {
		return err
	}
	if len(analysis.fields) != 0 && !hasNeutralPDFCPUTrio(pdfContext, analysis) {
		return errors.New("PDF metadata remained after scrub")
	}
	return nil
}

func removeAnalyzedMetadata(pdfContext *model.Context, analysis *pdfAnalysis) {
	for key := range analysis.infoDictionary {
		delete(analysis.infoDictionary, key)
	}
	for _, target := range analysis.metadataTargets {
		delete(target.dictionary, target.key)
	}

	pdfContext.Title = ""
	pdfContext.Subject = ""
	pdfContext.Author = ""
	pdfContext.Creator = ""
	pdfContext.Producer = ""
	pdfContext.XRefTable.CreationDate = ""
	pdfContext.ModDate = ""
	pdfContext.Keywords = ""
	pdfContext.KeywordList = map[string]bool{}
	pdfContext.Properties = map[string]string{}
	pdfContext.CatalogXMPMeta = nil
}

type neutralPDFCPUInfo struct {
	producer     string
	creationDate string
	modDate      string
}

func hasNeutralPDFCPUTrio(pdfContext *model.Context, analysis *pdfAnalysis) bool {
	if len(analysis.metadataTargets) != 0 || len(analysis.infoDictionary) != 3 {
		return false
	}

	trio, ok := readNeutralPDFCPUInfo(pdfContext, analysis.infoDictionary)
	if !ok || trio.producer != "pdfcpu "+model.VersionStr || trio.creationDate != trio.modDate {
		return false
	}
	_, validDate := types.DateTime(trio.creationDate, false)
	return validDate
}

func readNeutralPDFCPUInfo(pdfContext *model.Context, infoDictionary types.Dict) (neutralPDFCPUInfo, bool) {
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
		value, err := infoObjectValue(pdfContext, object)
		if err != nil {
			return neutralPDFCPUInfo{}, false
		}
		*target = value
	}
	return trio, true
}
