package scrub

import (
	"errors"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

func verifyScrubbedPDF(outputBytes []byte) error {
	fields, err := InspectPDF(outputBytes, PostWriteVerification)
	if err != nil {
		return err
	}
	if len(fields) != 0 {
		return errors.New("PDF metadata remained after scrub")
	}
	return nil
}

func removeAnalyzedMetadata(context *model.Context, analysis *pdfAnalysis) {
	for _, target := range analysis.infoTargets {
		delete(target.dictionary, target.key)
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
