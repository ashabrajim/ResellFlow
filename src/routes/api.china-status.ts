import { createFileRoute } from "@tanstack/react-router";

// Diagnostic : ouvrez /api/china-status pour voir si l'import automatique est actif.
// Ne renvoie que des booléens / noms de services, jamais une clé.
export const Route = createFileRoute("/api/china-status")({
  server: {
    handlers: {
      GET: async () => {
        const { importStatus } = await import("../backend/china/env.ts");
        return new Response(JSON.stringify(importStatus(), null, 2), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
