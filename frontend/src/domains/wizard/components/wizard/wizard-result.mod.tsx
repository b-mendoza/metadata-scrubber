import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface WizardResultProps {
  revision: RouterInputs["wizard"]["scrubFile"];
  initialDownloadUrl: string;
  initialExpiresAt: string;
  trpc: TRPCOptionsProxy<AppRouter>;
  queryClient: QueryClient;
  onRestart: () => void;
}
interface ResultState {
  downloadUrl: string | null;
  expiresAt: number | null;
  renewalPending: boolean;
  renewalError: "failed" | "missing" | "expired" | null;
  deletion: "idle" | "pending" | "failed" | "conflict";
}
const GRANT_MESSAGES = {
  failed: "Could not renew the download.",
  missing: "The scrubbed PDF is missing. Start a new upload.",
  expired: "The download grant expired.",
};
const RENEWAL_LEAD_MS = 30_000;
const GENERATION_INCREMENT = 1;
const IMMEDIATE_DELAY_MS = 0;
export function WizardResult({
  revision,
  initialDownloadUrl,
  initialExpiresAt,
  trpc,
  queryClient,
  onRestart,
}: Readonly<WizardResultProps>) {
  const [state, setState] = useState<ResultState>({
    downloadUrl: initialDownloadUrl,
    expiresAt: Date.parse(initialExpiresAt),
    renewalPending: false,
    renewalError: null,
    deletion: "idle",
  });
  const generationRef = useRef(IMMEDIATE_DELAY_MS);
  const deletionStartedRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deletionButtonRef = useRef<HTMLButtonElement>(null);
  const stopRenewalRef = useRef<(() => void) | null>(null);
  const renewRef = useRef<(() => void) | null>(null);
  const deletion = useMutation(
    trpc.wizard.confirmDelete.mutationOptions({ retry: false }),
  );
  useEffect(
    () => () => {
      generationRef.current += GENERATION_INCREMENT;
    },
    [],
  );
  const restart = () => {
    generationRef.current += GENERATION_INCREMENT;
    stopRenewalRef.current?.();
    onRestart();
  };
  const closeDelete = () => {
    dialogRef.current?.close();
    deletionButtonRef.current?.focus();
  };
  const confirmDelete = async () => {
    if (deletionStartedRef.current) return;
    deletionStartedRef.current = true;
    generationRef.current += GENERATION_INCREMENT;
    stopRenewalRef.current?.();
    const { current } = generationRef;
    closeDelete();
    setState({
      ...state,
      downloadUrl: null,
      renewalPending: false,
      renewalError: null,
      deletion: "pending",
    });
    try {
      await deletion.mutateAsync({ storageKey: revision.storageKey });
      if (current !== generationRef.current) return;
      restart();
    } catch (error: unknown) {
      if (current !== generationRef.current) return;
      const hasRemainingFiles =
        isTRPCClientError<AppRouter>(error) && error.data?.code === "CONFLICT";
      setState((previous) => ({
        ...previous,
        deletion: hasRemainingFiles ? "conflict" : "failed",
      }));
    }
  };
  const markRenewalPending = useEffectEvent(() => {
    setState((previous) => ({
      ...previous,
      renewalPending: true,
      renewalError: null,
    }));
  });
  useEffect(() => {
    let isActive = true;
    let sequence = 0;
    let isPending = false;
    let hasFailed = false;
    let expiry: number | null = Date.parse(initialExpiresAt);
    let renewalTimer: ReturnType<typeof setTimeout> | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const options = trpc.wizard.refreshDownloadGrant.queryOptions(revision, {
      retry: false,
      staleTime: 0,
      gcTime: 0,
    });
    const expire = () => {
      if (!isActive) return;
      setState((previous) => ({
        ...previous,
        downloadUrl: null,
        renewalError: previous.renewalPending
          ? previous.renewalError
          : "expired",
      }));
    };
    const schedule = () => {
      if (expiry == null) return;
      const remaining = expiry - Date.now();
      if (expiryTimer != null) clearTimeout(expiryTimer);
      expiryTimer = setTimeout(expire, Math.max(IMMEDIATE_DELAY_MS, remaining));
      if (
        remaining > RENEWAL_LEAD_MS &&
        document.visibilityState === "visible"
      ) {
        renewalTimer = setTimeout(() => {
          renew();
        }, remaining - RENEWAL_LEAD_MS);
      }
    };
    const acceptGrant = (nextExpiry: number, downloadUrl: string) => {
      setState((previous) => ({
        ...previous,
        downloadUrl,
        expiresAt: nextExpiry,
        renewalPending: false,
        renewalError: null,
      }));
    };
    const rejectGrant = (error: unknown) => {
      const isMissing =
        isTRPCClientError<AppRouter>(error) && error.data?.code === "NOT_FOUND";
      if (isMissing) {
        expiry = null;
        renewRef.current = null;
      }
      setState((previous) => ({
        ...previous,
        renewalPending: false,
        renewalError: isMissing ? "missing" : "failed",
        downloadUrl:
          expiry != null && expiry > Date.now() ? previous.downloadUrl : null,
      }));
    };
    const renew = () => {
      if (!isActive || isPending || document.visibilityState !== "visible") {
        return;
      }
      isPending = true;
      hasFailed = false;
      const requestSequence = sequence;
      markRenewalPending();
      void queryClient
        .query(options)
        .then((grant) => {
          if (!isActive || requestSequence !== sequence) return;
          const nextExpiry = Date.parse(grant.expiresAt);
          if (!Number.isFinite(nextExpiry) || nextExpiry <= Date.now()) {
            throw new Error("Expired download grant");
          }
          isPending = false;
          expiry = nextExpiry;
          acceptGrant(nextExpiry, grant.downloadUrl);
          schedule();
        })
        .catch((error: unknown) => {
          if (!isActive || requestSequence !== sequence) return;
          isPending = false;
          hasFailed = true;
          rejectGrant(error);
        });
    };
    const visibilityChanged = () => {
      if (renewalTimer != null) clearTimeout(renewalTimer);
      if (document.visibilityState !== "visible") {
        sequence += GENERATION_INCREMENT;
        isPending = false;
        void queryClient.cancelQueries({
          queryKey: options.queryKey,
          exact: true,
        });
        return;
      }
      if (hasFailed) return;
      if (expiry == null || expiry - Date.now() <= RENEWAL_LEAD_MS) {
        renew();
        return;
      }
      schedule();
    };
    renewRef.current = renew;
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    const stop = () => {
      isActive = false;
      sequence += GENERATION_INCREMENT;
      renewRef.current = null;
      if (renewalTimer != null) clearTimeout(renewalTimer);
      if (expiryTimer != null) clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      void queryClient.cancelQueries({
        queryKey: options.queryKey,
        exact: true,
      });
      queryClient.removeQueries({ queryKey: options.queryKey, exact: true });
    };
    stopRenewalRef.current = stop;
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      stop();
    };
  }, [initialExpiresAt, queryClient, revision, trpc]);

  const renderGrantNotice = () => (
    <>
      {state.renewalError != null && (
        <p role="alert">{GRANT_MESSAGES[state.renewalError]}</p>
      )}
      {(state.renewalError === "failed" ||
        state.renewalError === "expired") && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            renewRef.current?.();
          }}
        >
          Renew download
        </button>
      )}
    </>
  );
  return (
    <section>
      <h2>PDF metadata processed</h2>
      <p>A download grant lasts approximately 15 minutes.</p>
      <p>{"Files are automatically deleted within up to 48 hours."}</p>
      {state.deletion === "pending" && <p role="status">Deleting files…</p>}
      {["failed", "conflict"].includes(state.deletion) && (
        <p role="alert">
          Deletion was not confirmed. Confirm deletion again or start a new
          upload.
        </p>
      )}
      <button
        ref={deletionButtonRef}
        type="button"
        className="btn"
        disabled={state.deletion === "pending"}
        onClick={() => {
          deletionStartedRef.current = false;
          dialogRef.current?.showModal();
          cancelButtonRef.current?.focus();
        }}
      >
        Delete files
      </button>
      <button type="button" className="btn" onClick={restart}>
        Start new upload
      </button>
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onCancel={(event) => {
          event.preventDefault();
          closeDelete();
        }}
      >
        <div className="modal-box">
          <h2 id="delete-title">Delete both files?</h2>
          <p id="delete-description">
            Delete the source PDF and scrubbed PDF. This cannot be undone.
          </p>
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn"
            onClick={closeDelete}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-error"
            onClick={() => {
              void confirmDelete();
            }}
          >
            Confirm deletion
          </button>
        </div>
      </dialog>
      {state.renewalPending && <p role="status">Renewing download…</p>}
      {renderGrantNotice()}
      {state.downloadUrl != null && (
        <a
          className="btn btn-primary"
          href={state.downloadUrl}
          onClick={(event) => {
            if (state.expiresAt == null || state.expiresAt > Date.now()) {
              return;
            }

            event.preventDefault();
            setState({ ...state, downloadUrl: null });
          }}
        >
          Download PDF
        </a>
      )}
    </section>
  );
}
