import "server-only";
import { spawn } from "node:child_process";
import { env } from "../env";

export const ACCEPTED_AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"] as const;

/** Identifies the container from magic bytes; the browser-declared MIME type is not trusted. */
export function sniffAudio(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: "audio/webm", ext: "webm" };
  if (buf.toString("ascii", 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (buf.toString("ascii", 4, 8) === "ftyp") return { mime: "audio/mp4", ext: "m4a" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return { mime: "audio/wav", ext: "wav" };
  if (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3" };
  return null;
}

function run(args: string[], input: Buffer, timeoutMs = 20000): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(env().FFMPEG_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ stdout: Buffer.concat(out), stderr: err, code: code ?? 1 });
    });
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

/** Converts any accepted container to 16 kHz mono 16-bit PCM WAV (needed by pronunciation assessment). */
export async function toWav16k(input: Buffer, maxSeconds = 60): Promise<Buffer> {
  const r = await run(["-nostdin", "-loglevel", "error", "-i", "pipe:0", "-t", String(maxSeconds), "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", "-f", "wav", "pipe:1"], input);
  if (r.code !== 0 || r.stdout.length < 100) throw new Error(`ffmpeg conversion failed: ${r.stderr.slice(0, 200)}`);
  return r.stdout;
}

/** Duration in milliseconds of a 16 kHz mono s16 WAV. */
export function wavDurationMs(wav: Buffer): number {
  const dataBytes = Math.max(0, wav.length - 44);
  return Math.round((dataBytes / 2 / 16000) * 1000);
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    const r = await run(["-version"], Buffer.alloc(0), 5000);
    return r.code === 0;
  } catch {
    return false;
  }
}
