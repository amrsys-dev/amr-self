import { createFileRoute } from "@tanstack/react-router";
import { handleVerifyContact } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/contacts/verify")({
  server: {
    handlers: {
      POST: ({ request }) => handleVerifyContact(request),
    },
  },
});
