import QtQuick
import "config.js" as Cfg

// Renders one wallpaper with rain on it. Reusable by the plugin and the
// dev preview. Set `imageSource` (a file URL), `cfg` (merged config
// object) and drive `time` in seconds.
//
// Passes:
//   sharp  -> lensblur -> fog        static, rendered once per wallpaper/config
//   glass                            static grain / condensation density map
//   sessile                          sitting drops, cached, refreshed at drops.fps
//   rain                             runners, tracks, fog, composite; every frame
Item {
  id: view

  property url imageSource
  property var cfg: Cfg.withDefaults({})
  property real time: 0
  property bool paused: false
  property int debug: 0   // 0 normal, 1 sharp, 2 blur, 3 fog, 4 glass, 5 sessile

  // Render target size in physical pixels times renderScale.
  readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1
  readonly property real renderScale: Math.max(0.25, Math.min(2.0, Number(cfg.renderScale) || 1.0))
  readonly property int rw: Math.max(8, Math.round(width * dpr * renderScale))
  readonly property int rh: Math.max(8, Math.round(height * dpr * renderScale))
  readonly property real pxScale: (rh / 1080.0)
  readonly property bool nativeRes: Math.abs(renderScale - 1.0) < 0.001

  function num(v, d) { var n = Number(v); return isNaN(n) ? d : n; }
  function vec3(a, d) { return (Array.isArray(a) && a.length >= 3) ? Qt.vector3d(num(a[0], d[0]), num(a[1], d[1]), num(a[2], d[2])) : Qt.vector3d(d[0], d[1], d[2]); }

  readonly property bool ready: img.status === Image.Ready

  // ---------------------------------------------------------------- source
  Image {
    id: img
    width: view.rw
    height: view.rh
    source: view.imageSource
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    cache: false
    smooth: true
    mipmap: false
    visible: true
    // Decode large wallpapers down to roughly the render size to save VRAM;
    // the max-side square keeps portrait and landscape sources covering.
    sourceSize: Qt.size(Math.round(Math.max(view.rw, view.rh) * 1.25), Math.round(Math.max(view.rw, view.rh) * 1.25))
  }
  ShaderEffectSource {
    id: sharpSrc
    sourceItem: img
    hideSource: true
    textureSize: Qt.size(view.rw, view.rh)
    mipmap: true
    smooth: true
    live: false
    anchors.fill: parent
    visible: view.debug === 1
  }

  // ------------------------------------------------------------- lens blur
  ShaderEffect {
    id: blurFx
    width: view.rw
    height: view.rh
    visible: true
    property var src: sharpSrc
    property vector2d resolution: Qt.vector2d(view.rw, view.rh)
    property real radius: view.num(view.cfg.blur.radius, 26) * view.pxScale
    property real blades: view.num(view.cfg.blur.blades, 0)
    property real rotation: view.num(view.cfg.blur.rotation, 0)
    property real boost: view.num(view.cfg.blur.highlightBoost, 4)
    property real ring: view.num(view.cfg.blur.ring, 0.6)
    property real threshold: view.num(view.cfg.blur.threshold, 0.35)
    fragmentShader: Qt.resolvedUrl("shaders/lensblur.frag.qsb")
    onStatusChanged: if (status === ShaderEffect.Error) console.warn("rain: lensblur shader failed:", log)
  }
  ShaderEffectSource {
    id: blurSrc
    sourceItem: blurFx
    hideSource: true
    textureSize: Qt.size(view.rw, view.rh)
    mipmap: true
    smooth: true
    live: false
    anchors.fill: parent
    visible: view.debug === 2
  }

  // -------------------------------------------------------------- fog blur
  ShaderEffect {
    id: fogFx
    // a fixed ~480 px wide pass so the condensation blur is the same width in
    // screen terms at any render resolution
    width: Math.max(4, Math.round(view.rw / (4 * view.pxScale)))
    height: Math.max(4, Math.round(view.rh / (4 * view.pxScale)))
    visible: true
    property var src: blurSrc
    property vector2d resolution: Qt.vector2d(width, height)
    property real spread: view.num(view.cfg.blur.fogSpread, 1.6)
    fragmentShader: Qt.resolvedUrl("shaders/fog.frag.qsb")
    onStatusChanged: if (status === ShaderEffect.Error) console.warn("rain: fog shader failed:", log)
  }
  ShaderEffectSource {
    id: fogSrc
    sourceItem: fogFx
    hideSource: true
    textureSize: Qt.size(fogFx.width, fogFx.height)
    smooth: true
    live: false
    anchors.fill: parent
    visible: view.debug === 3
  }

  // ----------------------------------------------------------- glass map
  ShaderEffect {
    id: glassFx
    width: view.rw
    height: view.rh
    visible: true
    property vector2d resolution: Qt.vector2d(view.rw, view.rh)
    property real pxScale: view.pxScale
    property real seed: view.num(view.cfg.seed, 0)
    property real scratches: view.num(view.cfg.glass.scratches, 0)
    property real dust: view.num(view.cfg.glass.dust, 0.3)
    fragmentShader: Qt.resolvedUrl("shaders/glass.frag.qsb")
    onStatusChanged: if (status === ShaderEffect.Error) console.warn("rain: glass shader failed:", log)
  }
  ShaderEffectSource {
    id: glassSrc
    sourceItem: glassFx
    hideSource: true
    textureSize: Qt.size(view.rw, view.rh)
    smooth: true
    live: false
    anchors.fill: parent
    visible: view.debug === 4
  }

  // The static passes are rendered on demand, in dependency order, one
  // frame apart so each reads a finished texture.
  function refreshStatic() { staticChain.restart() }
  property int staticStep: 0
  property int staticRevision: 0
  Timer {
    id: staticChain
    interval: 40
    repeat: true
    running: false
    onRunningChanged: if (running) view.staticStep = 0
    onTriggered: {
      if (view.staticStep === 0) { sharpSrc.scheduleUpdate(); glassSrc.scheduleUpdate() }
      else if (view.staticStep === 1) blurSrc.scheduleUpdate()
      else if (view.staticStep === 2) fogSrc.scheduleUpdate()
      else if (view.staticStep === 3) sessSrc.scheduleUpdate()
      else { stop(); view.staticRevision += 1 }
      view.staticStep += 1
    }
  }
  onReadyChanged: if (ready) refreshStatic()
  onRwChanged: if (ready) refreshStatic()
  onRhChanged: if (ready) refreshStatic()
  Connections {
    target: blurFx
    function onRadiusChanged() { if (view.ready) view.refreshStatic() }
    function onBladesChanged() { if (view.ready) view.refreshStatic() }
    function onRotationChanged() { if (view.ready) view.refreshStatic() }
    function onBoostChanged() { if (view.ready) view.refreshStatic() }
    function onRingChanged() { if (view.ready) view.refreshStatic() }
    function onThresholdChanged() { if (view.ready) view.refreshStatic() }
  }
  Connections {
    target: fogFx
    function onSpreadChanged() { if (view.ready) view.refreshStatic() }
  }
  Connections {
    target: glassFx
    function onSeedChanged() { if (view.ready) view.refreshStatic() }
    function onScratchesChanged() { if (view.ready) view.refreshStatic() }
    function onDustChanged() { if (view.ready) view.refreshStatic() }
  }

  // -------------------------------------------------- shared uniforms
  // Both drop passes read the same parameters; keep them in one place.
  QtObject {
    id: u
    readonly property real seed: view.num(view.cfg.seed, 0)
    readonly property real rainAmount: view.num(view.cfg.rain.amount, 0.3)
    readonly property real rainSpawn: view.num(view.cfg.rain.spawnRate, 1)
    readonly property real rainSpeed: view.num(view.cfg.rain.speed, 1)
    readonly property real rainStickSlip: view.num(view.cfg.rain.stickSlip, 0.85)
    readonly property real rainWander: view.num(view.cfg.rain.wander, 1)
    readonly property real rainTrail: view.num(view.cfg.rain.trail, 0.3)
    readonly property real rainTrailWidth: view.num(view.cfg.rain.trailWidth, 1)
    readonly property real rainLayers: view.num(view.cfg.rain.layers, 2)
    readonly property real rainSize: view.num(view.cfg.rain.size, 1)
    readonly property real rainGrow: view.num(view.cfg.rain.grow, 0.7)
    readonly property real rainStartAbove: view.cfg.rain.startAbove === false ? 0 : 1
    readonly property real rainTurn: view.num(view.cfg.rain.turn, 0.35)
    readonly property real dropDensity: view.num(view.cfg.drops.density, 1.4)
    readonly property real dropSize: view.num(view.cfg.drops.size, 1)
    readonly property real dropSpawn: view.num(view.cfg.drops.spawnRate, 2)
    readonly property real dropIrregular: view.num(view.cfg.drops.irregularity, 1)
    readonly property real dropMerge: view.num(view.cfg.drops.merge, 1)
    readonly property real dropLayers: view.num(view.cfg.drops.layers, 3)
    readonly property real fogAmount: view.num(view.cfg.fog.amount, 0.45)
    readonly property real fogGrain: view.num(view.cfg.fog.grain, 0.45)
    readonly property real fogRegrow: view.num(view.cfg.fog.regrow, 1.4)
    readonly property real fogHalo: view.num(view.cfg.fog.halo, 0.35)
    readonly property real fogLift: view.num(view.cfg.fog.lift, 0.6)
    readonly property vector4d fogTint: { var t = view.vec3(view.cfg.fog.tint, [0.85, 0.88, 0.94]); return Qt.vector4d(t.x, t.y, t.z, view.num(view.cfg.fog.tintStrength, 0.25)); }
    readonly property real lensZoom: view.num(view.cfg.optics.lensZoom, 7)
    readonly property real lensField: view.num(view.cfg.optics.field, 0.06)
    readonly property real curvature: view.num(view.cfg.optics.curvature, 0.65)
    readonly property real refraction: view.num(view.cfg.optics.refraction, 1)
    readonly property real dropSharp: view.num(view.cfg.optics.sharpness, 0.5)
    readonly property real rimDark: view.num(view.cfg.optics.rimDark, 0.35)
    readonly property real outline: view.num(view.cfg.optics.outline, 0.45)
    readonly property real highlight: view.num(view.cfg.optics.highlight, 0.8)
    readonly property real sheen: view.num(view.cfg.optics.sheen, 1)
    readonly property real shadow: view.num(view.cfg.optics.shadow, 0.2)
    readonly property real brighten: view.num(view.cfg.optics.brighten, 0.12)
    readonly property real dropContrast: view.num(view.cfg.optics.contrast, 1.0)
    readonly property real trailEdge: view.num(view.cfg.rain.trailEdge, 1)
    readonly property vector4d lightDir: { var l = view.vec3(view.cfg.optics.light, [-0.45, -0.7, 0.75]); return Qt.vector4d(l.x, l.y, l.z, view.num(view.cfg.optics.reflection, 0.25)); }
    readonly property vector4d reflectColor: { var c = view.vec3(view.cfg.optics.reflectionColor, [0.85, 0.9, 1.0]); return Qt.vector4d(c.x, c.y, c.z, view.num(view.cfg.optics.reflection, 0.25)); }
    readonly property real scratches: view.num(view.cfg.glass.scratches, 0)
    readonly property real dust: view.num(view.cfg.glass.dust, 0.3)
    readonly property real vignette: view.num(view.cfg.glass.vignette, 0.25)
    readonly property real brightness: view.num(view.cfg.post.brightness, 1)
    readonly property real contrast: view.num(view.cfg.post.contrast, 1)
    readonly property real saturation: view.num(view.cfg.post.saturation, 0.8)
    readonly property real filmic: view.num(view.cfg.post.filmic, 0.35)
  }

  // ----------------------------------------------------------- sessile
  // Sitting drops change slowly (impacts, growth, being swept), so they are
  // rendered into a cached texture at drops.fps instead of every frame.
  readonly property real dropsFps: Math.max(0, Math.min(60, view.num(view.cfg.drops.fps, 8)))
  Timer {
    interval: view.dropsFps > 0 ? Math.round(1000 / view.dropsFps) : 1000
    repeat: true
    running: view.ready && !view.paused && view.dropsFps > 0 && view.staticRevision > 0 && view.visible
    onTriggered: sessSrc.scheduleUpdate()
  }
  ShaderEffect {
    id: sessileFx
    width: view.rw
    height: view.rh
    visible: true
    property var sharpTex: sharpSrc
    property var blurTex: blurSrc
    property var fogTex: fogSrc
    property var glassTex: glassSrc
    property real time: view.time
    property vector2d resolution: Qt.vector2d(view.rw, view.rh)
    property real pxScale: view.pxScale
    property real seed: u.seed
    property real rainAmount: u.rainAmount
    property real rainSpawn: u.rainSpawn
    property real rainSpeed: u.rainSpeed
    property real rainStickSlip: u.rainStickSlip
    property real rainWander: u.rainWander
    property real rainTrail: u.rainTrail
    property real rainTrailWidth: u.rainTrailWidth
    property real rainLayers: u.rainLayers
    property real rainSize: u.rainSize
    property real rainGrow: u.rainGrow
    property real rainStartAbove: u.rainStartAbove
    property real rainTurn: u.rainTurn
    property real dropDensity: u.dropDensity
    property real dropSize: u.dropSize
    property real dropSpawn: u.dropSpawn
    property real dropIrregular: u.dropIrregular
    property real dropMerge: u.dropMerge
    property real dropLayers: u.dropLayers
    property real fogAmount: u.fogAmount
    property real fogGrain: u.fogGrain
    property real fogRegrow: u.fogRegrow
    property real fogHalo: u.fogHalo
    property real fogLift: u.fogLift
    property vector4d fogTint: u.fogTint
    property real lensZoom: u.lensZoom
    property real lensField: u.lensField
    property real curvature: u.curvature
    property real refraction: u.refraction
    property real dropSharp: u.dropSharp
    property real rimDark: u.rimDark
    property real outline: u.outline
    property real highlight: u.highlight
    property real sheen: u.sheen
    property real shadow: u.shadow
    property real brighten: u.brighten
    property real dropContrast: u.dropContrast
    property real trailEdge: u.trailEdge
    property vector4d lightDir: u.lightDir
    property vector4d reflectColor: u.reflectColor
    property real scratches: u.scratches
    property real dust: u.dust
    property real vignette: u.vignette
    property real brightness: u.brightness
    property real contrast: u.contrast
    property real saturation: u.saturation
    property real filmic: u.filmic
    fragmentShader: Qt.resolvedUrl("shaders/sessile.frag.qsb")
    onStatusChanged: if (status === ShaderEffect.Error) console.warn("rain: sessile shader failed:", log)
  }
  ShaderEffectSource {
    id: sessSrc
    sourceItem: sessileFx
    hideSource: true
    textureSize: Qt.size(view.rw, view.rh)
    smooth: true
    live: false
    anchors.fill: parent
    visible: view.debug === 5
  }

  // ----------------------------------------------------------------- rain
  ShaderEffect {
    id: rainFx
    anchors.fill: parent
    visible: view.ready && view.debug === 0 && view.staticRevision > 0
    layer.enabled: !view.nativeRes
    layer.textureSize: Qt.size(view.rw, view.rh)
    layer.smooth: true

    property var sharpTex: sharpSrc
    property var blurTex: blurSrc
    property var fogTex: fogSrc
    property var glassTex: glassSrc
    property var sessTex: sessSrc
    property real time: view.time
    property vector2d resolution: Qt.vector2d(view.rw, view.rh)
    property real pxScale: view.pxScale
    property real seed: u.seed
    property real rainAmount: u.rainAmount
    property real rainSpawn: u.rainSpawn
    property real rainSpeed: u.rainSpeed
    property real rainStickSlip: u.rainStickSlip
    property real rainWander: u.rainWander
    property real rainTrail: u.rainTrail
    property real rainTrailWidth: u.rainTrailWidth
    property real rainLayers: u.rainLayers
    property real rainSize: u.rainSize
    property real rainGrow: u.rainGrow
    property real rainStartAbove: u.rainStartAbove
    property real rainTurn: u.rainTurn
    property real dropDensity: u.dropDensity
    property real dropSize: u.dropSize
    property real dropSpawn: u.dropSpawn
    property real dropIrregular: u.dropIrregular
    property real dropMerge: u.dropMerge
    property real dropLayers: u.dropLayers
    property real fogAmount: u.fogAmount
    property real fogGrain: u.fogGrain
    property real fogRegrow: u.fogRegrow
    property real fogHalo: u.fogHalo
    property real fogLift: u.fogLift
    property vector4d fogTint: u.fogTint
    property real lensZoom: u.lensZoom
    property real lensField: u.lensField
    property real curvature: u.curvature
    property real refraction: u.refraction
    property real dropSharp: u.dropSharp
    property real rimDark: u.rimDark
    property real outline: u.outline
    property real highlight: u.highlight
    property real sheen: u.sheen
    property real shadow: u.shadow
    property real brighten: u.brighten
    property real dropContrast: u.dropContrast
    property real trailEdge: u.trailEdge
    property vector4d lightDir: u.lightDir
    property vector4d reflectColor: u.reflectColor
    property real scratches: u.scratches
    property real dust: u.dust
    property real vignette: u.vignette
    property real brightness: u.brightness
    property real contrast: u.contrast
    property real saturation: u.saturation
    property real filmic: u.filmic
    fragmentShader: Qt.resolvedUrl("shaders/rain.frag.qsb")
    onStatusChanged: if (status === ShaderEffect.Error) console.warn("rain: rain shader failed:", log)
  }

  // Plain wallpaper fallback while the image loads or if the shader fails.
  Image {
    anchors.fill: parent
    source: view.imageSource
    fillMode: Image.PreserveAspectCrop
    asynchronous: true
    visible: !view.ready || view.staticRevision === 0 || rainFx.status === ShaderEffect.Error
    sourceSize: img.sourceSize
  }
}
