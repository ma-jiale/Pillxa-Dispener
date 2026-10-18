import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": process.env.PILLXA_API_PROXY || "http://127.0.0.1:4310",
      "/local": process.env.PILLXA_RUNTIME_PROXY || "http://127.0.0.1:4311",
    },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
  preview: {
    host: "127.0.0.1",
    port: 1426,
    strictPort: true,
    proxy: {
      "/api": process.env.PILLXA_API_PROXY || "http://127.0.0.1:4310",
      "/local": process.env.PILLXA_RUNTIME_PROXY || "http://127.0.0.1:4311",
    },
  },
  clearScreen: false,
});
