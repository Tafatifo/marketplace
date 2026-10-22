"""
Audio QA: checks that each generated clip actually says its script.

Short clips are concatenated (with silence) into ~25 s windows so Whisper runs once
per window; recognised words are mapped back to clips by time. Long clips (dialogues,
passages) are transcribed individually and keep word timings for highlighting.

Status per clip:  PASS   ≥ 85% of script words recognised
                  REVIEW 50–85% (often numbers, names or isolated words — needs a human)
                  FAIL   < 50% or unreadable file
This is a consistency check of synthesised audio, not a judgement of naturalness.

  services/speech/.venv/bin/python services/speech/qa_audio.py [--language fr] [--recheck] [--model base]
  services/speech/.venv/bin/python services/speech/qa_audio.py --escalate [--model small]

--escalate re-transcribes REVIEW/FAIL clips one at a time (padded with silence) with a
larger model and keeps the better score. Clips still flagged afterwards need a person:
listen in /admin/audio and record a verdict.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
INDEX = ROOT / "content" / "audio-index.json"
AUDIO = Path(os.environ.get("AUDIO_OUT_DIR", ROOT / "public" / "audio"))
SR = 16000
GAP = 0.8
WINDOW = 24.0

NUMBERS = {
    "fr": "zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept dix-huit dix-neuf vingt".split(),
    "es": "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte".split(),
    "de": "null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig".split(),
    "en": "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(),
}


def norm_words(text: str, lang: str) -> list[str]:
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.replace("’", "'").replace("-", " ")
    t = re.sub(r"\s*'\s*", "' ", t)
    t = re.sub(r"[^\w' ]+", " ", t)
    words = [w for w in t.split() if w]
    nums = [unicodedata.normalize("NFD", n).encode("ascii", "ignore").decode().replace("-", " ") for n in NUMBERS.get(lang, [])]
    out = []
    for w in words:
        if w.isdigit() and int(w) < len(nums):
            out.extend(nums[int(w)].split())
        else:
            out.append(w)
    return out


NUMBER_WORDS = {
    "fr": set("zero un une deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize vingt trente quarante cinquante soixante cent mille heures heure h et euros euro".split()),
    "es": set("cero uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte treinta cuarenta cincuenta cien mil y horas euros".split()),
    "de": set("null eins ein eine zwei drei vier funf sechs sieben acht neun zehn elf zwolf zwanzig dreissig vierzig funfzig hundert tausend und uhr euro".split()),
    "en": set("zero one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand and o'clock pounds dollars".split()),
}


def match_ratio(target: str, heard: str, lang: str) -> float:
    from numerals import expand

    spelled = lcs_ratio(norm_words(expand(target, lang), lang), norm_words(expand(heard, lang), lang))
    if spelled >= 0.85 or not re.search(r"\d", heard):
        return spelled
    return max(spelled, legacy_ratio(target, heard, lang))


def lcs_ratio(t: list[str], h: list[str]) -> float:
    if not t:
        return 1.0
    n, m = len(t), len(h)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            dp[i + 1][j + 1] = dp[i][j] + 1 if t[i] == h[j] else max(dp[i][j + 1], dp[i + 1][j])
    return dp[n][m] / n


def legacy_ratio(target: str, heard: str, lang: str) -> float:
    """Fallback for digits the expander can't read back (e.g. "3 ,020"): ignore number words."""
    nums = NUMBER_WORDS.get(lang, set())
    t = [w for w in norm_words(target, lang) if w not in nums and not re.fullmatch(r"(dix|vingt|trente|quarante|cinquante|soixante)\w*|\w*(zehn|zig|teen|ty)", w)]
    h = [w for w in norm_words(heard, lang) if not re.search(r"\d", w)]
    return lcs_ratio(t, h)


def decode(path: Path) -> np.ndarray:
    out = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, np.int16).astype(np.float32) / 32768.0


_phonemizers: dict = {}


def phonemes(text: str, lang: str) -> str:
    """eSpeak NG phonemes via Piper — makes homophones (enchanté/enchantez) compare equal."""
    from voices import DEFAULT_VOICE, load_voice, VOICES

    if lang not in _phonemizers:
        stem, _ = VOICES[DEFAULT_VOICE[lang]["f"]]
        _phonemizers[lang] = load_voice(stem)
    clean = re.sub(r"\s+", " ", re.sub(r"[^\w' -]+", " ", text)).strip()
    if not clean:
        return ""
    sents = _phonemizers[lang].phonemize(clean)
    return "".join(c for s in sents for c in s if c not in "ˈˌ ,.!?;:-'")


def lev(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def phoneme_similarity(target: str, heard: str, lang: str) -> float:
    from numerals import expand

    heard = expand(heard, lang)
    if re.search(r"\d", heard):
        return 0.0
    a, b = phonemes(expand(target, lang), lang), phonemes(heard, lang)
    if not a:
        return 1.0
    return max(0.0, 1 - lev(a, b) / max(len(a), len(b)))


def combined(target: str, heard: str, lang: str) -> float:
    r = match_ratio(target, heard, lang)
    if r >= 0.85:
        return r
    return max(r, phoneme_similarity(target, heard, lang))


def status_for(r: float) -> str:
    return "PASS" if r >= 0.85 else "REVIEW" if r >= 0.5 else "FAIL"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--language", default="")
    ap.add_argument("--recheck", action="store_true")
    ap.add_argument("--model", default=os.environ.get("QA_WHISPER_MODEL", "base"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--escalate", action="store_true")
    args = ap.parse_args()
    if args.escalate:
        return escalate(args)

    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type="int8", download_root=str(HERE / "models"), cpu_threads=os.cpu_count() or 4)
    index: dict = json.loads(INDEX.read_text())
    todo = [e for e in index.values() if "error" not in e and (args.recheck or "qaStatus" not in e) and (not args.language or e["language"] == args.language)]
    # Slow variants share the script of the normal clip; checking the normal clip suffices,
    # but slow clips are still checked for readability (decodable, non-silent).
    if args.limit:
        todo = todo[: args.limit]
    print(f"QA: {len(todo)} clips with Whisper '{args.model}'", flush=True)
    started = time.time()
    processed = 0

    def save():
        INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))

    # Slow variants: verified structurally against their normal-speed twin (same script and voice).
    normal = {(e["text"], e["voice"]): e for e in index.values() if e.get("speed") == "normal"}
    slow = [e for e in todo if e.get("speed") == "slow"]
    todo = [e for e in todo if e.get("speed") != "slow"]
    by_lang: dict[str, list[dict]] = {}
    for e in todo:
        by_lang.setdefault(e["language"], []).append(e)

    for lang, entries in by_lang.items():
        long = [e for e in entries if e["durationMs"] > 9000 or "\n" in e["text"]]
        short = [e for e in entries if e not in long]
        # 1) Long clips individually, keeping word timings.
        for e in long:
            try:
                pcm = decode(AUDIO / e["key"])
                segs, _ = model.transcribe(pcm, language=lang, word_timestamps=True, beam_size=1, vad_filter=False, condition_on_previous_text=False)
                words = [{"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)} for s in segs for w in (s.words or [])]
                heard = " ".join(w["word"] for w in words)
                script = " ".join(l.split(":", 1)[1] if l[:2] in ("f:", "m:") else l for l in e["text"].split("\n"))
                r = combined(script, heard, lang)
                e.update(qaStatus=status_for(r), qaScore=round(r, 3), qaTranscript=heard[:2000], wordTimings=words if len(words) < 1500 else None)
            except Exception as exc:  # noqa: BLE001
                e.update(qaStatus="FAIL", qaScore=0, qaTranscript=f"error: {exc}")
            processed += 1
        save()
        # 2) Short clips in concatenated windows.
        window: list[tuple[dict, np.ndarray]] = []
        total = 0.0

        def flush():
            nonlocal window, total, processed
            if not window:
                return
            gap = np.zeros(int(GAP * SR), np.float32)
            parts, spans, t = [], [], 0.0
            for e, pcm in window:
                spans.append((t, t + len(pcm) / SR))
                parts += [pcm, gap]
                t += len(pcm) / SR + GAP
            audio = np.concatenate(parts)
            segs, _ = model.transcribe(audio, language=lang, word_timestamps=True, beam_size=1, vad_filter=False, condition_on_previous_text=False)
            words = [w for s in segs for w in (s.words or [])]
            for (e, _), (a, b) in zip(window, spans):
                heard = " ".join(w.word.strip() for w in words if (w.start + w.end) / 2 >= a - 0.15 and (w.start + w.end) / 2 <= b + 0.15)
                r = combined(e["text"], heard, lang)
                e.update(qaStatus=status_for(r), qaScore=round(r, 3), qaTranscript=heard[:500])
                processed += 1
            window, total = [], 0.0

        for i, e in enumerate(short):
            try:
                pcm = decode(AUDIO / e["key"])
                if len(pcm) < SR * 0.15 or float(np.abs(pcm).max()) < 0.01:
                    e.update(qaStatus="FAIL", qaScore=0, qaTranscript="silent or empty")
                    processed += 1
                    continue
            except Exception as exc:  # noqa: BLE001
                e.update(qaStatus="FAIL", qaScore=0, qaTranscript=f"unreadable: {exc}")
                processed += 1
                continue
            if total + len(pcm) / SR > WINDOW:
                flush()
            window.append((e, pcm))
            total += len(pcm) / SR + GAP
            if i % 200 == 0:
                save()
                print(f"  {lang}: {processed}/{len(todo)} · {processed / max(1e-6, time.time() - started):.1f} clips/s", flush=True)
        flush()
        save()
    for e in slow:
        twin = normal.get((e["text"], e["voice"]))
        try:
            pcm = decode(AUDIO / e["key"])
            audible = len(pcm) > SR * 0.2 and float(np.abs(pcm).max()) > 0.01
        except Exception:  # noqa: BLE001
            audible = False
        if not audible:
            e.update(qaStatus="FAIL", qaScore=0, qaTranscript="silent or unreadable")
        elif twin and twin.get("qaStatus"):
            ratio = e["durationMs"] / max(1, twin["durationMs"])
            ok = 1.15 <= ratio <= 2.0
            e.update(qaStatus=twin["qaStatus"] if ok else "REVIEW", qaScore=twin.get("qaScore"), qaTranscript=f"slow variant ({ratio:.2f}× normal duration) of a checked clip")
        else:
            e.update(qaStatus="REVIEW", qaScore=None, qaTranscript="slow variant; normal clip not yet checked")
    save()
    counts: dict[str, int] = {}
    for e in index.values():
        counts[e.get("qaStatus", "UNCHECKED")] = counts.get(e.get("qaStatus", "UNCHECKED"), 0) + 1
    print("QA status:", counts)


def refresh_slow(index: dict):
    """Slow variants inherit the verdict of their normal-speed twin when their length is plausible."""
    normal = {(e["text"], e["voice"]): e for e in index.values() if e.get("speed") == "normal"}
    for e in index.values():
        if e.get("speed") != "slow" or "error" in e or e.get("qaTranscript", "").startswith("silent"):
            continue
        twin = normal.get((e["text"], e["voice"]))
        if twin and twin.get("qaStatus"):
            ratio = e["durationMs"] / max(1, twin["durationMs"])
            ok = 1.1 <= ratio <= 2.2
            e.update(qaStatus=twin["qaStatus"] if ok else "REVIEW", qaScore=twin.get("qaScore"), qaTranscript=f"slow variant ({ratio:.2f}× normal duration) of a checked clip")


def escalate(args):
    from faster_whisper import WhisperModel

    model_name = args.model if args.model != "base" else "small"
    model = WhisperModel(model_name, device="cpu", compute_type="int8", download_root=str(HERE / "models"), cpu_threads=os.cpu_count() or 4)
    index: dict = json.loads(INDEX.read_text())
    todo = [e for e in index.values() if e.get("speed") == "normal" and e.get("qaStatus") in ("REVIEW", "FAIL") and "error" not in e and (not args.language or e["language"] == args.language)]
    print(f"Escalating {len(todo)} flagged clips with Whisper '{model_name}'", flush=True)
    pad = np.zeros(int(0.6 * SR), np.float32)
    improved = 0
    for e in todo:
        try:
            pcm = np.concatenate([pad, decode(AUDIO / e["key"]), pad])
        except Exception:  # noqa: BLE001
            continue
        segs, _ = model.transcribe(pcm, language=e["language"], beam_size=5, vad_filter=False, condition_on_previous_text=False)
        heard = " ".join(s.text.strip() for s in segs)
        script = " ".join(l.split(":", 1)[1] if l[:2] in ("f:", "m:") else l for l in e["text"].split("\n"))
        r = combined(script, heard, e["language"])
        if r > (e.get("qaScore") or 0):
            e.update(qaStatus=status_for(r), qaScore=round(r, 3), qaTranscript=f"{heard[:480]} [{model_name}]")
            improved += 1
    refresh_slow(index)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=0, sort_keys=True))
    counts: dict[str, int] = {}
    for e in index.values():
        counts[e.get("qaStatus", "UNCHECKED")] = counts.get(e.get("qaStatus", "UNCHECKED"), 0) + 1
    print(f"Improved {improved}. QA status:", counts)


if __name__ == "__main__":
    main()
