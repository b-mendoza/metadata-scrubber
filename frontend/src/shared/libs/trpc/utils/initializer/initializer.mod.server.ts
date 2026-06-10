import { initTRPC } from "@trpc/server";
import { parse, stringify } from "devalue";

interface TRPCRequestContext {
  signal: AbortSignal;
}

export const createTRPCRequestContext = (
  request: Request,
): TRPCRequestContext => ({
  signal: request.signal,
});

const t = initTRPC.context<TRPCRequestContext>().create({
  transformer: {
    deserialize: parse,
    serialize: stringify,
  },
});

export const {
  // Utility for creating a tRPC router
  router: createTRPCRouter,

  // Create a caller factory for making server-side tRPC calls from loaders or actions
  createCallerFactory,
} = t;

// Utility for a public procedure (doesn't require an autheticated user)
export const publicProcedure = t.procedure;

// Create a utility function for protected tRPC procedures that require an authenticated user
// export const protectedProcedure = t.procedure.use(async (options) => {
//   // To simulate an authenticated tRPC procedure
//   if (typeof options.ctx.user?.id !== "string") {
//     throw new TRPCError({
//       code: "UNAUTHORIZED",
//     });
//   }

//   return options.next({
//     ctx: options.ctx,
//   });
// });
