import { createStart } from "@tanstack/react-start";

import { appBindingsMiddleware } from "#/shared/middlewares/application-bindings/application-bindings.mod";

export const startInstance = createStart(() => ({
  requestMiddleware: [appBindingsMiddleware],
}));
