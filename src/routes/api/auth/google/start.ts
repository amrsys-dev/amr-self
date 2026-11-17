import { createFileRoute } from "@tanstack/react-router";
import { handleGoogleStart } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      GET: ({ request }) => handleGoogleStart(request),
    },
  },
});
