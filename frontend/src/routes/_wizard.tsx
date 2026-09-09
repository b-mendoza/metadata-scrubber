import {
  createFileRoute,
  Outlet,
  useMatch,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_wizard")({
  component: WizardLayout,
  head: () => ({ meta: [{ title: "Remove PDF metadata" }] }),
});
function WizardLayout() {
  const visitedStepRef = useRef(false);
  const outcome = useMatch({ from: "/_wizard/outcome", shouldThrow: false });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const entry = useRouterState({
    select: (state) => state.location.state.__TSR_key,
  });
  const kind = outcome?.loaderData?.kind;
  const [notice, setNotice] = useState(kind === "missing-source");
  const [previousEntry, setPreviousEntry] = useState(entry);
  const [previousKind, setPreviousKind] = useState(kind);
  if (previousEntry !== entry || previousKind !== kind) {
    setPreviousEntry(entry);
    setPreviousKind(kind);
    if (kind === "missing-source") setNotice(true);
    if (pathname === "/review") setNotice(false);
  }
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onRendered", ({ toLocation }) => {
        if (toLocation.pathname !== "/") {
          visitedStepRef.current = true;
        } else if (visitedStepRef.current) {
          document
            .querySelector<HTMLHeadingElement>("#upload-heading")
            ?.focus();
        }
      }),
    [router],
  );
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-3xl font-bold">Remove PDF metadata</h1>
      <p>
        Remove or replace supported Info, XMP, and custom PDF metadata. This
        does not remove all hidden PDF content.
      </p>
      {notice && (
        <div className="toast">
          <div className="alert" role="alert">
            The PDF is no longer available. Upload the PDF again.
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNotice(false);
              }}
            >
              Dismiss notice
            </button>
          </div>
        </div>
      )}
      <Outlet />
    </main>
  );
}
