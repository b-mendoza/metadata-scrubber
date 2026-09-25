import * as z from "zod";

// This regex matches the backend wire grammar: uploads/ and a lowercase UUIDv4.
// A separate z.uuid() check would accept UUID forms that the backend does not emit.
const STORAGE_KEY_PATTERN =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/v;
// This token is 32 lowercase hexadecimal characters, not a general RFC 9110 entity tag.
const CANONICAL_ETAG_PATTERN = /^[0-9a-f]{32}$/v;

export const storageKeySchema = z
  .string({ error: "The storage key must be a string." })
  .regex(STORAGE_KEY_PATTERN, { error: "The storage key is invalid." })
  .trim();
export const canonicalETagSchema = z
  .string({ error: "The ETag must be a string." })
  .regex(CANONICAL_ETAG_PATTERN, { error: "The ETag is invalid." })
  .trim();
