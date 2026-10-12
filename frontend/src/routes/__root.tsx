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
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import globalStyles from "#/app.css?url";
import { getPostHogBrowserConfig } from "#/shared/config/posthog/posthog-browser-config.mod.server";
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

const loadPostHogBrowserConfig = createServerFn({ method: "GET" }).handler(() =>
  getPostHogBrowserConfig(),
);

export const Route = createRootRouteWithContext<RouterContext>()({
  // The configuration is fixed for each deployment, so client navigation
  // does not load it again.
  staleTime: Infinity,
  loader: async () => loadPostHogBrowserConfig(),
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
  component: RootComponent,
  shellComponent: DocumentShell,
});

export function RootComponent() {
  const { apiKey, options } = Route.useLoaderData();

  // Development builds do not send analytics to the PostHog project.
  if (import.meta.env.DEV) {
    return <Outlet />;
  }

  return (
    <PostHogProvider apiKey={apiKey} options={options}>
      <Outlet />
    </PostHogProvider>
  );
}

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

type DocumentShellProps = React.PropsWithChildren;

function DocumentShell(props: Readonly<DocumentShellProps>) {
  const { children } = props;

  return (
    <html data-theme="light" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}

        {import.meta.env.DEV ? (
          <TanStackDevtools config={DEVTOOLS_CONFIG} plugins={PLUGINS} />
        ) : null}

        <Scripts />
      </body>
    </html>
  );
}
