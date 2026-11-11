import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BlobStore, KvPutOpts, KvStore } from "./types.ts";

type FileShape = { kv: Record<string, string>; kvExp?: Record<string, number>; blobs: Record<string, string> };

const locks = new Map<string, Promise<void>>();

function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(path, prev.then(() => gate));
  return prev.then(fn).finally(() => {
    release();
    if (locks.get(path) === gate) locks.delete(path);
  });
}

async function load(path: string): Promise<FileShape> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as FileShape;
    return { kv: parsed.kv ?? {}, kvExp: parsed.kvExp ?? {}, blobs: parsed.blobs ?? {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kv: {}, kvExp: {}, blobs: {} };
    throw err;
  }
}

async function save(path: string, data: FileShape): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await writeFile(path, JSON.stringify(data));
  try {
    await unlink(tmp);
  } catch {
    /* ignore */
  }
}

function readLive(data: FileShape, key: string, now: number): string | null {
  const exp = data.kvExp?.[key];
  if (exp != null && exp <= now) {
    delete data.kv[key];
    if (data.kvExp) delete data.kvExp[key];
    return null;
  }
  return data.kv[key] ?? null;
}

function writeLive(data: FileShape, key: string, value: string, opts: KvPutOpts | undefined, now: number): void {
  data.kv[key] = value;
  if (!data.kvExp) data.kvExp = {};
  if (opts?.expirationTtl != null) data.kvExp[key] = now + Math.max(1, Math.ceil(opts.expirationTtl)) * 1000;
  else delete data.kvExp[key];
}

export function createFileStores(filePath: string): { kv: KvStore; blobs: BlobStore } {
  const path = filePath;
  const kv: KvStore = {
    async get(key) {
      return withLock(path, async () => {
        const data = await load(path);
        const now = Date.now();
        const value = readLive(data, key, now);
        if (value == null && (key in data.kv || key in (data.kvExp ?? {}))) await save(path, data);
        return value;
      });
    },
    async put(key, value, opts) {
      await withLock(path, async () => {
        const data = await load(path);
        writeLive(data, key, value, opts, Date.now());
        await save(path, data);
      });
    },
    async delete(key) {
      await withLock(path, async () => {
        const data = await load(path);
        delete data.kv[key];
        if (data.kvExp) delete data.kvExp[key];
        await save(path, data);
      });
    },
    async list(prefix) {
      return withLock(path, async () => {
        const data = await load(path);
        const now = Date.now();
        const names: string[] = [];
        for (const k of Object.keys(data.kv)) {
          if (readLive(data, k, now) != null && k.startsWith(prefix)) names.push(k);
        }
        await save(path, data);
        return names.sort();
      });
    },
    async compareAndSet(key, expected, next, opts) {
      return withLock(path, async () => {
        const data = await load(path);
        const now = Date.now();
        const cur = readLive(data, key, now);
        if (cur !== expected) {
          await save(path, data);
          return false;
        }
        writeLive(data, key, next, opts, now);
        await save(path, data);
        return true;
      });
    },
  };
  const blobs: BlobStore = {
    async get(key) {
      return withLock(path, async () => {
        const raw = (await load(path)).blobs[key];
        if (!raw) return null;
        return Uint8Array.from(Buffer.from(raw, "base64"));
      });
    },
    async put(key, data) {
      await withLock(path, async () => {
        const all = await load(path);
        all.blobs[key] = Buffer.from(data).toString("base64");
        await save(path, all);
      });
    },
    async delete(key) {
      await withLock(path, async () => {
        const all = await load(path);
        delete all.blobs[key];
        await save(path, all);
      });
    },
    async list(prefix) {
      return withLock(path, async () => Object.keys((await load(path)).blobs).filter((k) => k.startsWith(prefix)).sort());
    },
  };
  return { kv, blobs };
}

export function defaultFileStorePath(): string {
  return join(process.cwd(), ".data", "store.json");
}
