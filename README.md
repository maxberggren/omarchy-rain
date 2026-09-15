# Rain on Glass for Omarchy

Animated rain on a window pane, drawn over your current wallpaper. The
wallpaper gets a real lens blur (bokeh discs, not a Gaussian smear), a layer
of condensation settles on the glass, and drops do what drops do on a
vertical pane: most sit and grow, a few get heavy, slide down in stick-slip
jerks, meander, swallow the drops in their path and leave a wiped track
lined with pearled beads. Every drop is a tiny inverted lens showing the
scene behind it. See [docs/PHYSICS.md](docs/PHYSICS.md) for what is modelled
and why.

It is an [Omarchy](https://omarchy.org) shell plugin (Quickshell/QML plus
GLSL), so it runs inside `omarchy-shell` and follows your theme's background
automatically.

## Install

```bash
omarchy plugin add https://github.com/maxberggren/omarchy-rain.git --enable --yes
```

Or by hand:

```bash
git clone https://github.com/maxberggren/omarchy-rain.git ~/.config/omarchy/plugins/maxberggren.rain
omarchy-shell shell rescanPlugins
omarchy plugin enable maxberggren.rain
```

The compiled shaders (`shaders/*.qsb`) are committed, so nothing needs to be
built. If you edit a `.frag`, rebuild with `dev/build-shaders.sh`
(needs `qt6-shadertools`).

Remove with `omarchy plugin remove maxberggren.rain`.

## Configure

Everything lives in `~/.config/omarchy/rain.json`. The file is optional,
hot-reloaded on save, and only needs the keys you want to change:

```json
{
  "fps": 30,
  "rain": { "amount": 0.4, "speed": 1.2 },
  "fog": { "amount": 0.7 },
  "blur": { "radius": 30, "blades": 6 }
}
```

Live control over IPC (also persists to `rain.json`):

```bash
omarchy-shell rain set rain.speed 1.5      # any dotted key
omarchy-shell rain get fog                 # print a section (or everything with "")
omarchy-shell rain preset downpour         # default, drizzle, downpour, foggy, dry, night, still, cheap
omarchy-shell rain toggle                  # on/off
omarchy-shell rain pause | resume          # freeze the animation, keep the frame
omarchy-shell rain status
```

### Menu entry

`extras/omarchy-menu.jsonc` adds a Style > Rain submenu (toggle, pause,
presets, edit config). Merge its keys into
`~/.config/omarchy/extensions/omarchy-menu.jsonc`; the menu hot-reloads.

### All settings and defaults

| Key | Default | What it does |
|---|---|---|
| `enabled` | `true` | draw the rain layer at all |
| `fps` | `24` | animation rate cap; `0` freezes time |
| `coveredFps` | `10` | rate while the focused workspace has windows; set equal to `fps` to disable |
| `renderScale` | `0.75` | fraction of the screen's physical resolution; `1.0` is native, `0.5` much cheaper |
| `seed` | `0` | change to get a different pane |
| `backgroundPath` | `""` | force an image instead of following the current wallpaper |
| `screens` | `[]` | output names to draw on; empty means all |
| **rain** | | sliding drops (runners) |
| `rain.amount` | `0.9` | 0..1 share of the pane's columns that carry runners |
| `rain.spawnRate` | `1.0` | how often a column starts a new runner |
| `rain.speed` | `1.0` | fall speed multiplier |
| `rain.stickSlip` | `0.55` | 0..1 pulsed, pinning motion |
| `rain.wander` | `1.0` | lateral meander |
| `rain.trail` | `0.0` | pearling beads left on the track (0 = none) |
| `rain.trailWidth` | `1.0` | width of the wiped track |
| `rain.trailEdge` | `1.0` | meniscus glints along the track edges |
| `rain.layers` | `2` | 1..3 size classes of runners |
| `rain.size` | `1.0` | runner size |
| `rain.grow` | `0.7` | how much a runner grows with every drop it picks up |
| `rain.startAbove` | `true` | runners enter from above the top edge (`false`: they can start mid-pane) |
| `rain.turn` | `1.0` | 0..1 how much a runner head turns to follow its path |
| **drops** | | sessile (sitting) drops |
| `drops.density` | `1.1` | count multiplier |
| `drops.size` | `1.0` | size multiplier |
| `drops.spawnRate` | `2.0` | how often new drops hit the pane |
| `drops.irregularity` | `1.0` | gravity sag, outline wobble |
| `drops.merge` | `1.0` | coalescence softness between touching drops |
| `drops.layers` | `3` | 1..3 size classes |
| `drops.fps` | `10` | refresh rate of the cached sitting-drop layer |
| **fog** | | condensation |
| `fog.amount` | `0.3` | 0..1 how fogged the pane is (drops and tracks wipe it) |
| `fog.grain` | `0.9` | micro-droplet texture |
| `fog.regrow` | `2.0` | how fast a wiped track fogs up again |
| `fog.halo` | `0.6` | dry ring around drops |
| `fog.lift` | `0.1` | how milky/bright the condensation is |
| `fog.tint` | `[0.85,0.88,0.94]` | colour of the scattered light |
| `fog.tintStrength` | `0.25` | |
| **optics** | | drop shading |
| `optics.lensZoom` | `7.0` | field of view of the drop lens, scaled by drop size |
| `optics.field` | `0.06` | extra field of view (in screen heights) that even tiny drops show |
| `optics.curvature` | `0.65` | how domed the drops are |
| `optics.refraction` | `1.0` | overall refraction strength |
| `optics.sharpness` | `0.85` | 0 = drops show the blurred scene, 1 = the sharp scene |
| `optics.rimDark` | `0.7` | dark cap on the lit side of the dome |
| `optics.outline` | `0.7` | contact-line darkness |
| `optics.brighten` | `0.1` | light gathered by the lens |
| `optics.contrast` | `1.15` | contrast of the lens image inside drops |
| `optics.highlight` | `1.0` | pinpoint highlight and bright arc |
| `optics.sheen` | `1.0` | soft broad sheen |
| `optics.shadow` | `0.2` | shadow cast onto the pane |
| `optics.light` | `[-0.45,-0.7,0.75]` | light direction (x right, y down, z toward viewer) |
| `optics.reflection` | `0.3` | room/sky reflection amount |
| `optics.reflectionColor` | `[0.85,0.9,1.0]` | |
| **blur** | | lens blur of the wallpaper (computed once) |
| `blur.radius` | `26` | radius in px at 1080p |
| `blur.blades` | `0` | 0 = round aperture, 5..9 = polygonal bokeh |
| `blur.rotation` | `0.3` | aperture rotation in radians |
| `blur.highlightBoost` | `6.0` | bright points bloom into discs |
| `blur.ring` | `0.4` | bright-rimmed bokeh discs |
| `blur.threshold` | `0.55` | luminance where bloom starts |
| `blur.fogSpread` | `1.6` | condensation blur width |
| **glass** | | |
| `glass.scratches` | `0.0` | faint micro-scratches (off by default) |
| `glass.dust` | `0.3` | specks on the pane |
| `glass.vignette` | `0.35` | |
| **post** | | |
| `post.brightness` | `0.98` | |
| `post.contrast` | `1.0` | |
| `post.saturation` | `0.6` | |
| `post.filmic` | `0.8` | filmic (ACES) curve: real blacks, rolled-off highlights |

## Performance

The blur passes run once per wallpaper or config change. The sliding drops
are simulated once per frame into a tiny float table; the sitting drops are
rendered into a cached layer at `drops.fps`. Only the tracks, condensation
and compositing run every frame, at `renderScale` times the screen's
physical resolution. Measured on a Radeon 780M at 4K: about 14 W above
idle at 30 fps, roughly half that at `coveredFps` 12 while windows are open,
and nothing while paused. Use `"renderScale": 0.5`, a lower `fps`, or
`omarchy-shell rain preset cheap` on weaker GPUs. `omarchy-shell rain pause`
freezes the frame at zero cost.

## Development

```bash
dev/preview-output.sh            # hidden headless Hyprland output for previews
dev/shot.sh out "" 8,8.5         # render frames at t=8s and t=8.5s to out_t8.png ...
RAIN_DEBUG=2 dev/shot.sh out ""  # show a stage: 1 sharp, 2 blur, 3 fog, 4 glass, 5 sitting drops
dev/bench.sh cfg.json 5          # animate on the hidden output, report GPU busy and power
dev/install-local.sh             # copy into ~/.config/omarchy/plugins and enable
dev/install-local.sh --remove
dev/preview-output.sh --remove   # drop the hidden output again
```

`RainView.qml` is the reusable renderer; `RainBackground.qml` is the shell
service that hosts it on every screen. `shaders/rain.frag` is compiled twice:
as is for the per-frame pass and with `-D SESSILE` for the cached
sitting-drop pass. Service plugins are not hot-reloaded by the shell, so
`omarchy restart shell` after installing a new build; `omarchy-shell rain status`
reports the loaded `build`.
