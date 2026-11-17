import { createFileRoute } from "@tanstack/react-router";
import { handleGoogleCallback } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: ({ request }) => handleGoogleCallback(request),
    },
  },
});
