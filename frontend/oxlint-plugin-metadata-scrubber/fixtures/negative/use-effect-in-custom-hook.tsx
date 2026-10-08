import React, {
  useEffect,
  useEffect as declarationEffect,
  useEffect as lowercaseEffect,
  useEffect as assertedEffect,
  useEffect as savedEffect,
  useEffect as passedEffect,
  useEffect as typeParameterEffect,
  useEffect as switchDiscriminantEffect,
  useEffect as shortNameEffect,
  useEffect as wrappedOwnerEffect,
  useEffect as callbackEffect,
  useEffect as propEffect,
} from "react";
import * as ReactNamespace from "react";

useEffect(() => undefined, []);

export function synchronize(): void {
  declarationEffect(() => undefined, []);
}

export function usechannel(): void {
  lowercaseEffect(() => undefined, []);
}

React.useEffect(() => undefined, []);
ReactNamespace["useEffect"](() => undefined, []);

const FirstNamespace = ReactNamespace;
const SecondNamespace = FirstNamespace satisfies typeof ReactNamespace;
const ThirdNamespace = SecondNamespace as typeof ReactNamespace;
const FinalNamespace = ThirdNamespace!;
FinalNamespace[`useEffect`](() => undefined, []);

(assertedEffect as typeof useEffect satisfies typeof useEffect)!(
  () => undefined,
  [],
);

export const extractedEffect = savedEffect;
extractedEffect(() => undefined, []);

declare function acceptEffect(value: typeof useEffect): void;

export function usePassingEffect(): void {
  acceptEffect(passedEffect);
}

const SavedNamespace = React;
export const extractedNamespaceEffect = SavedNamespace.useEffect;
extractedNamespaceEffect(() => undefined, []);

const DestructuredNamespace = ReactNamespace;
export const { useEffect: destructuredEffect } = DestructuredNamespace;
destructuredEffect(() => undefined, []);

const ComputedNamespace = React;
export const { ["useEffect"]: computedEffect } = ComputedNamespace;
computedEffect(() => undefined, []);

const TemplateNamespace = ReactNamespace;
export const { [`useEffect`]: templateEffect } = TemplateNamespace;
templateEffect(() => undefined, []);

export function callWithTypeParameter<typeParameterEffect extends string>(
  value: typeParameterEffect,
): typeParameterEffect {
  typeParameterEffect(() => undefined, []);
  return value;
}

const TypeShadowRoot = ReactNamespace;
export function callThroughTypeShadow<TypeShadowRoot extends string>(
  value: TypeShadowRoot,
): TypeShadowRoot {
  const TypeShadowChain = TypeShadowRoot;
  TypeShadowChain.useEffect(() => undefined, []);
  return value;
}

const WrappedLiteralNamespace = React;
WrappedLiteralNamespace["useEffect" as const](() => undefined, []);
const WrappedTemplateNamespace = ReactNamespace;
WrappedTemplateNamespace[`useEffect` satisfies string](() => undefined, []);
const WrappedAssignmentNamespace = React;
let wrappedKeyAssigned: typeof useEffect;
({ [`useEffect` as const]: wrappedKeyAssigned } = WrappedAssignmentNamespace);
wrappedKeyAssigned(() => undefined, []);

const SourceAndTargetNamespace = React;
({ useEffect: SourceAndTargetNamespace.useEffect } = SourceAndTargetNamespace);
const DefaultReadNamespace = React;
({ effect: React.useEffect = DefaultReadNamespace.useEffect } = {
  effect: undefined,
});
const ObjectReadNamespace = React;
(ObjectReadNamespace.useEffect as typeof useEffect & { tag: string }).tag = "x";
const OrAssignmentNamespace = React;
OrAssignmentNamespace.useEffect ||= () => undefined;

export function callInSwitchDiscriminant(): void {
  switch (switchDiscriminantEffect(() => undefined, [])) {
    default:
      const switchDiscriminantEffect = () => undefined;
      switchDiscriminantEffect();
  }
}

export function use(): React.ReactElement {
  shortNameEffect(() => undefined, []);
  return <div />;
}

export const WrappedComponent = (function useInnerView(): React.ReactElement {
  wrappedOwnerEffect(() => undefined, []);
  return <div />;
} satisfies () => React.ReactElement as () => React.ReactElement)!;

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

function EffectReceiver({
  effect,
}: {
  readonly effect: typeof propEffect;
}): React.ReactElement {
  return <output>{effect.name}</output>;
}

export function usePropView(): React.ReactElement {
  return <EffectReceiver effect={propEffect} />;
}
