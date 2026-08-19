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
