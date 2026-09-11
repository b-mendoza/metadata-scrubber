import React, {
  useEffect,
  useEffect as effect,
  useInsertionEffect,
  useLayoutEffect,
  useLayoutEffect as otherEffect,
  useMemo,
  useState,
} from "react";
import * as ReactNamespace from "react";
import type * as ReactTypes from "react";
import type { useEffect as EffectType } from "react";
import { type useEffect as InlineEffectType } from "react";

export type Effect = typeof useEffect;
export type RenamedEffect = typeof effect;
export type DefaultEffect = typeof React.useEffect;
export type NamespaceEffect = typeof ReactNamespace.useEffect;
export type IndexedEffect = (typeof ReactNamespace)["useEffect"];
export type TypeOnlyNamespaceEffect = typeof ReactTypes.useEffect;
export type TypeOnlyEffect = typeof EffectType;
export type InlineTypeOnlyEffect = typeof InlineEffectType;
export type { useEffect as ExportedEffect } from "react";
export { type useEffect as InlineExportedEffect } from "react";

export function useSubscription(): void {
  useEffect(() => undefined, []);
}

export function useMount(): void {
  effect(() => undefined, []);
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

export const useWrappedArrow = (((): void => {
  (useEffect as typeof useEffect)(() => undefined, []);
  (ReactNamespace["useEffect"] satisfies typeof useEffect)(() => undefined, []);
  React.useEffect!(() => undefined, []);
}) satisfies () => void as () => void)!;

const FirstNamespace = ReactNamespace;
const SecondNamespace = FirstNamespace satisfies typeof ReactNamespace;
const ThirdNamespace = SecondNamespace as typeof ReactNamespace;
const FinalNamespace = ThirdNamespace!;

export function useNamespaceChain(): void {
  FinalNamespace[`useEffect`](() => undefined, []);
}

export function callShadowedNamed(useEffect: () => void): void {
  useEffect();
}

export function callShadowedAlias(effect: () => void): void {
  effect();
}

export function callShadowedNamespace(ReactNamespace: {
  readonly useEffect: () => void;
}): void {
  ReactNamespace.useEffect();
}

export function callShadowedNamespaceAlias(FinalNamespace: {
  readonly useEffect: () => void;
}): void {
  FinalNamespace["useEffect"]();
}

export function callShadowedDefault(): void {
  const React = { useEffect: (): undefined => undefined };
  React.useEffect();
  const { useEffect: localEffect } = React;
  localEffect();
}

export function callHoistedLocal(): void {
  useEffect();
  function useEffect(): void {}
}

export const localApi = { useEffect: (): undefined => undefined };
localApi.useEffect();
export const localSavedEffect = localApi.useEffect;

export function otherReactApis(): void {
  useLayoutEffect(() => undefined, []);
  useInsertionEffect(() => undefined, []);
  otherEffect(() => undefined, []);
  ReactNamespace.useLayoutEffect(() => undefined, []);
  useState(0);
  useMemo(() => 1, []);
}

export const savedLayoutEffect = React.useLayoutEffect;
export const { useInsertionEffect: extractedInsertionEffect } = ReactNamespace;

export function callMergedTypeAndValue(): void {
  type useEffect = () => void;
  const useEffect: useEffect = () => undefined;
  useEffect();
  type React = { useEffect(): void };
  const React: React = { useEffect: () => undefined };
  const localNamespace = React;
  const { useEffect: saved } = localNamespace;
  localNamespace["useEffect" as const]();
  saved();
}

export function useTypeShadowAndWrappedKeys(): void {
  type effect = undefined;
  const result: effect = undefined;
  effect(() => result, []);
  React["useEffect" as const](() => undefined, []);
  ReactNamespace[(`useEffect` satisfies string)!](() => undefined, []);
}

export function readDynamicAndAssertedKeys(key: "useEffect"): void {
  React[key as "useEffect"](() => undefined, []);
  React[`use${"Effect"}` as "useEffect"](() => undefined, []);
  React["useLayoutEffect" as "useEffect"](() => undefined, []);
  const { [key as "useEffect"]: dynamicEffect } = React;
  const { ["useLayoutEffect" as "useEffect"]: assertedLayoutEffect } = React;
  dynamicEffect(() => undefined, []);
  assertedLayoutEffect(() => undefined, []);
}

export function replaceEffectTargets(): void {
  React.useEffect = () => undefined;
  (React.useEffect as typeof useEffect) = () => undefined;
  ({ effect: React.useEffect } = { effect: () => undefined });
  [React.useEffect] = [() => undefined];
  [{ effect: React.useEffect = () => undefined }] = [{ effect: undefined }];
  ({ effect: React.useEffect as typeof useEffect } = {
    effect: () => undefined,
  });
}

export function switchWithActualValueShadows(
  useEffect: () => void,
  React: { useEffect(): void },
): void {
  switch (useEffect()) {
    default:
      const useEffect = () => undefined;
      useEffect();
  }
  switch (React.useEffect) {
    default:
      const React = { useEffect: () => undefined };
      React.useEffect();
  }
}
