import { createFileRoute } from "@tanstack/react-router";
import { handleNickSuggest } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/nick/suggest")({
  server: {
    handlers: {
      GET: () => handleNickSuggest(),
    },
  },
});
