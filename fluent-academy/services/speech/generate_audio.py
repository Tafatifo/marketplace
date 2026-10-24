"""
Curriculum audio generator (resumable).

Reads content/dist/audio-manifest.json (written by `npm run content:build`), synthesises
every missing clip with Piper, encodes it to MP3 and records metadata in
content/audio-index.json. Already-generated clips are skipped, so the job can be
interrupted and restarted at any time. Failed clips are retried and reported.

  services/speech/.venv/bin/python services/speech/generate_audio.py [--workers 3] [--limit N]

Composite clips (dialogues) have text lines "f:..." / "m:..." and a comma-separated
voice list; each line is synthesised with its speaker's voice and joined with a pause.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import wave
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

MANIFEST = ROOT / "content" / "dist" / "audio-manifest.json"
INDEX = ROOT / "content" / "audio-index.json"
OUT = Path(os.environ.get("AUDIO_OUT_DIR", ROOT / "public" / "audio"))
PAUSE_MS = 450
BITRATE = os.environ.get("AUDIO_BITRATE", "32k")


def wav_bytes_to_pcm(wav: bytes) -> tuple[bytes, int]:
    with wave.open(io.BytesIO(wav)) as w:
        return w.readframes(w.getnframes()), w.getframerate()


def resample(pcm: bytes, rate: int, target: int = 22050) -> bytes:
    if rate == target:
        return pcm
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-", "-f", "s16le", "-ar", str(target), "-ac", "1", "-"],
        input=pcm,
        capture_output=True,
        check=True,
    )
    return proc.stdout


def encode_mp3(pcm: bytes, rate: int) -> bytes:
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", BITRATE, "-f", "mp3", "-"],
        input=pcm,
        capture_output=True,
        check=True,
    )
    return proc.stdout


def synth(req: dict) -> dict:
    from voices import synthesize_to_wav, phonemize_ipa

    slow = req["speed"] == "slow"
    if req["key"].split("/")[1] == "dialogue":
        voices = req["voice"].split(",")
        lines = req["text"].split("\n")
        chunks = []
        rate = 22050
        silence = b"\x00\x00" * int(rate * PAUSE_MS / 1000)
        for line, voice in zip(lines, voices):
            text = line.split(":", 1)[1] if line[:2] in ("f:", "m:") else line
            pcm, r = wav_bytes_to_pcm(synthesize_to_wav(voice, text, slow=slow))
            chunks.append(resample(pcm, r, rate))
            chunks.append(silence)
        pcm = b"".join(chunks)
        ipa = None
    else:
        pcm, rate = wav_bytes_to_pcm(synthesize_to_wav(req["voice"], req["text"], slow=slow))
        if rate != 22050:
            pcm = resample(pcm, rate, 22050)
            rate = 22050
        words = len(req["text"].split())
        ipa = phonemize_ipa(req["voice"], req["text"]) if words <= 4 and not slow else None
    mp3 = encode_mp3(pcm, 22050)
    dest = OUT / req["key"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    tmp.write_bytes(mp3)
    tmp.replace(dest)
    duration_ms = int(len(pcm) / 2 / 22050 * 1000)
    return {
        "key": req["key"],
        "language": req["language"],
        "text": req["text"],
        "voice": req["voice"],
        "speed": req["speed"],
        "durationMs": duration_ms,
        "bytes": len(mp3),
        "checksum": hashlib.sha256(mp3).hexdigest(),
        "ipa": ipa,
    }


def work(batch: list[dict]) -> list[dict]:
    out = []
    for req in batch:
        for attempt in range(3):
            try:
                out.append(synth(req))
                break
            except Exception as exc:  # noqa: BLE001 — record and retry
                if attempt == 2:
                    out.append({"key": req["key"], "error": f"{type(exc).__name__}: {exc}"})
                time.sleep(0.5 * (attempt + 1))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 2) - 1)))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--language", default="")
    ap.add_argument("--prune", action="store_true", help="remove clips (files and index entries) the manifest no longer needs")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    index: dict = json.loads(INDEX.read_text()) if INDEX.exists() else {}
    if args.prune:
        needed = {r["key"] for r in manifest}
        stale = [k for k in index if k not in needed and (not args.language or k.startswith(args.language + "/"))]
        for k in stale:
            (OUT / k).unlink(missing_ok=True)
            del index[k]
        INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
        print(f"Pruned {len(stale)} clips no longer referenced by the curriculum", flush=True)
    todo = [r for r in manifest if (not args.language or r["language"] == args.language) and not (r["key"] in index and (OUT / r["key"]).exists() and "error" not in index[r["key"]])]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(manifest)} clips in manifest · {len(todo)} to generate · {args.workers} workers", flush=True)
    if not todo:
        return
    batches = [todo[i : i + 25] for i in range(0, len(todo), 25)]
    done = 0
    failed = 0
    started = time.time()
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, b) for b in batches]
        for n, fut in enumerate(as_completed(futures), 1):
            for entry in fut.result():
                if "error" in entry:
                    failed += 1
                    index[entry["key"]] = {**index.get(entry["key"], {}), "error": entry["error"]}
                else:
                    prev = index.get(entry["key"], {})
                    # Keep QA results when the audio is unchanged.
                    if prev.get("checksum") == entry["checksum"]:
                        entry = {**prev, **entry}
                    index[entry["key"]] = entry
                    done += 1
            if n % 10 == 0 or n == len(futures):
                INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
                rate = done / max(1e-6, time.time() - started)
                print(f"  {done + failed}/{len(todo)} done · {failed} failed · {rate:.1f} clips/s", flush=True)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
    print(f"Generated {done}, failed {failed}")
    if failed:
        sys.exit(2)


if __name__ == "__main__":
    main()
