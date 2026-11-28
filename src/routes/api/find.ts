import { createFileRoute } from "@tanstack/react-router";
import { handleFind } from "@/lib/auth/handlers.ts";

/** 28.11.2026: поиск людей в AMR ID (только «Меня можно найти»), GET ?q=. Только для вошедших. */
export const Route = createFileRoute("/api/find")({
  server: {
    handlers: {
      GET: ({ request }) => handleFind(request),
    },
  },
});
