import { createFileRoute } from "@tanstack/react-router";
import { handlePublicCard } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/card/$nick")({
  server: {
    handlers: {
      GET: ({ request, params }) => handlePublicCard(request, params.nick),
    },
  },
});
