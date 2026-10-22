"""
Fluent Academy self-hosted speech service.

  POST /transcribe   multipart: audio file, language → transcript with word timings
                     (faster-whisper). Word probabilities are recogniser confidence,
                     NOT pronunciation scores.
  POST /tts          JSON: {text, language, gender, speed} → audio/mpeg (Piper TTS)
  GET  /health       model and voice availability

Run:  uvicorn app:app --host 127.0.0.1 --port 8090
Env:  WHISPER_MODEL (default "small"), WHISPER_COMPUTE (default "int8"),
      SPEECH_SERVICE_TOKEN (optional bearer token), VOICES_DIR, MODELS_DIR.

The service never biases recognition towards the expected sentence (no prompt or
hotwords), so a transcript reflects what was actually recognised.
"""
from __future__ import annotations

import io
import os
import subprocess
import tempfile
import threading
import wave
from pathlib import Path

import numpy as np
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from voices import VOICES, load_voice, synthesize_to_wav

HERE = Path(__file__).parent
MODELS_DIR = Path(os.environ.get("MODELS_DIR", HERE / "models"))
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
TOKEN = os.environ.get("SPEECH_SERVICE_TOKEN", "")
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 6 * 1024 * 1024))
MAX_SECONDS = 65

app = FastAPI(title="Fluent Academy speech service", version="1.0")
_model = None
_model_lock = threading.Lock()


def auth(authorization: str | None = Header(default=None)):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def whisper():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type=WHISPER_COMPUTE, download_root=str(MODELS_DIR))
        return _model


def decode_audio(data: bytes) -> np.ndarray:
    """Decode any container (webm/ogg/mp4/wav/mp3) to 16 kHz mono float32 with ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".bin") as f:
        f.write(data)
        f.flush()
        proc = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", f.name, "-t", str(MAX_SECONDS), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
            capture_output=True,
        )
    if proc.returncode != 0 or not proc.stdout:
        raise HTTPException(status_code=422, detail="could not decode audio")
    return np.frombuffer(proc.stdout, np.int16).astype(np.float32) / 32768.0


@app.get("/health")
def health():
    available = {vid: (HERE / "voices" / f"{vid.split('#')[0]}.onnx").exists() for vid in VOICES}
    return {"ok": True, "whisper_model": WHISPER_MODEL, "whisper_loaded": _model is not None, "voices": available}


@app.post("/transcribe", dependencies=[Depends(auth)])
async def transcribe(audio: UploadFile = File(...), language: str = Form(...)):
    data = await audio.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="audio too large")
    if language not in {"en", "fr", "es", "de"}:
        raise HTTPException(status_code=422, detail="unsupported language")
    pcm = decode_audio(data)
    duration = len(pcm) / 16000
    if duration < 0.3:
        return {"text": "", "words": [], "duration": duration, "language": language}
    segments, info = whisper().transcribe(
        pcm,
        language=language,
        word_timestamps=True,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    words = []
    texts = []
    for seg in segments:
        texts.append(seg.text.strip())
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "confidence": round(float(w.probability), 3)})
    return {"text": " ".join(t for t in texts if t), "words": words, "duration": round(duration, 3), "language": info.language}


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: str
    gender: str = "f"
    speed: str = "normal"
    voice: str | None = None


@app.post("/tts", dependencies=[Depends(auth)])
def tts(req: TtsRequest):
    from voices import DEFAULT_VOICE

    voice_id = req.voice or DEFAULT_VOICE.get(req.language, {}).get(req.gender)
    if not voice_id or voice_id not in VOICES:
        raise HTTPException(status_code=422, detail="no voice for language")
    wav = synthesize_to_wav(voice_id, req.text, slow=req.speed == "slow")
    mp3 = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-f", "wav", "-i", "-", "-ac", "1", "-ar", "22050", "-b:a", "40k", "-f", "mp3", "-"],
        input=wav,
        capture_output=True,
    )
    if mp3.returncode != 0:
        raise HTTPException(status_code=500, detail="encoding failed")
    return Response(content=mp3.stdout, media_type="audio/mpeg")
