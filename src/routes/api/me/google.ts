import { createFileRoute } from "@tanstack/react-router";
import { handleGoogleProof } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/google")({
  server: {
    handlers: {
      POST: ({ request }) => handleGoogleProof(request),
    },
  },
});
