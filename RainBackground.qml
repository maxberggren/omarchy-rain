import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import QtQuick
import "config.js" as Cfg

// Omarchy shell service plugin: draws animated rain over the current
// wallpaper on every screen, one layer above the stock background so the
// stock double-click handlers and theme transitions keep working underneath.
//
// Configuration: ~/.config/omarchy/rain.json (hot-reloaded). Live control:
//   omarchy-shell rain set rain.speed 1.5
//   omarchy-shell rain preset downpour
//   omarchy-shell rain toggle
Item {
  id: root

  // Host injection (optional; the plugin works without it).
  property var omarchyPath: null
  property var shell: null
  property var manifest: null

  readonly property string build: "54"
  readonly property string home: Quickshell.env("HOME")
  readonly property string configPath: home + "/.config/omarchy/rain.json"
  readonly property string currentBackgroundLink: home + "/.local/state/omarchy/current/background"

  property var userCfg: ({})
  property var cfg: Cfg.withDefaults({})
  property string backgroundPath: ""
  property bool enabled: cfg.enabled !== false
  property bool paused: false

  // ---------------------------------------------------------------- time
  // Wrapped to the shader's period so the wrap is seamless; the epoch is
  // taken at load so a fresh shell starts at t=0.
  readonly property real period: 600
  property real epoch: Date.now()
  property real time: 0
  // While the focused workspace has windows the wallpaper is mostly covered,
  // so the animation drops to coveredFps (set it equal to fps to disable).
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
  // keep the workspace window counts fresh
  Timer { interval: 2000; repeat: true; running: root.enabled; onTriggered: Hyprland.refreshWorkspaces() }
  readonly property real fps: focusedWindows > 0 ? coveredFps : fullFps

  Timer {
    id: tick
    interval: root.fps > 0 ? Math.round(1000 / root.fps) : 1000
    repeat: true
    running: root.enabled && !root.paused && root.fps > 0 && root.backgroundPath !== ""
    onTriggered: root.time = ((Date.now() - root.epoch) / 1000) % root.period
  }

  // -------------------------------------------------------------- config
  function applyConfig(text) {
    var parsed = {};
    var raw = String(text || "").trim();
    if (raw.length) {
      try { parsed = JSON.parse(raw); }
      catch (e) { console.warn("rain: " + configPath + " is not valid JSON: " + e); return; }
    }
    userCfg = parsed;
    cfg = Cfg.withDefaults(parsed);
    if (cfg.backgroundPath) backgroundPath = String(cfg.backgroundPath);
    else refreshBackground();
  }

  function persistConfig() {
    var text = JSON.stringify(userCfg, null, 2) + "\n";
    configFile.setText(text);
  }

  FileView {
    id: configFile
    path: root.configPath
    watchChanges: true
    printErrors: false
    onLoaded: root.applyConfig(text())
    onLoadFailed: root.applyConfig("")
    onFileChanged: reload()
    onSaveFailed: function(err) { console.warn("rain: could not write " + root.configPath + ": " + err); }
  }

  // ---------------------------------------------------------- background
  function refreshBackground() {
    if (cfg.backgroundPath) return;
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

  // The stock background plugin polls the same symlink; poll a little slower.
  Timer {
    interval: 3000
    repeat: true
    running: root.enabled
    onTriggered: root.refreshBackground()
  }

  // ------------------------------------------------------------------ ipc
  IpcHandler {
    target: "rain"

    function refresh(): void { root.refreshBackground(); }
    function reload(): void { configFile.reload(); }
    function toggle(): void { root.setEnabled(!root.enabled); }
    function enable(): void { root.setEnabled(true); }
    function disable(): void { root.setEnabled(false); }
    function pause(): void { root.paused = true; }
    function resume(): void { root.paused = false; }

    // Set a dotted key, e.g. `set rain.speed 1.5`, and persist it.
    function set(key: string, value: string): string {
      Cfg.setPath(root.userCfg, key, value);
      root.cfg = Cfg.withDefaults(root.userCfg);
      root.persistConfig();
      return JSON.stringify(Cfg.getPath(root.cfg, key));
    }

    function get(key: string): string {
      return JSON.stringify(key ? Cfg.getPath(root.cfg, key) : root.cfg);
    }

    // Apply a named preset on top of the defaults (replaces user overrides).
    function preset(name: string): string {
      var p = Cfg.presets[String(name)];
      if (!p) return "unknown preset; try: " + Object.keys(Cfg.presets).join(", ");
      var keep = { enabled: root.userCfg.enabled, backgroundPath: root.userCfg.backgroundPath, screens: root.userCfg.screens };
      var next = Cfg.merge(p, {});
      for (var k in keep) if (keep[k] !== undefined) next[k] = keep[k];
      root.userCfg = next;
      root.cfg = Cfg.withDefaults(next);
      root.persistConfig();
      return "ok";
    }

    function presets(): string { return Object.keys(Cfg.presets).join("\n"); }
    function status(): string {
      return JSON.stringify({ build: root.build, enabled: root.enabled, paused: root.paused, background: root.backgroundPath, fps: root.fps, covered: root.focusedWindows > 0, time: root.time });
    }
  }

  function setEnabled(on) {
    userCfg.enabled = !!on;
    cfg = Cfg.withDefaults(userCfg);
    persistConfig();
  }

  function screenWanted(screen) {
    var list = cfg.screens;
    if (typeof list === "string") list = list.length ? list.split(",").map(function(x) { return x.trim(); }) : [];
    if (!Array.isArray(list) || list.length === 0) return true;
    return list.indexOf(screen.name) !== -1;
  }

  Component.onCompleted: refreshBackground()

  // -------------------------------------------------------------- windows
  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel
      required property var modelData
      screen: modelData
      visible: root.enabled && root.backgroundPath !== "" && root.screenWanted(modelData)
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "omarchy-rain"
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
      // No input region: clicks fall through to the stock background layer.
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
