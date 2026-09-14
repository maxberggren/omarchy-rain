#!/bin/bash
# Animate the preview on the hidden output for a few seconds at 60 fps and
# report average GPU busy % and package power. Usage: dev/bench.sh [config.json] [seconds]
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CFG="${1:-}"; SECS="${2:-6}"
SCRATCH="${RAIN_SCRATCH:-/tmp/rain-preview-$USER}"; CFGDIR="$SCRATCH/cfg"
RAIN_ANIMATE=1 "$ROOT/dev/shot.sh" "$SCRATCH/bench" "$CFG" 0 >/dev/null 2>&1 &
sleep 4
D=/sys/class/drm/card1/device; [[ -f $D/gpu_busy_percent ]] || D=/sys/class/drm/card0/device
H=$(ls -d $D/hwmon/hwmon* | head -1)
b=0; pw=0; n=0
for ((i=0;i<SECS;i++)); do
  b=$((b + $(cat $D/gpu_busy_percent)))
  [[ -f $H/power1_average ]] && pw=$((pw + $(cat $H/power1_average)/1000))
  n=$((n+1)); sleep 1
done
wait
echo "busy=$((b/n))% power=$((pw/n))mW ($CFG)"
