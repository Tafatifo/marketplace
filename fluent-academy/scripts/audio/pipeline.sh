#!/usr/bin/env bash
# Full audio pipeline for the current curriculum (resumable; safe to re-run):
#   manifest → prune clips no longer referenced → synthesise missing clips → Whisper QA of unchecked clips →
#   re-check failed clips with a larger model → re-check clips flagged for review (slow; optional)
# Usage: bash scripts/audio/pipeline.sh [workers]      (logs to stdout; run under nohup for long jobs)
set -euo pipefail
cd "$(dirname "$0")/../.."
PY=services/speech/.venv/bin/python
WORKERS="${1:-2}"
echo "[$(date -u +%H:%M:%S)] manifest"; npx tsx scripts/content/build.ts
echo "[$(date -u +%H:%M:%S)] prune + generate"; $PY services/speech/generate_audio.py --prune --workers "$WORKERS" || true
echo "[$(date -u +%H:%M:%S)] QA (unchecked clips)"; $PY services/speech/qa_audio.py
echo "[$(date -u +%H:%M:%S)] re-check failed clips with the larger model"; $PY services/speech/qa_audio.py --escalate --only FAIL
echo "[$(date -u +%H:%M:%S)] re-check clips flagged for review with the larger model"; $PY services/speech/qa_audio.py --escalate --only REVIEW
echo "[$(date -u +%H:%M:%S)] done"
