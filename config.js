.pragma library
// Default configuration for the rain background. Every value can be
// overridden from ~/.config/omarchy/rain.json using the same nesting.

var defaults = {
  "enabled": true,
  "fps": 30,              // animation rate cap for the sliding drops
  "coveredFps": 12,       // rate while the focused workspace has windows (mostly covered)
  "renderScale": 1.0,     // fraction of the screen's physical resolution; 0.5 = cheap
  "seed": 0,
  "backgroundPath": "",   // empty = follow omarchy's current background
  "screens": [],          // empty = all screens; else list of output names

  "rain": {
    "amount": 0.45,       // 0..1 share of columns carrying sliding drops
    "spawnRate": 1.0,     // how often a new runner starts (multiplier)
    "speed": 1.0,         // fall speed (multiplier)
    "stickSlip": 0.55,    // 0..1 pulsed, pinning motion
    "wander": 1.0,        // lateral meander (multiplier)
    "trail": 0.12,        // pearling droplet density on the track
    "trailWidth": 1.0,    // width of the cleared track
    "trailEdge": 1.0,     // meniscus highlight along the track edges
    "layers": 2,          // 1..3 size classes of runners
    "size": 1.0,          // runner size (multiplier)
    "grow": 0.7,          // how much a runner grows with every drop it picks up
    "startAbove": true,   // runners enter from above the top edge (false: they can start mid-pane)
    "turn": 0.35          // 0..1 how much a runner head turns to follow its path
  },

  "drops": {
    "density": 1.4,       // sessile drop count (multiplier)
    "size": 1.0,          // sessile drop size (multiplier)
    "spawnRate": 2.0,     // how often new drops hit the pane
    "irregularity": 1.0,  // gravity sag and outline wobble
    "merge": 1.0,         // coalescence softness between touching drops
    "layers": 3,          // 1..3 size classes
    "fps": 8              // refresh rate of the cached sitting-drop layer
  },

  "fog": {
    "amount": 0.45,       // 0..1 condensation on the glass
    "grain": 0.45,        // micro-droplet texture of the condensation
    "regrow": 2.0,        // how fast a wiped track fogs up again
    "halo": 0.6,          // dry ring around drops
    "lift": 0.6,          // how milky/bright the condensation is
    "tint": [0.85, 0.88, 0.94],
    "tintStrength": 0.25
  },

  "optics": {
    "lensZoom": 7.0,      // field of view of the drop lens, scaled by drop size
    "field": 0.06,        // extra field of view (screen heights) that even tiny drops show
    "curvature": 0.65,    // how domed the drops are (flat caps on glass)
    "refraction": 1.0,    // overall refraction strength
    "sharpness": 0.5,     // 0 = drops show the blurred scene, 1 = sharp scene
    "rimDark": 0.35,      // dark cap on the lit side of the dome
    "outline": 0.45,      // contact-line darkness
    "brighten": 0.12,     // light gathered by the drop lens
    "contrast": 1.0,      // contrast of the lens image inside drops
    "highlight": 0.8,     // hard specular and bright arc
    "sheen": 1.0,         // soft broad sheen
    "shadow": 0.2,        // shadow cast onto the pane
    "light": [-0.45, -0.7, 0.75],
    "reflection": 0.25,   // sky/room reflection amount
    "reflectionColor": [0.85, 0.9, 1.0]
  },

  "blur": {
    "radius": 26,         // lens blur radius in px (1080p logical)
    "blades": 0,          // 0 = round aperture, 5..9 = polygon bokeh
    "rotation": 0.3,      // aperture rotation, radians
    "highlightBoost": 4.0,// bright points bloom into discs
    "ring": 0.6,          // bright-rimmed bokeh discs
    "threshold": 0.35,    // luminance where bloom starts
    "fogSpread": 1.6      // condensation blur width
  },

  "glass": {
    "scratches": 0.0,     // faint micro-scratches (off: they read as lines on top of everything)
    "dust": 0.3,
    "vignette": 0.25
  },

  "post": {
    "brightness": 1.0,
    "contrast": 1.0,
    "saturation": 0.8,
    "filmic": 0.35        // gentle S-curve so blacks and highlights breathe
  }
};

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function merge(base, over) {
  var out = {};
  for (var k in base) out[k] = isObject(base[k]) ? merge(base[k], {}) : base[k];
  if (!isObject(over)) return out;
  for (var j in over) {
    if (isObject(over[j]) && isObject(out[j])) out[j] = merge(out[j], over[j]);
    else out[j] = over[j];
  }
  return out;
}

function withDefaults(user) { return merge(defaults, user || {}); }

// Set a dotted key ("rain.speed") on a config object, coercing the value.
function setPath(cfg, path, value) {
  var parts = String(path).split(".");
  var node = cfg;
  for (var i = 0; i < parts.length - 1; i++) {
    if (!isObject(node[parts[i]])) node[parts[i]] = {};
    node = node[parts[i]];
  }
  var last = parts[parts.length - 1];
  var v = value;
  if (typeof v === "string") {
    var s = v.trim();
    if (s === "true") v = true;
    else if (s === "false") v = false;
    else if (s.length && !isNaN(Number(s))) v = Number(s);
    else if (s[0] === "[" || s[0] === "{" || s[0] === "\"") { try { v = JSON.parse(s); } catch (e) {} }
    // bare comma-separated list for list-valued keys, e.g. `set screens DP-1,DP-2`
    if (typeof v === "string" && (last === "screens" || last === "tint" || last === "light" || last === "reflectionColor") && v.indexOf(",") !== -1) {
      v = v.split(",").map(function(x) { var t = x.trim(); return isNaN(Number(t)) ? t : Number(t); });
    }
  }
  node[last] = v;
  return cfg;
}

function getPath(cfg, path) {
  var parts = String(path).split(".");
  var node = cfg;
  for (var i = 0; i < parts.length; i++) {
    if (!isObject(node) || !(parts[i] in node)) return undefined;
    node = node[parts[i]];
  }
  return node;
}

// Named presets, applied on top of defaults.
var presets = {
  "default": {},
  "drizzle": { "rain": { "amount": 0.25, "spawnRate": 0.5 }, "drops": { "density": 0.7 }, "fog": { "amount": 0.35 } },
  "downpour": { "rain": { "amount": 0.95, "spawnRate": 2.2, "speed": 1.4, "layers": 3 }, "drops": { "density": 1.3, "spawnRate": 2.5 }, "fog": { "amount": 0.5 } },
  "foggy": { "rain": { "amount": 0.35 }, "fog": { "amount": 0.9, "grain": 0.9, "regrow": 0.25 } },
  "dry": { "rain": { "amount": 0.0 }, "drops": { "density": 0.8, "spawnRate": 0.2 }, "fog": { "amount": 0.2 } },
  "night": { "blur": { "highlightBoost": 3.0, "ring": 0.8, "blades": 7 }, "fog": { "amount": 0.5, "tint": [0.7, 0.8, 1.0] }, "post": { "brightness": 0.9 } },
  "still": { "fps": 0, "rain": { "amount": 0.0 }, "drops": { "spawnRate": 0.0 } },
  "cheap": { "fps": 30, "renderScale": 0.5, "rain": { "layers": 1 }, "drops": { "layers": 2 }, "fog": { "grain": 0.0 }, "glass": { "scratches": 0.0, "dust": 0.0 } }
};
