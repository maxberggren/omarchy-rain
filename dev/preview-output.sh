#!/bin/bash
# Create (or remove with --remove) a hidden headless Hyprland output used by
# dev/shot.sh so previews never appear on a real monitor.
if [[ $1 == --remove ]]; then hyprctl output remove rainpreview; exit; fi
hyprctl monitors -j | jq -e '.[] | select(.name=="rainpreview")' >/dev/null 2>&1 && exit 0
hyprctl output create headless rainpreview
sleep 0.5
hyprctl eval "hl.monitor({ output = \"rainpreview\", mode = \"1920x1080@${RAIN_HZ:-60}\", position = \"100000x100000\", scale = 1 })"
