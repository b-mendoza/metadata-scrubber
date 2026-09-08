# PDF metadata scrubbing

This context defines the language for inspecting PDF metadata and producing cleaned files. It separates source files, metadata reports, cleaned files, and download access.

## Language

**Source file**:
The uploaded file supplied for PDF metadata inspection or scrubbing.
_Avoid_: Original, input document

**Source revision**:
A specific version of a source file. A cleaned file can belong to an older source revision.
_Avoid_: Reviewed revision, inspected revision

**Metadata**:
Document properties and embedded descriptive information in a PDF, such as its author, title, producer, and dates. Metadata does not mean every private value in the document.

**Metadata inspection**:
A read-only examination of supported metadata in a source revision. It reports the metadata fields and the proposed action for each field.
_Avoid_: Dry run, document preview, privacy scan

**Field preview**:
A size-limited display of a metadata field's value that may omit part of the value. It is not a preview of a document page.
_Avoid_: File preview, page preview

**Scrubbing**:
Processing that removes supported source metadata from the Info dictionary, XMP packets, and custom metadata entries. It does not remove all hidden content or guarantee anonymity.
_Avoid_: Anonymization, privacy cleaning

**Cleaned file**:
A PDF result of scrubbing a specific source revision. It can contain generated producer and date properties that may appear in a later metadata inspection.
_Avoid_: Sanitized PDF, metadata-free file, safe copy

**Already-clean file**:
A PDF whose metadata inspection reports no supported metadata fields. This does not guarantee privacy or safety.
_Avoid_: Anonymous file, safe file

**Download grant**:
Time-limited permission to download a specific cleaned file. Issuing a grant does not prove that a download completed.
_Avoid_: Cleaned file, download result

**Download-grant refresh**:
Renewal of download access to an existing cleaned file without another metadata inspection or scrub. It does not require the source file to still exist.
_Avoid_: Reprocessing, scrubbing again

**Confirmed deletion**:
A successful deletion result confirming that separate checks found no source file and no associated cleaned files. Scrubbing already in progress can still produce a cleaned file afterward.
_Avoid_: Permanent erasure, delete on download
