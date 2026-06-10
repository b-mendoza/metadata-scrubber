import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageProvider } from "#/shared/storage/storage.types";

interface R2StorageConfig {
  presigner: {
    bucketName: string;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
    endpoint: string;
    region: string;
  };
  r2Bucket: R2Bucket;
}

export const createR2StorageProvider = (
  config: R2StorageConfig,
): StorageProvider => {
  const s3Client = new S3Client({
    credentials: config.presigner.credentials,
    endpoint: config.presigner.endpoint,
    region: config.presigner.region,
  });

  const put: StorageProvider["put"] = async (key, body, options) => {
    await config.r2Bucket.put(key, body, {
      httpMetadata: {
        contentType: options?.contentType,
      },
    });
  };

  const getSignedReadUrl: StorageProvider["getSignedUrl"] = async (
    key,
    expiresInSeconds,
  ) => {
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: config.presigner.bucketName,
        Key: key,
      }),
      {
        expiresIn: expiresInSeconds,
      },
    );

    return new URL(signedUrl);
  };

  return {
    getSignedUrl: getSignedReadUrl,
    put,
  };
};
