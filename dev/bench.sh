#!/bin/bash
# Animate the preview on the hidden output at 60 fps and report average GPU
# busy % and package power over a window. Usage: dev/bench.sh [config.json] [seconds]
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="${1:-}"; SECS="${2:-8}"
SCRATCH="${RAIN_SCRATCH:-/tmp/rain-preview-$USER}"; CFGDIR="$SCRATCH/cfg"
RAIN_ANIMATE=1 RAIN_NOBUILD=${RAIN_NOBUILD:-0} "$ROOT/dev/shot.sh" "$SCRATCH/bench" "$CFG" 0 >/dev/null 2>&1 &
sleep 5
D=/sys/class/drm/card1/device; [[ -f $D/gpu_busy_percent ]] || D=/sys/class/drm/card0/device
H=$(ls -d $D/hwmon/hwmon* | head -1)
b=0; pw=0; n=0
for ((i=0;i<SECS*2;i++)); do
  b=$((b + $(cat $D/gpu_busy_percent)))
  [[ -f $H/power1_average ]] && pw=$((pw + $(cat $H/power1_average)/1000))
  n=$((n+1)); sleep 0.5
done
wait
printf "busy=%3d%% power=%5dmW  %s\n" $((b/n)) $((pw/n)) "$(basename "$CFG")"
