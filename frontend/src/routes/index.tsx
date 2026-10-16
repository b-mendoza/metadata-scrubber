import { createFileRoute } from "@tanstack/react-router";

import { FileWorkflow } from "#/domains/wizard/components/file-workflow/file-workflow.mod";

export const Route = createFileRoute("/")({
  component: FileWorkflow,
  head() {
    return {
      meta: [
        {
          title: "Home",
        },
      ],
    };
  },
});
