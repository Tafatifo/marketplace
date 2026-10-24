#!/usr/bin/env bash
# Full audio pipeline for the current curriculum (resumable; safe to re-run):
#   manifest → prune clips no longer referenced → synthesise missing clips → Whisper QA → escalate flagged clips
# Usage: bash scripts/audio/pipeline.sh [workers]      (logs to stdout; run under nohup for long jobs)
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=services/speech/.venv/bin/python
WORKERS="${1:-2}"
echo "[$(date -u +%H:%M:%S)] manifest"; npx tsx scripts/content/build.ts
echo "[$(date -u +%H:%M:%S)] prune + generate"; $PY services/speech/generate_audio.py --prune --workers "$WORKERS" || true
echo "[$(date -u +%H:%M:%S)] QA (new clips)"; $PY services/speech/qa_audio.py
echo "[$(date -u +%H:%M:%S)] QA escalation (flagged clips)"; $PY services/speech/qa_audio.py --escalate
echo "[$(date -u +%H:%M:%S)] done"
