import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import type { UserConfig } from "vite";
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
  ],
}));
