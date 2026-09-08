import { createStart } from "@tanstack/react-start";

import { appBindingsMiddleware } from "#/shared/middlewares/app-bindings/app-bindings.mod";

export const startInstance = createStart(() => ({
  requestMiddleware: [appBindingsMiddleware],
}));
