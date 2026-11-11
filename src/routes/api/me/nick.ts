import { createFileRoute } from "@tanstack/react-router";
import { handleChangeNick } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/nick")({
  server: {
    handlers: {
      POST: ({ request }) => handleChangeNick(request),
    },
  },
});
