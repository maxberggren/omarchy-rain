#!/bin/bash
# Copy the plugin into ~/.config/omarchy/plugins/<id>/ (no git, no symlinks),
# rebuild shaders, and make the running shell pick it up. Re-run after edits;
# the shell hot-reloads plugin code on change.
#
#   dev/install-local.sh            install/refresh and enable
#   dev/install-local.sh --remove   remove the local copy
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ID=$(jq -r .id "$ROOT/manifest.json")
DEST="$HOME/.config/omarchy/plugins/$ID"

if [[ $1 == --remove ]]; then
  omarchy-shell -q shell setPluginEnabled "$ID" false || true
  rm -rf "$DEST"
  omarchy-shell -q shell rescanPlugins || true
  echo "removed $DEST"
  exit 0
fi

"$ROOT/dev/build-shaders.sh" >/dev/null
mkdir -p "$DEST/shaders"
cp "$ROOT/manifest.json" "$ROOT/RainBackground.qml" "$ROOT/RainView.qml" "$ROOT/config.js" "$DEST/"
cp "$ROOT"/shaders/*.qsb "$DEST/shaders/"
omarchy plugin validate "$DEST"
omarchy-shell -q shell rescanPlugins || true
if [[ $1 != --no-enable ]]; then
  omarchy plugin enable "$ID" || true
fi
echo "installed $DEST"
