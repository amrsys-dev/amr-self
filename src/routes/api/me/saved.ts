import { createFileRoute } from "@tanstack/react-router";

/**
 * «Contacts»: cards this user saved in AMR ID.
 * GET → fresh short cards; POST {nicks} → save; DELETE ?nick= → remove.
 */
async function handle(request: Request, method: "GET" | "POST" | "DELETE"): Promise<Response> {
  const { requireUser } = await import("@/lib/auth/session.ts");
  const { json, readJson } = await import("@/lib/http.ts");
  const { getStores } = await import("@/lib/storage/index.ts");
  const { nickKey } = await import("@/lib/user.ts");
  const { normalizeNick } = await import("@/lib/nick.ts");
  const { addSaved, readSaved, removeSaved, savedKey } = await import("@/lib/saved.ts");
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { kv } = getStores();
  const owner = user.dataId ?? user.nick;
  const list = await readSaved(kv, owner);

  if (method === "POST") {
    const body = await readJson<{ nicks?: unknown }>(request);
    const raw = Array.isArray(body?.nicks) ? body!.nicks.slice(0, 50) : [];
    const nicks: string[] = [];
    for (const r of raw) {
      const n = typeof r === "string" ? normalizeNick(r) : null;
      if (n && (await kv.get(nickKey(n)))) nicks.push(n);
    }
    if (!nicks.length) return json({ error: "not_found" }, 404);
    await kv.put(savedKey(owner), JSON.stringify(addSaved(list, nicks, user.nick)));
    return json({ ok: true, saved: nicks });
  }
  if (method === "DELETE") {
    const n = normalizeNick(new URL(request.url).searchParams.get("nick") ?? "");
    if (!n) return json({ error: "invalid" }, 400);
    await kv.put(savedKey(owner), JSON.stringify(removeSaved(list, n)));
    return json({ ok: true });
  }

  const { avatarUrl } = await import("@/lib/auth/photo.ts");
  const { toPublicContacts } = await import("@/lib/card/visibility.ts");
  const items: unknown[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const e = list[i]!;
      const raw = await kv.get(nickKey(e.nick));
      if (!raw) {
        items[i] = { nick: e.nick, at: e.at, missing: true };
        continue;
      }
      const u = JSON.parse(raw) as import("@/lib/user.ts").UserRecord;
      const contacts = toPublicContacts(u.contacts);
      items[i] = {
        nick: u.nick,
        at: e.at,
        displayName: u.displayName ?? "",
        avatar: avatarUrl(u),
        kinds: contacts.map((c) => c.kind),
        phone: contacts.find((c) => c.kind === "phone")?.display ?? "",
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker));
  return json({ items });
}

export const Route = createFileRoute("/api/me/saved")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request, "GET"),
      POST: ({ request }) => handle(request, "POST"),
      DELETE: ({ request }) => handle(request, "DELETE"),
    },
  },
});
