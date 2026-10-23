"""Piper voice registry shared by the speech service and the audio generator.

Voice ids mirror src/content/voices.ts: "<model>" or "<model>#<speaker>".
"""
from __future__ import annotations

import io
import threading
import wave
from pathlib import Path

HERE = Path(__file__).parent
VOICES_DIR = HERE / "voices"

# id -> (model file stem, speaker id or None)
VOICES = {
    "en_US-kristin-medium": ("en_US-kristin-medium", None),
    "en_US-joe-medium": ("en_US-joe-medium", None),
    "en_GB-cori-medium": ("en_GB-cori-medium", None),
    "fr_FR-siwis-medium": ("fr_FR-siwis-medium", None),
    "fr_FR-upmc-medium#pierre": ("fr_FR-upmc-medium", 1),
    "fr_FR-upmc-medium#jessica": ("fr_FR-upmc-medium", 0),
    "es_ES-sharvard-medium#F": ("es_ES-sharvard-medium", 1),
    "es_ES-davefx-medium": ("es_ES-davefx-medium", None),
    "es_MX-ald-medium": ("es_MX-ald-medium", None),
    "de_DE-kerstin-low": ("de_DE-kerstin-low", None),
    "de_DE-thorsten-medium": ("de_DE-thorsten-medium", None),
    "da_DK-talesyntese-medium": ("da_DK-talesyntese-medium", None),
    "da_DK-talesyntese-medium+f": ("da_DK-talesyntese-medium", None),
}

# Derived voices: the only open Danish voice is male, so the second dialogue speaker is the
# same voice with a modest formant shift (resampling) and a formant-preserving pitch shift.
POST_FILTERS = {
    "da_DK-talesyntese-medium+f": "asetrate=22050*1.12,aresample=22050,atempo=1/1.12,rubberband=pitch=1.45:formant=preserved",
}

DEFAULT_VOICE = {
    "en": {"f": "en_US-kristin-medium", "m": "en_US-joe-medium"},
    "fr": {"f": "fr_FR-siwis-medium", "m": "fr_FR-upmc-medium#pierre"},
    "es": {"f": "es_ES-sharvard-medium#F", "m": "es_ES-davefx-medium"},
    "de": {"f": "de_DE-kerstin-low", "m": "de_DE-thorsten-medium"},
    "da": {"f": "da_DK-talesyntese-medium+f", "m": "da_DK-talesyntese-medium"},
}

# Slow model audio: stretch phoneme durations rather than resampling, so pitch stays natural.
SLOW_LENGTH_SCALE = 1.45

_cache: dict[str, object] = {}
_lock = threading.Lock()


def load_voice(stem: str):
    from piper import PiperVoice

    with _lock:
        if stem not in _cache:
            path = VOICES_DIR / f"{stem}.onnx"
            if not path.exists():
                raise FileNotFoundError(f"voice model missing: {path} (run services/speech/download_voices.sh)")
            _cache[stem] = PiperVoice.load(str(path))
        return _cache[stem]


def synthesize_to_wav(voice_id: str, text: str, slow: bool = False) -> bytes:
    from piper import SynthesisConfig

    stem, speaker = VOICES[voice_id]
    voice = load_voice(stem)
    cfg = SynthesisConfig(speaker_id=speaker, length_scale=SLOW_LENGTH_SCALE if slow else None)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=cfg)
    post = POST_FILTERS.get(voice_id)
    if not post:
        return buf.getvalue()
    import subprocess

    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "wav", "-i", "-", "-af", post, "-ar", "22050", "-ac", "1", "-f", "wav", "-"],
        input=buf.getvalue(),
        capture_output=True,
        check=True,
    ).stdout
    return out


def phonemize_ipa(voice_id: str, text: str) -> str:
    """Automatic IPA from eSpeak NG (via Piper). Marked as automatic in the app."""
    stem, _ = VOICES[voice_id]
    voice = load_voice(stem)
    sentences = voice.phonemize(text)
    return " ".join("".join(s) for s in sentences).replace("ˈ ", "ˈ").strip()
