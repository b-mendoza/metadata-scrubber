import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { redact } from "@tanstack/redact/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import type { PluginOption, UserConfig } from "vite";
import { defineConfig } from "vite";

export default defineConfig((): UserConfig => ({
  css: {
    transformer: "lightningcss",
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    react({
      compiler: true,
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Redact declares any, but its implementation returns Vite plugins.
    redact() as PluginOption[],
  ],
  ssr: {
    noExternal: true,
  },
}));
