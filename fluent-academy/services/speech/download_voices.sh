#!/usr/bin/env bash
# Downloads the Piper voice models used by Fluent Academy (≈760 MB) from Hugging Face.
set -euo pipefail
cd "$(dirname "$0")/voices"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"
for v in \
  en/en_US/kristin/medium/en_US-kristin-medium \
  en/en_US/joe/medium/en_US-joe-medium \
  en/en_GB/cori/medium/en_GB-cori-medium \
  fr/fr_FR/siwis/medium/fr_FR-siwis-medium \
  fr/fr_FR/upmc/medium/fr_FR-upmc-medium \
  es/es_ES/sharvard/medium/es_ES-sharvard-medium \
  es/es_ES/davefx/medium/es_ES-davefx-medium \
  es/es_MX/ald/medium/es_MX-ald-medium \
  de/de_DE/thorsten/medium/de_DE-thorsten-medium \
  de/de_DE/kerstin/low/de_DE-kerstin-low \
  da/da_DK/talesyntese/medium/da_DK-talesyntese-medium; do
  n=$(basename "$v")
  [ -s "$n.onnx" ] || curl -fsSL --retry 4 -o "$n.onnx" "$BASE/$v.onnx"
  [ -s "$n.onnx.json" ] || curl -fsSL --retry 4 -o "$n.onnx.json" "$BASE/$v.onnx.json"
  [ -s "$n.MODEL_CARD" ] || curl -fsSL --retry 4 -o "$n.MODEL_CARD" "$BASE/$(dirname "$v")/MODEL_CARD"
  echo "ok $n"
done
