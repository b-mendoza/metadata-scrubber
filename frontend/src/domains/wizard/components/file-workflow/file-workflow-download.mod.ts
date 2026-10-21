import { useMutation } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
const RENEWAL_LEAD_MS = 120_000;

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
  const renewedExpiryRef = useRef<number | null>(null);
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

  useEffect(() => {
    const schedule = () => {
      clearTimeout(timer);
      if (state.status !== "ready") {
        return;
      }
      const expiresAt = Date.parse(state.grant.expiresAt);
      const remaining = expiresAt - Date.now();
      if (remaining <= NO_DELAY_MS) {
        setState({ status: "expired" });
        return;
      }
      let delay = remaining;
      if (
        document.visibilityState === "visible" &&
        renewedExpiryRef.current !== expiresAt
      ) {
        delay -= RENEWAL_LEAD_MS;
        if (delay <= NO_DELAY_MS) {
          // A repeated expiry must not trigger an automatic renewal loop.
          renewedExpiryRef.current = expiresAt;
          refresh();
          return;
        }
      }
      timer = setTimeout(schedule, Math.min(delay, MAX_TIMER_DELAY_MS));
    };
    const checkOnReturn = () => {
      if (
        document.visibilityState === "visible" &&
        state.status !== "missing" &&
        (state.status !== "ready" ||
          Date.parse(state.grant.expiresAt) <= Date.now())
      ) {
        refresh();
        return;
      }
      schedule();
    };
    let timer = setTimeout(schedule, NO_DELAY_MS);
    addEventListener("focus", checkOnReturn);
    addEventListener("pageshow", checkOnReturn);
    document.addEventListener("visibilitychange", checkOnReturn);
    return () => {
      clearTimeout(timer);
      removeEventListener("focus", checkOnReturn);
      removeEventListener("pageshow", checkOnReturn);
      document.removeEventListener("visibilitychange", checkOnReturn);
    };
  }, [refresh, state]);

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
