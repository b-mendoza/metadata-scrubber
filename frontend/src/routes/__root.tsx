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
        : PRELOAD_LINKS.concat(BASE_LINKS),

      meta: [
        {
          charSet: "UTF-8",
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

interface DocumentShellProps extends React.PropsWithChildren {}

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
