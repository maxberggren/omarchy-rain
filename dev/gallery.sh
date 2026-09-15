#!/bin/bash
# Render docs/gallery/*.jpg from docs/gallery/gallery.txt (name|description|json)
# on the hidden preview output, and write docs/GALLERY.md.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
G="$ROOT/docs/gallery"; T="${RAIN_GALLERY_T:-20}"
IMG="${RAIN_IMAGE:-$(readlink -f "$HOME/.local/state/omarchy/current/background")}"
"$ROOT/dev/build-shaders.sh" >/dev/null
tmp=$(mktemp -d)
{
  echo "# Settings gallery"
  echo
  echo "Every image is the same wallpaper and the same moment (t = ${T}s), rendered at 1080p with only the listed keys changed from the defaults. See the README for the full settings table."
  echo
} > "$G/../GALLERY.md"
while IFS='|' read -r name desc json; do
  [[ -z $name || $name == \#* ]] && continue
  echo "$json" > "$tmp/$name.json"
  RAIN_NOBUILD=1 RAIN_IMAGE="$IMG" "$ROOT/dev/shot.sh" "$tmp/$name" "$tmp/$name.json" "$T" >/dev/null 2>&1 || true
  magick "$tmp/${name}_t${T}.png" -resize 960x -quality 80 "$G/$name.jpg"
  printf '## %s\n\n`%s`\n\n![%s](gallery/%s.jpg)\n\n' "$desc" "$json" "$name" "$name" >> "$G/../GALLERY.md"
  echo "rendered $name"
done < "$G/gallery.txt"
rm -rf "$tmp"
