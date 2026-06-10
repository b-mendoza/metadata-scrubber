export interface PutOptions {
  contentType?: string;
}

export interface StorageProvider {
  put: (
    key: string,
    body: ReadableStream<Uint8Array>,
    options?: PutOptions,
  ) => Promise<void>;
  getSignedUrl: (key: string, expiresInSeconds: number) => Promise<URL>;
}
