import React, { useEffect, useEffect as effect, useLayoutEffect } from "react";
import * as ReactNamespace from "react";

export function useViewSubscription(): number {
  useEffect(() => undefined, []);
  return 1;
}

export function View(): React.ReactElement {
  const count = useViewSubscription();
  return <output>{count}</output>;
}

export const useWrappedView = (function ViewBody(): React.ReactElement {
  React.useEffect(() => undefined, []);
  return <section />;
} satisfies () => React.ReactElement)!;

export const WrappedView = React.memo(function useDeclaredView() {
  ReactNamespace["useEffect"](() => undefined, []);
  return <div />;
});

export function ParentView(): React.ReactElement {
  function useNestedView(): void {
    effect(() => undefined, []);
  }
  useNestedView();
  return <div />;
}

export function LayoutView(): React.ReactElement {
  useLayoutEffect(() => undefined, []);
  return <div />;
}

export function ShadowedView({
  useEffect,
}: {
  readonly useEffect: () => void;
}): React.ReactElement {
  useEffect();
  return <button onClick={useEffect}>Run local action</button>;
}
