import { createFileRoute } from "@tanstack/react-router";
import { handleGoogleStart } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      POST: ({ request }) => handleGoogleStart(request),
      GET: ({ request }) => handleGoogleStart(request),
    },
  },
});
