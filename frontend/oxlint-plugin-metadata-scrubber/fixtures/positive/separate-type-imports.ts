import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
import type { KyInstance as Client, RetryOptions as RetryPolicy } from "ky";
import type KyDefault from "ky";
import type * as KyTypes from "ky";
import { type } from "node:os";
import { type as platformType } from "node:os";
import * as operatingSystem from "node:os";
import kyDefault from "ky";
import { HTTPError as RequestError } from "ky";
import attributedKy, { HTTPError as AttributedError } from "ky" with {
  "fixture-mode": "runtime",
};
import "ky";
import "ky" with { "fixture-mode": "side-effect" };
import type { KyInstance as ResolvedClient } from "ky" with {
  "resolution-mode": "import",
};

export type {
  KyInstance,
  RetryOptions,
  ShouldRetryState,
  Client,
  RetryPolicy,
  ResolvedClient,
};
export type DefaultClientFactory = typeof KyDefault;
export type ClientModule = typeof KyTypes;
export {
  ky,
  HTTPError,
  type,
  platformType,
  operatingSystem,
  kyDefault,
  RequestError,
  attributedKy,
  AttributedError,
};
