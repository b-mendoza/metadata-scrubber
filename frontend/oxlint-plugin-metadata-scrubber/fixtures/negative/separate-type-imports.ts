import ky, {
  HTTPError,
  type KyInstance,
  type RetryOptions,
  type ShouldRetryState,
} from "ky";
import { HTTPError as RequestError, type KyInstance as Client } from "ky";
import { type CpuInfo, type NetworkInterfaceInfo } from "node:os";
import {
  type KyInstance as AllInlineClient,
  type RetryOptions as AllInlineRetryOptions,
} from "ky";
import { type ShouldRetryState as InlineState } from "ky";
import { type as osType, type CpuInfo as Processor } from "node:os";
import {
  HTTPError as AttributedError,
  type KyInstance as AttributedClient,
  type RetryOptions as AttributedRetryOptions,
} from "ky" with { "fixture-mode": "runtime" };

export type {
  KyInstance,
  RetryOptions,
  ShouldRetryState,
  Client,
  CpuInfo,
  NetworkInterfaceInfo,
  AllInlineClient,
  AllInlineRetryOptions,
  InlineState,
  Processor,
  AttributedClient,
  AttributedRetryOptions,
};
export { ky, HTTPError, RequestError, osType, AttributedError };
