#!/bin/bash
# Compile every shaders/*.frag into a Qt shader pack (.qsb) next to it.
set -e
cd "$(dirname "$0")/../shaders"
QSB=${QSB:-/usr/lib/qt6/bin/qsb}
[[ -x $QSB ]] || QSB=$(command -v qsb)
for f in *.frag; do
  "$QSB" --qt6 -O -o "$f.qsb" "$f" 2>&1 | grep -v "^$" || true
  [[ -s "$f.qsb" ]] && echo "built $f.qsb"
done
# the sessile-drop pass is the same source with SESSILE defined
"$QSB" --qt6 -O -D SESSILE -o sessile.frag.qsb rain.frag 2>&1 | grep -v "^$" || true
[[ -s sessile.frag.qsb ]] && echo "built sessile.frag.qsb"
