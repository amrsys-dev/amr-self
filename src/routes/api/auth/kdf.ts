import { createFileRoute } from "@tanstack/react-router";
import { handleKdf } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/kdf")({
  server: {
    handlers: {
      POST: ({ request }) => handleKdf(request),
    },
  },
});
