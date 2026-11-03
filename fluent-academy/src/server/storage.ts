import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Private object storage for learner recordings and generated speech.
 * The local-disk driver keeps files outside /public; access always goes through
 * authenticated API routes. A bucket driver can implement the same interface.
 */
export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function safeJoin(root: string, key: string) {
  const p = path.resolve(root, key);
  if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage key");
  return p;
}

class LocalStore implements BlobStore {
  constructor(private root: string) {}
  async put(key: string, data: Buffer) {
    const p = safeJoin(this.root, key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data, { mode: 0o600 });
  }
  async get(key: string) {
    try {
      return await fs.readFile(safeJoin(this.root, key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(safeJoin(this.root, key), { force: true });
  }
  async exists(key: string) {
    try {
      await fs.access(safeJoin(this.root, key));
      return true;
    } catch {
      return false;
    }
  }
}

let recordings: BlobStore | null = null;
let tts: BlobStore | null = null;

export function recordingStore(): BlobStore {
  return (recordings ??= new LocalStore(path.resolve(process.cwd(), env().RECORDINGS_DIR)));
}

export function ttsStore(): BlobStore {
  return (tts ??= new LocalStore(path.resolve(process.cwd(), env().TTS_CACHE_DIR)));
}
