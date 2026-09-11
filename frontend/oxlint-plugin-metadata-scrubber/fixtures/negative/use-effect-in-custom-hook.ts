import React, {
  useEffect,
  useEffect as declarationEffect,
  useEffect as expressionEffect,
  useEffect as arrowEffect,
  useEffect as lowercaseEffect,
  useEffect as boundNameEffect,
  useEffect as nestedArrowEffect,
  useEffect as nestedDeclarationEffect,
  useEffect as returnedAnonymousEffect,
  useEffect as assertedEffect,
  useEffect as satisfiedEffect,
  useEffect as nonNullEffect,
  useEffect as savedEffect,
  useEffect as passedEffect,
  useEffect as wrappedEffect,
  useEffect as objectEffect,
  useEffect as returnedEffect,
} from "react";
import * as ReactNamespace from "react";

useEffect(() => undefined, []);

export function synchronize(): void {
  declarationEffect(() => undefined, []);
}

export const synchronizeExpression = function (): void {
  expressionEffect(() => undefined, []);
};

export const synchronizeArrow = (): void => {
  arrowEffect(() => undefined, []);
};

export function usechannel(): void {
  lowercaseEffect(() => undefined, []);
}

export const Component = function useInnerName(): void {
  boundNameEffect(() => undefined, []);
};

export function useOuterArrow(): () => void {
  return (): void => {
    nestedArrowEffect(() => undefined, []);
  };
}

export function useOuterDeclaration(): void {
  function synchronizeInner(): void {
    nestedDeclarationEffect(() => undefined, []);
  }
  synchronizeInner();
}

export function makeCallback(): () => void {
  return function (): void {
    returnedAnonymousEffect(() => undefined, []);
  };
}

React.useEffect(() => undefined, []);
ReactNamespace["useEffect"](() => undefined, []);

const FirstNamespace = ReactNamespace;
const SecondNamespace = FirstNamespace satisfies typeof ReactNamespace;
const ThirdNamespace = SecondNamespace as typeof ReactNamespace;
const FinalNamespace = ThirdNamespace!;
FinalNamespace[`useEffect`](() => undefined, []);

(assertedEffect as typeof useEffect)(() => undefined, []);
(satisfiedEffect satisfies typeof useEffect)(() => undefined, []);
nonNullEffect!(() => undefined, []);

export const extractedEffect = savedEffect;
extractedEffect(() => undefined, []);

declare function acceptEffect(value: typeof useEffect): void;

export function usePassingEffect(): void {
  acceptEffect(passedEffect);
}

const SavedNamespace = React;
export const extractedNamespaceEffect = SavedNamespace.useEffect;
extractedNamespaceEffect(() => undefined, []);

const PassedNamespace = ReactNamespace;
acceptEffect(PassedNamespace["useEffect"]);

const DestructuredNamespace = ReactNamespace;
export const { useEffect: destructuredEffect } = DestructuredNamespace;
destructuredEffect(() => undefined, []);

const ComputedNamespace = React;
export const { ["useEffect"]: computedEffect } = ComputedNamespace;
computedEffect(() => undefined, []);

const TemplateNamespace = ReactNamespace;
export const { [`useEffect`]: templateEffect } = TemplateNamespace;
templateEffect(() => undefined, []);

export const wrappedExtraction = (wrappedEffect as typeof useEffect)!;
export const effectContainer = { objectEffect };

export function useEffectFactory(): typeof useEffect {
  return returnedEffect;
}

import {
  useEffect as typeAliasEffect,
  useEffect as typeParameterEffect,
  useEffect as typeExtractionEffect,
} from "react";

export function callWithTypeAlias(): undefined {
  type typeAliasEffect = undefined;
  const result: typeAliasEffect = undefined;
  typeAliasEffect(() => undefined, []);
  return result;
}

export function callWithTypeParameter<typeParameterEffect extends string>(
  value: typeParameterEffect,
): typeParameterEffect {
  typeParameterEffect(() => undefined, []);
  return value;
}

export function extractWithTypeAlias(): typeof useEffect {
  type typeExtractionEffect = typeof useEffect;
  const saved: typeExtractionEffect = typeExtractionEffect;
  return saved;
}

export function callWithDefaultTypeAlias(): undefined {
  type React = undefined;
  const result: React = undefined;
  React["useEffect"](() => undefined, []);
  return result;
}

const TypeShadowRoot = ReactNamespace;
export function callThroughTypeShadow<TypeShadowRoot extends string>(
  value: TypeShadowRoot,
): TypeShadowRoot {
  const TypeShadowChain = TypeShadowRoot;
  TypeShadowChain.useEffect(() => undefined, []);
  return value;
}

export function destructureWithNamespaceType(): typeof useEffect {
  type ReactNamespace = typeof React;
  const namespace: ReactNamespace = ReactNamespace;
  const { useEffect: saved } = namespace;
  return saved;
}

const WrappedLiteralNamespace = React;
WrappedLiteralNamespace["useEffect" as const](() => undefined, []);
const WrappedTemplateNamespace = ReactNamespace;
WrappedTemplateNamespace[`useEffect` satisfies string](() => undefined, []);
const WrappedSavedNamespace = React;
export const wrappedKeySaved = WrappedSavedNamespace[(`useEffect` as const)!];
wrappedKeySaved(() => undefined, []);

const WrappedPatternNamespace = React;
export const { [("useEffect" satisfies string)!]: wrappedKeyDeclared } =
  WrappedPatternNamespace;
wrappedKeyDeclared(() => undefined, []);
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
const KeyReadNamespace = React;
export let assignedNumber: number | undefined;
const numberSource: Record<string, number> = { useEffect: 1 };
({ [KeyReadNamespace.useEffect.name]: assignedNumber } = numberSource);
const ObjectReadNamespace = React;
(ObjectReadNamespace.useEffect as typeof useEffect & { tag: string }).tag = "x";
const OrAssignmentNamespace = React;
OrAssignmentNamespace.useEffect ||= () => undefined;
const AndAssignmentNamespace = React;
AndAssignmentNamespace.useEffect &&= () => undefined;
const NullishAssignmentNamespace = React;
NullishAssignmentNamespace.useEffect ??= () => undefined;

import { useEffect as switchDiscriminantEffect } from "react";

export function callInSwitchDiscriminant(): void {
  switch (switchDiscriminantEffect(() => undefined, [])) {
    default:
      const switchDiscriminantEffect = () => undefined;
      switchDiscriminantEffect();
  }
}

const SwitchDiscriminantNamespace = React;
export function readInSwitchDiscriminant(): void {
  switch (SwitchDiscriminantNamespace.useEffect) {
    default:
      const SwitchDiscriminantNamespace = { useEffect: () => undefined };
      SwitchDiscriminantNamespace.useEffect();
  }
}
