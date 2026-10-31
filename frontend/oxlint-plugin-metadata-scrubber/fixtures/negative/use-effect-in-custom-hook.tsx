import React, {
  useEffect,
  useEffect as declarationEffect,
  useEffect as savedEffect,
  useEffect as wrappedOwnerEffect,
  useEffect as callbackEffect,
} from "react";
import * as ReactNamespace from "react";

useEffect(() => undefined, []);

export function synchronize(): void {
  declarationEffect(() => undefined, []);
}

React.useEffect(() => undefined, []);
ReactNamespace["useEffect"](() => undefined, []);

const FinalNamespace = ReactNamespace;
FinalNamespace.useEffect(() => undefined, []);

export const extractedEffect = savedEffect;
extractedEffect(() => undefined, []);

const SavedNamespace = React;
export const extractedNamespaceEffect = SavedNamespace.useEffect;
extractedNamespaceEffect(() => undefined, []);

const DestructuredNamespace = ReactNamespace;
export const { useEffect: destructuredEffect } = DestructuredNamespace;
destructuredEffect(() => undefined, []);

export const WrappedComponent = function useInnerView(): React.ReactElement {
  wrappedOwnerEffect(() => undefined, []);
  return <div />;
};

export function useCallbackView(): React.ReactElement {
  return (
    <button
      onClick={() => {
        callbackEffect(() => undefined, []);
      }}
    >
      Run action
    </button>
  );
}
