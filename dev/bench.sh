#!/bin/bash
# Throughput benchmark: run the preview on the hidden output (create it with
# RAIN_HZ=240 dev/preview-output.sh) with an unthrottled animation tick and
# report achieved frames per second from Mesa's HUD dump. Higher is cheaper.
#   dev/bench.sh [config.json] [seconds]
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="${1:-}"; SECS="${2:-8}"
SCRATCH="${RAIN_SCRATCH:-/tmp/rain-preview-$USER}"; HUD="$SCRATCH/hud"
rm -rf "$HUD"; mkdir -p "$HUD"
GALLIUM_HUD=fps GALLIUM_HUD_DUMP_DIR="$HUD" RAIN_TICK=2 RAIN_BENCH_SECS=$((SECS+5)) RAIN_ANIMATE=1 RAIN_NOBUILD=${RAIN_NOBUILD:-0} \
  "$ROOT/dev/shot.sh" "$SCRATCH/bench" "$CFG" 0 >/dev/null 2>&1
f=$(ls "$HUD"/fps* 2>/dev/null | head -1)
if [[ -z $f ]]; then echo "no hud dump"; exit 1; fi
# skip the first seconds (warm-up), average the rest
avg=$(tail -n +4 "$f" | awk '{s+=$1; n++} END { if (n) printf "%.1f", s/n; else print 0 }')
printf "fps=%6s  ms/frame=%5.2f  %s\n" "$avg" "$(awk -v a=$avg 'BEGIN{ if (a>0) printf "%.2f", 1000/a; else print 0}')" "$(basename "$CFG")"
