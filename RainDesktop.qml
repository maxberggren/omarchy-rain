import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import QtQuick

// Optional always-on desktop mode: rain over the current wallpaper on every
// screen, one layer above the stock background. Enable with
// `"desktop": { "enabled": true }` in ~/.config/omarchy/rain.json.
Item {
  id: root

  property var cfg: ({})
  property bool enabled: false
  property bool paused: false

  readonly property string home: Quickshell.env("HOME")
  readonly property string currentBackgroundLink: home + "/.local/state/omarchy/current/background"
  property string backgroundPath: ""

  readonly property real period: 600
  property real epoch: Date.now()
  property real time: 0
  readonly property real fullFps: Math.max(0, Math.min(240, Number(cfg.fps) || 0))
  readonly property real coveredFps: cfg.coveredFps === undefined || cfg.coveredFps === null ? fullFps : Math.max(0, Math.min(240, Number(cfg.coveredFps) || 0))
  readonly property int focusedWindows: {
    var m = Hyprland.focusedMonitor;
    var ws = m ? m.activeWorkspace : null;
    if (!ws) return 0;
    var ipc = ws.lastIpcObject;
    if (ipc && ipc.windows !== undefined) return Number(ipc.windows) || 0;
    var tl = ws.toplevels;
    return tl && tl.values ? tl.values.length : 0;
  }
  readonly property real fps: focusedWindows > 0 ? coveredFps : fullFps

  Timer { interval: 2000; repeat: true; running: root.enabled; onTriggered: Hyprland.refreshWorkspaces() }
  Timer {
    interval: root.fps > 0 ? Math.round(1000 / root.fps) : 1000
    repeat: true
    running: root.enabled && !root.paused && root.fps > 0 && root.backgroundPath !== ""
    onTriggered: root.time = ((Date.now() - root.epoch) / 1000) % root.period
  }

  function refreshBackground() {
    if (cfg.backgroundPath) { backgroundPath = String(cfg.backgroundPath); return; }
    if (!readlinkProc.running) readlinkProc.running = true;
  }
  Process {
    id: readlinkProc
    command: ["readlink", "-f", root.currentBackgroundLink]
    stdout: StdioCollector {
      onStreamFinished: {
        var p = String(text || "").trim();
        if (p.length && p !== root.backgroundPath) root.backgroundPath = p;
      }
    }
  }
  Timer { interval: 3000; repeat: true; running: root.enabled; onTriggered: root.refreshBackground() }
  onEnabledChanged: if (enabled) refreshBackground()
  Component.onCompleted: if (enabled) refreshBackground()

  function screenWanted(screen) {
    var list = cfg.screens;
    if (typeof list === "string") list = list.length ? list.split(",").map(function(x) { return x.trim(); }) : [];
    if (!Array.isArray(list) || list.length === 0) return true;
    return list.indexOf(screen.name) !== -1;
  }

  Variants {
    model: Quickshell.screens
    PanelWindow {
      required property var modelData
      screen: modelData
      visible: root.enabled && root.backgroundPath !== "" && root.screenWanted(modelData)
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "omarchy-rain"
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      mask: Region {}
      RainView {
        anchors.fill: parent
        imageSource: root.backgroundPath ? ("file://" + root.backgroundPath) : ""
        cfg: root.cfg
        time: root.time
        paused: root.paused || !root.enabled
      }
    }
  }
}
