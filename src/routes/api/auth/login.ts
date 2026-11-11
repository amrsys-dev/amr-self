import { createFileRoute } from "@tanstack/react-router";
import { handleLogin } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: ({ request }) => handleLogin(request),
    },
  },
});
