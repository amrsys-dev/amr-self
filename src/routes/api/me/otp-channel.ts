import { createFileRoute } from "@tanstack/react-router";
import { handleOtpChannel } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/otp-channel")({
  server: {
    handlers: {
      POST: ({ request }) => handleOtpChannel(request),
    },
  },
});
