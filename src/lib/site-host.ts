import { createServerFn } from "@tanstack/react-start";

/** The host the page was opened on: id.amrsys.net or self.amrsys.net (one app, two addresses). */
export const siteHost = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  try {
    return new URL(getRequest().url).host;
  } catch {
    return "";
  }
});
