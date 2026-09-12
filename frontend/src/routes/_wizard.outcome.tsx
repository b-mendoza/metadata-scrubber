import {
  createFileRoute,
  redirect,
  SearchParamError,
} from "@tanstack/react-router";
import * as z from "zod";

const searchSchema = z.strictObject({
  kind: z.enum(["signed", "clean", "conflict", "error", "missing-source"]),
});
const MESSAGES = {
  signed: "Signed PDFs are unsupported in v1.",
  clean: "This PDF is already clean. No supported metadata needs removal.",
  conflict: "The PDF revision changed. Start a new upload.",
  error: "Could not complete the PDF operation. Start a new upload.",
  "missing-source": "The PDF is no longer available. Upload the PDF again.",
};
export const Route = createFileRoute("/_wizard/outcome")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => deps,
  onError: (error) => {
    if (error instanceof SearchParamError) {
      redirect({ throw: true, to: "/", replace: true });
    }
  },
  errorComponent: () => (
    <p role="alert">
      Could not complete the PDF operation. Start a new upload.
    </p>
  ),
  component: OutcomeRoute,
});
function OutcomeRoute() {
  const { kind } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <section>
      <h2>{MESSAGES[kind]}</h2>
      {kind === "error" && <p role="alert">The PDF operation failed.</p>}
      <p>Files are automatically deleted within up to 48 hours.</p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          void navigate({ to: "/", replace: true });
        }}
      >
        Start new upload
      </button>
    </section>
  );
}
