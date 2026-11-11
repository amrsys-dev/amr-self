import { createFileRoute } from "@tanstack/react-router";
import { handleGetData, handlePutData } from "@/lib/auth/handlers.ts";

export const Route = createFileRoute("/api/me/data")({
  server: {
    handlers: {
      GET: ({ request }) => handleGetData(request),
      PUT: ({ request }) => handlePutData(request),
    },
  },
});
