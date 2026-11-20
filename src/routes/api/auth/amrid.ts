import { createFileRoute } from "@tanstack/react-router";

/** SELF: «Войти через AMR ID». */
export const Route = createFileRoute("/api/auth/amrid")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/auth/amrid-self.ts")).handleAmridSelf(request),
    },
  },
});
