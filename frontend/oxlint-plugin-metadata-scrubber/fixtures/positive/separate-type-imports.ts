import type { KyInstance, RetryOptions, ShouldRetryState } from "ky";
import ky, { HTTPError } from "ky";
import type { KyInstance as Client, RetryOptions as RetryPolicy } from "ky";
import type KyDefault from "ky";
import type * as KyTypes from "ky";
import { type } from "node:os";
import { type as platformType } from "node:os";
import * as operatingSystem from "node:os";
import "ky";

export type { KyInstance, RetryOptions, ShouldRetryState, Client, RetryPolicy };
export type DefaultClientFactory = typeof KyDefault;
export type ClientModule = typeof KyTypes;
export { ky, HTTPError, type, platformType, operatingSystem };
