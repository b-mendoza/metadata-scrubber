import { createStart } from "@tanstack/react-start";

import { applicationBindingsMiddleware } from "#/shared/middlewares/application-bindings/application-bindings.mod";

export const startInstance = createStart(() => ({
  requestMiddleware: [applicationBindingsMiddleware],
}));
