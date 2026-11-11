import { createFileRoute } from "@tanstack/react-router";
import { handleMe, handleMePatch } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/")({
  server: {
    handlers: {
      GET: ({ request }) => handleMe(request),
      PATCH: ({ request }) => handleMePatch(request),
    },
  },
});
