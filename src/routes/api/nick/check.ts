import { createFileRoute } from "@tanstack/react-router";
import { handleNickCheck } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/nick/check")({
  server: {
    handlers: {
      GET: ({ request }) => handleNickCheck(request),
    },
  },
});
