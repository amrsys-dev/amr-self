import { createFileRoute } from "@tanstack/react-router";
import { handleReplaceRecoveryCodes } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/recovery-codes")({
  server: {
    handlers: {
      POST: ({ request }) => handleReplaceRecoveryCodes(request),
    },
  },
});
