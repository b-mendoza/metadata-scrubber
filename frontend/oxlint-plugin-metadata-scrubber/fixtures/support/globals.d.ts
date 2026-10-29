declare const describe: {
  readonly skip: (name: string, callback: () => void) => void;
};
declare const expectTypeOf: typeof import("vitest").expectTypeOf;
declare const it: {
  readonly skip: (name: string, callback: () => void) => void;
};
declare const unresolvedTestingLibrary: {
  readonly render: (value: unknown) => unknown;
};

declare module "#/shared/middlewares/app-bindings/app-bindings.mod" {
  export function getAppBindings(): {
    httpClient: import("ky").KyInstance;
    workflowHttpClient: import("ky").KyInstance;
  };
}

declare module "#/shared/libs/ky/http-client.mod.server" {
  export function createHttpClient(baseUrl: URL): import("ky").KyInstance;
}

declare module "#/shared/libs/ky/workflow-http-client.mod.server" {
  export function createWorkflowHttpClient(
    baseUrl: URL,
  ): import("ky").KyInstance;
}
