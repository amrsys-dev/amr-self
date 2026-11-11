import { createFileRoute } from "@tanstack/react-router";
import { handleOtp } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/auth/otp")({
  server: {
    handlers: {
      POST: ({ request }) => handleOtp(request),
    },
  },
});
