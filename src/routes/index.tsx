import { createFileRoute } from "@tanstack/react-router";
import { IdApp } from "@/components/id-app.tsx";

export const Route = createFileRoute("/")({
  component: () => <IdApp />,
});
