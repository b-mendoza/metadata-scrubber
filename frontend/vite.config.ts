import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Vite 8 needs this because Cloudflare SSR runs in workerd, not Node. Without
  // the webworker target, Vite can prebundle AWS SDK modules with mixed Node and
  // browser conditions. If ssr.target is removed in a future Vite major, migrate
  // this intent to the replacement SSR environment/resolve configuration.
  ssr: {
    target: "webworker",
    optimizeDeps: {
      exclude: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
    },
  },
  plugins: [
    devtools(),
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
    }),
    tsconfigPaths({
      projectDiscovery: "lazy",
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});
