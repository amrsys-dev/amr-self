import { createFileRoute } from "@tanstack/react-router";
import { handlePhotoGet } from "@/lib/auth/photo.ts";

export const Route = createFileRoute("/api/card-photo/$nick")({
  server: {
    handlers: {
      GET: ({ params }) => handlePhotoGet(params.nick),
    },
  },
});
