import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BlobStore, KvStore } from "./types.ts";

type FileShape = { kv: Record<string, string>; blobs: Record<string, string> };

async function load(path: string): Promise<FileShape> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as FileShape;
    return { kv: parsed.kv ?? {}, blobs: parsed.blobs ?? {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kv: {}, blobs: {} };
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

export function createFileStores(filePath: string): { kv: KvStore; blobs: BlobStore } {
  const path = filePath;
  const kv: KvStore = {
    async get(key) {
      return (await load(path)).kv[key] ?? null;
    },
    async put(key, value) {
      const data = await load(path);
      data.kv[key] = value;
      await save(path, data);
    },
    async delete(key) {
      const data = await load(path);
      delete data.kv[key];
      await save(path, data);
    },
  };
  const blobs: BlobStore = {
    async get(key) {
      const raw = (await load(path)).blobs[key];
      if (!raw) return null;
      return Uint8Array.from(Buffer.from(raw, "base64"));
    },
    async put(key, data) {
      const all = await load(path);
      all.blobs[key] = Buffer.from(data).toString("base64");
      await save(path, all);
    },
    async delete(key) {
      const all = await load(path);
      delete all.blobs[key];
      await save(path, all);
    },
  };
  return { kv, blobs };
}

export function defaultFileStorePath(): string {
  return join(process.cwd(), ".data", "store.json");
}
