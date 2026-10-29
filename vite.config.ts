// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Charge le fichier `.env` (clés serveur) dans process.env pour `npm run dev` / `npm run preview`.
// Liste blanche : seules ces clés sont lues. En production, définissez-les chez votre hébergeur.
const SERVER_KEYS = [
  "APIFY_API_TOKEN",
  "APIFY_DAILY_LIMIT",
  "DEEPL_API_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
  "MYMEMORY_EMAIL",
  "FIRECRAWL_API_KEY",
];
const fileEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
for (const k of SERVER_KEYS) {
  if (process.env[k] === undefined && fileEnv[k]) process.env[k] = fileEnv[k];
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
