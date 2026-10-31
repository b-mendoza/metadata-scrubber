import React, { useEffect, useEffect as effect, useLayoutEffect } from "react";
import * as ReactNamespace from "react";
import type { useEffect as EffectType } from "react";
import { type useEffect as InlineEffectType } from "react";

export type Effect = typeof useEffect;
export type NamespaceEffect = typeof ReactNamespace.useEffect;
export type TypeOnlyEffect = typeof EffectType;
export type InlineTypeOnlyEffect = typeof InlineEffectType;

export function useSubscription(): void {
  useEffect(() => undefined, []);
}

export function use2Channels(): void {
  React.useEffect(() => undefined, []);
}

export const useArrow = (): void => {
  ReactNamespace["useEffect"](() => undefined, []);
};

export const useBoundName = function Ordinary(): void {
  effect(() => undefined, []);
};

export function makeHook(): () => void {
  return function useDeclaredName(): void {
    useEffect(() => undefined, []);
  };
}

export function callShadowedAlias(effect: () => void): void {
  effect();
}

export function callShadowedNamespace(ReactNamespace: {
  readonly useEffect: () => void;
}): void {
  ReactNamespace.useEffect();
}

export function otherReactApis(): void {
  useLayoutEffect(() => undefined, []);
  ReactNamespace.useLayoutEffect(() => undefined, []);
}

export function replaceEffectTargets(): void {
  React.useEffect = () => undefined;
}
