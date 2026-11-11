import { createFileRoute } from "@tanstack/react-router";
import { handleSignup } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: ({ request }) => handleSignup(request),
    },
  },
});
