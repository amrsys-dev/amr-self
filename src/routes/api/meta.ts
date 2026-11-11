import { createFileRoute } from "@tanstack/react-router";
import { handleMeta } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/meta")({
  server: {
    handlers: {
      GET: ({ request }) => handleMeta(request),
    },
  },
});
