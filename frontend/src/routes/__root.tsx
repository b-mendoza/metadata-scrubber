import { PostHogProvider } from "@posthog/react";
import type {
  TanStackDevtoolsReactInit,
  TanStackDevtoolsReactPlugin,
} from "@tanstack/react-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import globalStyles from "#/app.css?url";
import type { AppRouter } from "#/shared/libs/trpc/routers/routers.mod.server";

interface RouterContext {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
}

const PRELOAD_LINKS: Array<React.ComponentProps<"link">> = [
  {
    rel: "preload",
    as: "style",
    href: globalStyles,
  },
];

const BASE_LINKS: Array<React.ComponentProps<"link">> = [
  {
    rel: "stylesheet",
    href: globalStyles,
  },
];

export const Route = createRootRouteWithContext<RouterContext>()({
  head() {
    return {
      links: import.meta.env.DEV
        ? BASE_LINKS
        : [...PRELOAD_LINKS, ...BASE_LINKS],

      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        },
      ],
    };
  },
  shellComponent: DocumentShell,
});

const DEVTOOLS_CONFIG = {
  position: "bottom-right",
} satisfies TanStackDevtoolsReactInit["config"];

const PLUGINS: TanStackDevtoolsReactPlugin[] = [
  {
    name: "TanStack Query",
    render: <ReactQueryDevtoolsPanel />,
  },
  {
    name: "TanStack Router",
    render: <TanStackRouterDevtoolsPanel />,
  },
];

const POSTHOG_OPTIONS = {
  defaults: "2026-08-30",
  api_host: "/relay",
  // eslint-disable-next-line metadata-scrubber/no-hardcoded-backend-host -- This fixed US Cloud UI host is not the backend or the event transport.
  ui_host: "https://us.posthog.com",
  capture_exceptions: true,
  capture_performance: { web_vitals: true },
  disable_session_recording: true,
  person_profiles: "identified_only",
} satisfies NonNullable<
  React.ComponentProps<typeof PostHogProvider>["options"]
>;

type DocumentShellProps = React.PropsWithChildren;

export function DocumentShell(props: Readonly<DocumentShellProps>) {
  const { children } = props;
  // Vite inlines this public value at build time.
  const posthogKey: unknown = import.meta.env["VITE_PUBLIC_POSTHOG_KEY"];

  return (
    <html data-theme="light" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {typeof posthogKey === "string" && posthogKey !== "" ? (
          <PostHogProvider apiKey={posthogKey} options={POSTHOG_OPTIONS}>
            {children}
          </PostHogProvider>
        ) : (
          children
        )}

        {import.meta.env.DEV ? (
          <TanStackDevtools config={DEVTOOLS_CONFIG} plugins={PLUGINS} />
        ) : null}

        <Scripts />
      </body>
    </html>
  );
}
