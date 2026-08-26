export const createService = () => ({ run: () => true });

export const createServiceError = (message: string, cause: unknown) =>
  new Error(message, { cause });
