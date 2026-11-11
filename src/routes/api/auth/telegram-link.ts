import { createFileRoute } from "@tanstack/react-router";
import { handleTelegramLink } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/telegram-link")({
  server: {
    handlers: {
      GET: ({ request }) => handleTelegramLink(request),
    },
  },
});
