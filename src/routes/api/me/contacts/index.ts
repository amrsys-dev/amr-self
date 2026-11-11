import { createFileRoute } from "@tanstack/react-router";
import { handleAddContact } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/contacts/")({
  server: {
    handlers: {
      POST: ({ request }) => handleAddContact(request),
    },
  },
});
