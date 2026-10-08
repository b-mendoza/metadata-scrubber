import ky, {
  HTTPError,
  type KyInstance,
  type RetryOptions,
  type ShouldRetryState,
} from "ky";
import { HTTPError as RequestError, type KyInstance as Client } from "ky";
import {
  type KyInstance as AllInlineClient,
  type RetryOptions as AllInlineRetryOptions,
} from "ky";

export type {
  KyInstance,
  RetryOptions,
  ShouldRetryState,
  Client,
  AllInlineClient,
  AllInlineRetryOptions,
};
export { ky, HTTPError, RequestError };
