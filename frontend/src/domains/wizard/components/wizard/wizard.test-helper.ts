import type { Operation, OperationLink } from "@trpc/client";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { vi } from "vitest";

import type { RouterOutputs } from "#/shared/libs/trpc/client/client.mod";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

export type WorkflowOutput =
  RouterOutputs["wizard"][keyof RouterOutputs["wizard"]];

type WorkflowRequest = (operation: Operation) => Promise<WorkflowOutput>;

const testOperationLink =
  (request: WorkflowRequest): OperationLink<AppRouter> =>
  (operation) =>
    observable((observer) => {
      void request(operation.op)
        .then((data) => {
          observer.next({ result: { data } });
          observer.complete();
        })
        .catch((error: unknown) => {
          observer.error(
            TRPCClientError.from(
              error instanceof Error
                ? error
                : new Error("Test transport failed"),
            ),
          );
        });
    });

export const createTestTRPCClient = () => {
  const request = vi.fn<WorkflowRequest>();
  const client = createTRPCClient<AppRouter>({
    links: [() => testOperationLink(request)],
  });
  return { request, client };
};
