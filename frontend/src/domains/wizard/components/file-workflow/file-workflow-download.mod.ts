import { useMutation } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import type { MouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type {
  RouterInputs,
  RouterOutputs,
} from "#/shared/libs/trpc/client/client.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

type GrantState =
  | { status: "checking" | "expired" | "failed" | "missing" }
  | { status: "ready"; grant: RouterOutputs["wizard"]["refreshDownloadGrant"] };

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const NO_DELAY_MS = 0;

export function useDownloadGrant({
  storageKey,
  etag,
}: RouterInputs["wizard"]["refreshDownloadGrant"]) {
  const trpc = trpcContext.useTRPC();
  const { mutateAsync } = useMutation(
    trpc.wizard.refreshDownloadGrant.mutationOptions({ retry: false }),
  );
  const [state, setState] = useState<GrantState>({ status: "checking" });
  const activeRef = useRef(false);
  const pendingRef = useRef(false);
  const refresh = useCallback(() => {
    if (!activeRef.current || pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setState({ status: "checking" });
    const input: RouterInputs["wizard"]["refreshDownloadGrant"] = {
      storageKey,
      etag,
    };
    void mutateAsync(input)
      .then((grant) => {
        if (!activeRef.current) {
          return;
        }
        pendingRef.current = false;
        setState(
          Date.parse(grant.expiresAt) > Date.now()
            ? { status: "ready", grant }
            : { status: "expired" },
        );
      })
      .catch((error: unknown) => {
        if (!activeRef.current) {
          return;
        }
        pendingRef.current = false;
        const isMissing =
          isTRPCClientError<AppRouter>(error) &&
          error.data?.code === "NOT_FOUND";
        setState({ status: isMissing ? "missing" : "failed" });
      });
  }, [etag, mutateAsync, storageKey]);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    return () => {
      activeRef.current = false;
    };
  }, [refresh]);

  const checkOnReturn = useEffectEvent(() => {
    if (document.visibilityState === "hidden" || state.status === "missing") {
      return;
    }
    if (
      state.status !== "ready" ||
      Date.parse(state.grant.expiresAt) <= Date.now()
    ) {
      refresh();
    }
  });
  useEffect(() => {
    const check = () => {
      checkOnReturn();
    };
    addEventListener("focus", check);
    addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      removeEventListener("focus", check);
      removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }
    const expiresAt = Date.parse(state.grant.expiresAt);
    const expire = () => {
      const remaining = expiresAt - Date.now();
      if (remaining > NO_DELAY_MS) {
        timer = setTimeout(expire, Math.min(remaining, MAX_TIMER_DELAY_MS));
      } else {
        setState({ status: "expired" });
      }
    };
    const delay = Math.max(
      NO_DELAY_MS,
      Math.min(expiresAt - Date.now(), MAX_TIMER_DELAY_MS),
    );
    let timer = setTimeout(expire, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);

  const onDownload = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      state.status === "ready" &&
      Date.parse(state.grant.expiresAt) > Date.now()
    ) {
      return;
    }
    event.preventDefault();
    refresh();
  };
  return { state, refresh, onDownload };
}
