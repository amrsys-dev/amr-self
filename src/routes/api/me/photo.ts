import { createFileRoute } from "@tanstack/react-router";
import { handlePhotoDelete, handlePhotoPut } from "@/lib/auth/photo.ts";

export const Route = createFileRoute("/api/me/photo")({
  server: {
    handlers: {
      PUT: ({ request }) => handlePhotoPut(request),
      DELETE: ({ request }) => handlePhotoDelete(request),
    },
  },
});
