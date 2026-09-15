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
# the runner state table is the same source with RUNNER_TABLE defined
"$QSB" --qt6 -O -D RUNNER_TABLE -o runners.frag.qsb rain.frag 2>&1 | grep -v "^$" || true
"$QSB" --qt6 -O -D DROP_TABLE -o droptable.frag.qsb rain.frag 2>&1 | grep -v "^$" || true
[[ -s droptable.frag.qsb ]] && echo "built droptable.frag.qsb"
[[ -s runners.frag.qsb ]] && echo "built runners.frag.qsb"
