import { createFileRoute } from "@tanstack/react-router";

import { WizardUpload } from "#/domains/wizard/components/wizard/wizard.mod";

export const Route = createFileRoute("/_wizard/")({ component: UploadRoute });
function UploadRoute() {
  const { trpc } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  return (
    <WizardUpload
      trpc={trpc}
      onUploadComplete={(search) => {
        void navigate({ to: "/review", search, replace: true });
      }}
    />
  );
}
