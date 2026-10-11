import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
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
});

export default config;
