import { createFileRoute } from "@tanstack/react-router";
import { handleRecovery } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/recovery")({
  server: {
    handlers: {
      POST: ({ request }) => handleRecovery(request),
    },
  },
});
