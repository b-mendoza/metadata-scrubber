import React, {
  useEffect as componentEffect,
  useEffect as arrowComponentEffect,
  useEffect as shortNameEffect,
  useEffect as wrappedOwnerEffect,
  useEffect as callbackEffect,
  useEffect as propEffect,
} from "react";
import * as ReactNamespace from "react";

export function Component(): React.ReactElement {
  componentEffect(() => undefined, []);
  return <div />;
}

export const ArrowComponent = (): React.ReactElement => {
  arrowComponentEffect(() => undefined, []);
  return <div />;
};

export const useMemoWrapper = React.memo(() => {
  React.useEffect(() => undefined, []);
  return <div />;
});

export const useForwardedWrapper = React.forwardRef<
  HTMLDivElement,
  { readonly label: string }
>(function ViewBody({ label }, ref) {
  ReactNamespace["useEffect"](() => undefined, []);
  return <div ref={ref}>{label}</div>;
});

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
