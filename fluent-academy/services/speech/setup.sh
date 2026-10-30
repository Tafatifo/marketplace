#!/usr/bin/env bash
# Sets up the self-hosted speech service: Python virtualenv, dependencies and Piper voices.
# Requires Python 3.11+ and ffmpeg (with librubberband for the derived Danish voice).
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required (apt install ffmpeg / brew install ffmpeg)"; exit 1; }
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r requirements.txt
mkdir -p voices models
bash download_voices.sh
echo "Speech service ready. Start it with: npm run speech:dev (set SPEECH_SERVICE_TOKEN first)"
