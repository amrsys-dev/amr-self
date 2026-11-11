export async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const headers = new Headers(initHeaders);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, {
    credentials: "same-origin",
    ...rest,
    headers,
  });
  let data = {} as T;
  try {
    data = (await res.json()) as T;
  } catch {
    /* empty */
  }
  return { ok: res.ok, status: res.status, data };
}
