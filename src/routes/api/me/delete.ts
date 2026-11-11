import { createFileRoute } from "@tanstack/react-router";
import { handleDeleteMe } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/delete")({
  server: {
    handlers: {
      POST: ({ request }) => handleDeleteMe(request),
    },
  },
});
