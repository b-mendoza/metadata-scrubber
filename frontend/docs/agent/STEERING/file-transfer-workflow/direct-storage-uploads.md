# Send file bytes directly to private storage

Scope: file transfer in the upload workflow.

Why: a frontend or tRPC byte proxy adds memory and time without a contract reason.

## Do's

### Use the backend grant and runtime size limit

The Go backend owns R2 credentials and the size ceiling. `getWorkflowConfig` returns a positive `maxFileSizeBytes`; pass it to `FileUploader`. Its Uppy restrictions allow one PDF and use that runtime limit, not a copied cap.

Inside the existing Uppy `AwsS3.signRequest` callback, after checking the PUT method and file size:

```ts
const { storageKey, uploadUrl } = await createUpload({
  fileName: file.name,
  fileSizeBytes: file.size,
});

uppy.setFileMeta(file.id, { storageKey });
return { url: uploadUrl };
```

The real `AwsS3` plugin uses `shouldUseMultipart: false` and sends the bytes from the browser to the presigned PUT URL. Only `{ storageKey }` enters wizard state after success. Keep [source revisions and confirmed deletion](source-revision-privacy.md) consistent.

## Don'ts

### Do not proxy bytes through a frontend route or tRPC

Neither boundary accepts a file body. This extra field violates the upload contract:

```ts
await createUpload({
  fileName: file.name,
  fileSizeBytes: file.size,
  fileBytes: file.data,
});
```
