import { useMutation } from "@tanstack/react-query";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { RouterInputs } from "#/shared/libs/trpc/client/client.mod";
import { trpcContext } from "#/shared/libs/trpc/client/client-runtime.mod";

type DeletionPhase = "ready" | "confirming" | "deleting" | "failed" | "deleted";

export function useConfirmedDeletion(storageKey: string) {
  const trpc = trpcContext.useTRPC();
  const { mutateAsync } = useMutation(
    trpc.wizard.confirmDelete.mutationOptions({ retry: false }),
  );
  const [phase, setPhase] = useState<DeletionPhase>("ready");
  const activeRef = useRef(false);
  const pendingRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const confirm = () => {
    if (!activeRef.current || pendingRef.current) {
      return;
    }
    pendingRef.current = true;
    setPhase("deleting");
    const input: RouterInputs["wizard"]["confirmDelete"] = { storageKey };
    void mutateAsync(input)
      .then(() => {
        if (activeRef.current) {
          setPhase("deleted");
        }
      })
      .catch(() => {
        if (!activeRef.current) {
          return;
        }
        pendingRef.current = false;
        setPhase("failed");
      });
  };
  const ask = () => {
    if (!pendingRef.current) {
      setPhase("confirming");
    }
  };
  const cancel = () => {
    if (!pendingRef.current) {
      setPhase("ready");
    }
  };
  return { phase, ask, cancel, confirm };
}

interface ConfirmationProps {
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmation({
  onCancel,
  onConfirm,
}: Readonly<ConfirmationProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openDialog = useCallback((dialog: HTMLDialogElement | null) => {
    dialogRef.current = dialog;
    if (dialog != null) {
      dialog.showModal();
      dialog.querySelector("button")?.focus();
    }
  }, []);
  const cancel = () => {
    dialogRef.current?.close();
    onCancel();
  };
  const onEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    cancel();
  };
  return (
    <dialog
      aria-label="Confirm file deletion"
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      ref={openDialog}
    >
      <div className="modal-box">
        <h3>Confirm file deletion</h3>
        <p>
          Delete the stored source and result files? This does not cancel work
          already running.
        </p>
        <div className="modal-action">
          <button
            className="btn"
            onClick={cancel}
            onKeyDown={onEscape}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn-error"
            onClick={() => {
              dialogRef.current?.close();
              onConfirm();
            }}
            onKeyDown={onEscape}
            type="button"
          >
            Confirm deletion
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function FileWorkflowDeletion({
  deletion,
}: Readonly<{ deletion: ReturnType<typeof useConfirmedDeletion> }>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      {deletion.phase === "deleting" ? (
        <output aria-label="Deleting files">
          Waiting for the backend to confirm deletion.
        </output>
      ) : null}
      {deletion.phase === "failed" ? (
        <p role="alert">
          Could not confirm deletion. Files may remain. Try again.
        </p>
      ) : null}
      <button
        className="btn"
        disabled={deletion.phase === "deleting"}
        onClick={deletion.ask}
        ref={(button) => {
          triggerRef.current = button;
          if (deletion.phase === "failed") {
            button?.focus();
          }
        }}
        type="button"
      >
        {deletion.phase === "failed" ? "Retry deletion" : "Delete files"}
      </button>
      {deletion.phase === "confirming" ? (
        <DeleteConfirmation
          onCancel={() => {
            deletion.cancel();
            triggerRef.current?.focus();
          }}
          onConfirm={deletion.confirm}
        />
      ) : null}
    </>
  );
}
