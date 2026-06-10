import { useChat } from "@ai-sdk/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { useEffect } from "react";

import { enqueueToast } from "#/domains/notifications/hooks/use-toast/use-toast.mod";
import { Button } from "#/shared/components/button/button.mod";

export const Route = createFileRoute("/")({
  component: IndexRoute,
  head() {
    return {
      meta: [
        {
          title: "Home | Spend Guard",
        },
      ],
    };
  },
});

const SSE_PATH = "/sse";

function IndexRoute() {
  const navigate = Route.useNavigate();

  const { trpc } = Route.useRouteContext();

  const startAnalysisMutationResult = useMutation(
    trpc.fileUploader.startAnalysis.mutationOptions({
      async onSuccess(createdAnalysis) {
        await navigate({
          to: "/analyses/$analysis_id",
          params: {
            analysis_id: createdAnalysis.id,
          },
        });
      },
    }),
  );

  const chatResult = useChat({
    transport: new DefaultChatTransport({
      api: SSE_PATH,
    }),
  });

  const chatStatus = chatResult.status;

  const errorMessage = chatResult.error?.message;

  useEffect(() => {
    if (chatStatus !== "error" || typeof errorMessage !== "string") return;

    enqueueToast({
      content: errorMessage,
      type: "ERROR",
    });
  }, [chatStatus, errorMessage]);

  const handleSendFileForOCR = () => {
    startAnalysisMutationResult.mutate({
      fileUrl:
        "https://5xak6urqwt.ucarecd.net/77a9ce4a-d78a-4b01-a4b8-32c5155a3e5e/Recibos_HS_Avalos-1_2.jpg",
    });
  };

  return (
    <Button
      isPending={startAnalysisMutationResult.isPending}
      onPress={handleSendFileForOCR}
    >
      Analyze Invoice
    </Button>
  );
}
