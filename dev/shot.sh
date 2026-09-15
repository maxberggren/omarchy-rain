#!/bin/bash
# Render the rain view on the hidden "rainpreview" Hyprland output and grab
# screenshots at given animation times.
#
#   dev/shot.sh <out-prefix> [config.json] [t1,t2,...]   (default times: 8)
#
# Requires: hyprctl output create headless rainpreview (see dev/preview-output.sh)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$1"; CFG="${2:-}"; TIMES="${3:-8}"
SCRATCH="${RAIN_SCRATCH:-/tmp/rain-preview-$USER}"
CFGDIR="$SCRATCH/cfg"
IMG="${RAIN_IMAGE:-$(readlink -f "$HOME/.local/state/omarchy/current/background")}"

[[ ${RAIN_NOBUILD:-0} == 1 ]] || "$ROOT/dev/build-shaders.sh" >/dev/null
mkdir -p "$CFGDIR/shaders"
cp "${RAIN_VIEW:-$ROOT/RainView.qml}" "$CFGDIR/RainView.qml"; cp "$ROOT/config.js" "$ROOT/RainLockView.qml" "$CFGDIR/"
# the lock view imports omarchy's shell modules; copy them into the harness root
rm -rf "$CFGDIR/Commons" "$CFGDIR/Ui"; cp -r /usr/share/omarchy/shell/Commons /usr/share/omarchy/shell/Ui "$CFGDIR/" 2>/dev/null || true
cp "$ROOT"/shaders/*.qsb "$ROOT"/dev/shaders/*.qsb "$CFGDIR/shaders/"
if [[ -n $CFG && -f $CFG ]]; then cp "$CFG" "$CFGDIR/rain.json"; else echo '{}' > "$CFGDIR/rain.json"; fi

cat > "$CFGDIR/shell.qml" <<EOF
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import "config.js" as Cfg

ShellRoot {
  id: root
  property var cfg: Cfg.withDefaults({})
  property real t: 0
  FileView {
    path: Qt.resolvedUrl("rain.json")
    onLoaded: { try { root.cfg = Cfg.withDefaults(JSON.parse(text())) } catch (e) { console.warn("bad cfg", e) } }
  }
  IpcHandler {
    target: "preview"
    function setTime(v: string): void { root.t = Number(v) }
  }
  property real epoch: Date.now()
  Timer { interval: ${RAIN_TICK:-16}; repeat: true; running: ${RAIN_ANIMATE:-0} == 1; onTriggered: root.t = ((Date.now() - root.epoch) / 1000) % 600 }
  Variants {
    model: Quickshell.screens.filter(s => s.name === "rainpreview")
    PanelWindow {
      required property var modelData
      screen: modelData
      anchors { top: true; bottom: true; left: true; right: true }
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.namespace: "rain-preview"
      exclusionMode: ExclusionMode.Ignore
      color: "black"
      RainView {
        visible: ${RAIN_LOCKVIEW:-0} == 0
        anchors.fill: parent
        imageSource: "file://$IMG"
        cfg: root.cfg
        time: root.t
        debug: ${RAIN_DEBUG:-0}
      }
      Loader {
        anchors.fill: parent
        active: ${RAIN_LOCKVIEW:-0} == 1
        sourceComponent: RainLockView {
          backgroundPath: "$IMG"
          rainCfg: root.cfg
          rainTime: root.t
          inputEnabled: false
          loadBackground: true
          passwordText: ""
        }
      }
    }
  }
}
EOF

LOG="$OUT.log"
quickshell -p "$CFGDIR/shell.qml" > "$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
sleep 3
IFS=',' read -ra TS <<< "$TIMES"
for t in "${TS[@]}"; do
  if [[ ${RAIN_ANIMATE:-0} == 1 ]]; then sleep ${RAIN_BENCH_SECS:-14}; break; fi
  quickshell ipc -p "$CFGDIR/shell.qml" call preview setTime "$t" >/dev/null 2>&1 || true
  sleep 0.6
  grim -o rainpreview "${OUT}_t${t}.png"
  echo "shot: ${OUT}_t${t}.png"
done
grep -iE "warn|error|fail" "$LOG" | grep -v "portal\|blackhole" || true
