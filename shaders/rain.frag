#version 440
// Rain on glass. See docs/PHYSICS.md for what every term is modelling.
//
// Coordinates: p is in render pixels, y grows downward. All sizes are scaled
// by pxScale so the look is resolution-independent (1.0 == 1080p logical).
// Time is wrapped to PERIOD by the host; every cycle length here divides
// PERIOD so the wrap is seamless.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    vec2 resolution;
    float pxScale;
    float seed;

    // runners (sliding drops)
    float rainAmount;      // 0..1 fraction of columns that carry runners
    float rainSpawn;       // how often a column starts a new runner
    float rainSpeed;       // fall speed multiplier
    float rainStickSlip;   // 0..1 pulsed motion
    float rainWander;      // lateral meander amount
    float rainTrail;       // pearling droplet density along the track
    float rainTrailWidth;  // cleared-track width multiplier
    float rainLayers;      // 1..3 size classes of runners
    float rainSize;        // runner size multiplier
    float rainGrow;        // how much a runner grows as it sweeps
    float rainStartAbove;  // 1 = runners enter from above the top edge
    float rainTurn;        // 0..1 how much a runner head turns into its path

    // sessile (static) drops
    float dropDensity;
    float dropSize;
    float dropSpawn;
    float dropIrregular;
    float dropMerge;
    float dropLayers;      // 1..3

    // condensation
    float fogAmount;
    float fogGrain;
    float fogRegrow;
    float fogHalo;
    float fogLift;         // how much the condensation lifts toward ambient light
    vec4  fogTint;         // rgb, strength

    // optics
    float lensZoom;
    float lensField;       // extra field of view in screen heights, independent of drop size
    float curvature;
    float refraction;
    float dropSharp;
    float rimDark;
    float outline;
    float highlight;
    float sheen;
    float shadow;
    float brighten;        // light gathered by the drop lens
    float dropContrast;    // contrast of the lens image relative to the pane
    float trailEdge;       // meniscus highlight along a wet track
    vec4  lightDir;        // xyz, reflection strength
    vec4  reflectColor;    // rgb, fresnel amount

    // glass and post
    float scratches;
    float dust;
    float vignette;
    float brightness;
    float contrast;
    float saturation;
    float filmic;
};
layout(binding = 1) uniform sampler2D sharpTex;
layout(binding = 2) uniform sampler2D blurTex;
layout(binding = 3) uniform sampler2D fogTex;
layout(binding = 4) uniform sampler2D glassTex;
#ifndef RUNNER_TABLE
layout(binding = 5) uniform sampler2D runTex;
#endif
#if !defined(SESSILE) && !defined(RUNNER_TABLE)
layout(binding = 6) uniform sampler2D sessTex;
#endif
#define RT_COLS 64.0
#define RT_ROWS 132.0
#define RT_SLOT 22.0
#define RT_NS 32.0

#define PERIOD 600.0
#define PI 3.14159265

// ---------------------------------------------------------------- hashing
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3  hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec4  hash42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.6 + vnoise(p * 2.13 + 7.7) * 0.28 + vnoise(p * 4.7 + 3.1) * 0.12; }

// ------------------------------------------------------- drop accumulator
// Height field h (0..1), outward surface slope n, lens offset, plus the
// nearest-drop data used for shadows and halos. Touching drops merge with a
// smooth max on height and a smooth min on edge distance so coalesced drops
// read as one convex blob (a peanut) instead of two circles.
struct Acc {
    float h;      // cap height
    vec2  n;      // outward slope at this pixel
    vec2  lens;   // lens sample offset in px
    float edge;   // px distance to the nearest drop edge (negative inside)
    float qmin;   // normalised distance^2 to the nearest drop
    vec2  toC;    // outward direction from the nearest drop centre
    float rNear;  // nominal radius of the nearest drop (px)
    float spark;  // per-drop highlight intensity
    float wet;    // drop coverage (fog is gone under a drop)
    float fade;   // coverage multiplier (a runner's tail thins into its track)
};

void accInit(inout Acc a) {
    a.h = 0.0; a.n = vec2(0.0); a.lens = vec2(0.0); a.edge = 1e5; a.qmin = 1e5;
    a.toC = vec2(0.0, 1.0); a.rNear = 1.0; a.spark = 1.0; a.wet = 0.0; a.fade = 1.0;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// d: offset from the drop centre (px); rx/ryUp/ryDown: semi-axes; wobble:
// outline modulation (fraction of r); ph: wobble phase; r: nominal radius;
// k: merge softness (fraction of r); lensK: lens field of view; dome: how
// domed the cap is; spark: highlight intensity for this drop.
void addDrop(inout Acc a, vec2 d, float rx, float ryUp, float ryDown, float wobble, float ph, float r, float k, float lensK, float dome, float spark, float fade) {
    float ry = d.y < 0.0 ? ryUp : ryDown;
    vec2 uvn = vec2(d.x / rx, d.y / ry);
    float q = dot(uvn, uvn);
    if (q > 4.0) return;
    if (wobble > 0.0 && q > 0.2 && r > 3.0 * pxScale) {
        float th = atan(d.y, d.x);
        float m = 1.0 + wobble * (0.6 * sin(2.0 * th + ph) + 0.4 * sin(3.0 * th + 2.1 * ph));
        uvn /= m;
        q = dot(uvn, uvn);
    }
    float qs = sqrt(q);
    float edgePx = (qs - 1.0) * r;
    float kpx = max(k * r, 0.5);
    float wasEdge = a.edge;
    a.edge = smin(a.edge, edgePx, kpx);
    if (edgePx < wasEdge) { a.qmin = q; a.toC = uvn / max(qs, 1e-4); a.rNear = r; a.spark = spark; }
    if (q >= 1.0) return;
    float h = sqrt(1.0 - q);
    float t = clamp(0.5 + 0.5 * (h - a.h) / k, 0.0, 1.0);
    if (a.h > 0.0) {
        // both drops cover this pixel: blend the per-drop data so the merged
        // drop has one continuous cap, arc and highlight
        a.qmin = mix(a.qmin, q, t);
        a.toC = normalize(mix(a.toC, uvn / max(qs, 1e-4), t) + vec2(1e-5));
        a.rNear = mix(a.rNear, r, t);
        a.spark = mix(a.spark, spark, t);
    }
    a.h = mix(a.h, h, t) + k * t * (1.0 - t);
    vec2 n = uvn * curvature * dome;
    // fisheye-ish mapping: the field of view grows toward the rim
    vec2 lens = -uvn * curvature * dome * (lensK * r + lensField * resolution.y) * (1.0 + 0.5 * q);
    a.n = mix(a.n, n, t);
    a.lens = mix(a.lens, lens, t);
    a.fade = mix(a.fade, fade, t);
    a.wet = max(a.wet, smoothstep(1.0, 0.75, q) * fade);
}

// Merge accumulator b into a (same smooth union as addDrop).
void accMerge(inout Acc a, Acc b, float k) {
    if (b.edge < 9e4) {
        float kpx = max(k * min(a.rNear, b.rNear), 0.5);
        float wasEdge = a.edge;
        a.edge = smin(a.edge, b.edge, kpx);
        if (b.edge < wasEdge) { a.qmin = b.qmin; a.toC = b.toC; a.rNear = b.rNear; a.spark = b.spark; }
    }
    if (b.h > 0.0) {
        float t = clamp(0.5 + 0.5 * (b.h - a.h) / k, 0.0, 1.0);
        a.h = mix(a.h, b.h, t) + k * t * (1.0 - t);
        a.n = mix(a.n, b.n, t);
        a.lens = mix(a.lens, b.lens, t);
        a.fade = mix(a.fade, b.fade, t);
        a.wet = max(a.wet, b.wet);
    }
}

// ------------------------------------------------------------- runners
// Geometry of the sitting drop that cell `cc` of layer `fl` may hold:
// xy = centre (px), z = radius (px) including its life cycle, w = existence.
vec4 sessileAt(vec2 cc, float fl, float cs, float rMin, float rMax, float densHere) {
    vec4 hs = hash42(cc * 1.37 + vec2(fl * 41.0 + seed, fl * 17.0 - seed));
    if (hs.x > densHere) return vec4(0.0);
    float exist = smoothstep(0.0, 0.08, densHere - hs.x);
    vec2 centre = (cc + 0.5 + (hs.yz - 0.5) * 0.9) * cs;
    float ncyc = max(floor(mix(0.6, 1.8, hs.w) * clamp(dropSpawn, 0.02, 10.0)), 1.0);
    float T = PERIOD / ncyc;
    float tl = mod(time + hs.x * T * 5.0, T);
    float k = floor((time + hs.x * T * 5.0) / T);
    vec3 hk = hash32(cc * 0.71 + vec2(k * 0.13 + fl, seed));
    float a1 = 1.55;
    float ratio = pow(rMin / rMax, a1);
    float r = rMin * pow(1.0 - hk.x * (1.0 - ratio), -1.0 / a1) * dropSize;
    float pop = 1.0;
    if (tl < 0.5) {
        float tt = tl / 0.5;
        pop = tt < 0.2 ? smoothstep(0.0, 0.2, tt) * 1.15 : (1.0 + 0.15 * exp(-(tt - 0.2) * 6.0) * cos((tt - 0.2) * 34.0));
    }
    float grow = 0.85 + 0.15 * clamp(tl / (0.5 * T), 0.0, 1.0);
    // drops do not vanish in the rain; only a very slow shrink at the end of
    // a long life, so the pane slowly renews itself
    float ev = clamp((tl - 0.6 * T) / (0.4 * T), 0.0, 1.0);
    float evap = 1.0 - ev * ev;
    return vec4(centre, r * pop * grow * evap * exist, exist);
}

// Cheaper variant for neighbour checks: static position and base radius only.
vec4 sessileBase(vec2 cc, float fl, float cs, float rMin, float rMax, float densHere) {
    vec4 hs = hash42(cc * 1.37 + vec2(fl * 41.0 + seed, fl * 17.0 - seed));
    if (hs.x > densHere) return vec4(0.0);
    vec2 centre = (cc + 0.5 + (hs.yz - 0.5) * 0.9) * cs;
    float ncyc = max(floor(mix(0.6, 1.8, hs.w) * clamp(dropSpawn, 0.02, 10.0)), 1.0);
    float T = PERIOD / ncyc;
    float k = floor((time + hs.x * T * 5.0) / T);
    vec3 hk = hash32(cc * 0.71 + vec2(k * 0.13 + fl, seed));
    float a1 = 1.55;
    float ratio = pow(rMin / rMax, a1);
    float r = rMin * pow(1.0 - hk.x * (1.0 - ratio), -1.0 / a1) * dropSize;
    return vec4(centre, r, 1.0);
}

float layerCell(int l) { return (l == 0 ? 74.0 : (l == 1 ? 38.0 : 19.0)) * pxScale * dropSize; }
float layerDens(int l) { return dropDensity * (l == 0 ? 0.5 : (l == 1 ? 0.62 : 0.9)); }
float layerCluster(int l, vec2 p, float cs) {
    return 0.3 + 1.4 * vnoise(p / (cs * (l == 0 ? 4.8 : (l == 1 ? 9.0 : 18.0))) + vec2(seed * 3.0, 9.0));
}
struct Runner { float alive; vec2 head; float y0; float r; float v; float col; float xc; float tw; float born; float widthVar; float dying; float layer; float colW; vec4 shape; float lean; float spark; vec2 stopCell; float merged; float stopVol; };

float pathX(float y, float col, float layer, float colW, float amp) {
    // lateral meander as a function of height, so trail == path exactly
    float s = y / (300.0 * pxScale);
    float n = (vnoise(vec2(s, col * 13.7 + layer * 5.3 + seed)) - 0.5) * 2.0;
    float n2 = (vnoise(vec2(s * 4.0 + 9.0, col * 7.1 + layer * 2.9 + seed)) - 0.5) * 2.0;
    // small deflections where the runner hit a drop, eased so the head turns smoothly
    float ky = y / (95.0 * pxScale);
    float k0 = hash11(floor(ky) + col * 3.1 + layer) - 0.5;
    float k1 = hash11(floor(ky) + 1.0 + col * 3.1 + layer) - 0.5;
    float kink = mix(k0, k1, smoothstep(0.7, 1.0, fract(ky))) * 2.0;
    return rainWander * amp * colW * (0.17 * n + 0.05 * n2 + 0.03 * kink);
}

Runner runnerFor(float col, float layer, float colW, float rBase, float cycleK, float T) {
    Runner rn;
    rn.alive = 0.0; rn.head = vec2(0.0); rn.y0 = 0.0; rn.r = rBase; rn.v = 1.0; rn.col = col; rn.xc = 0.0; rn.tw = 1.0; rn.born = 0.0; rn.widthVar = 1.0; rn.dying = 0.0; rn.layer = layer; rn.colW = colW;
    rn.shape = vec4(1.0); rn.lean = 0.0; rn.spark = 1.0; rn.stopCell = vec2(-1e5); rn.merged = 0.0; rn.stopVol = 0.0;
    vec4 hc = hash42(vec2(col * 1.7 + layer * 31.0 + seed, cycleK * 0.37 + layer));
    vec4 hv = hash42(vec2(col * 2.9 + layer * 13.0 - seed, cycleK * 0.53 + 7.0));
    // every runner is its own drop: outline wobble, width/height aspect,
    // dome height, tail length, lean and highlight strength
    rn.shape = vec4(0.02 + 0.05 * hv.x, mix(0.88, 1.12, hv.y), mix(0.75, 1.0, hv.z), mix(2.0, 3.4, hv.w));
    rn.lean = (hash11(col * 5.3 + cycleK * 1.7 + layer) - 0.5) * 0.35;
    rn.spark = 0.4 + 0.8 * hv.x;
    float t0 = cycleK * T + hc.x * T * 0.5;
    float tau = time - t0;
    if (tau < -PERIOD * 0.5) tau += PERIOD;
    if (tau < 0.0) return rn;
    float H = resolution.y;
    float y0 = mix(mix(-0.08, 0.55, hc.y * hc.y), mix(-0.3, -0.06, hc.y), rainStartAbove) * H;
    // wide spread of speeds, skewed toward slow, and no sprinters
    float v = rainSpeed * mix(22.0, 105.0, hc.z * hc.z) * pxScale;
    // must reach the bottom well inside its cycle so the track can fade out
    v = max(v, (H * 1.15 - y0) / (0.9 * T));
    float accel = 0.018;
    float omega = 2.0 * PI / mix(0.8, 1.9, hc.w);
    float stick = rainStickSlip * 0.95;
    float y = y0 + v * (tau + accel * tau * tau) - stick * v / omega * (sin(omega * tau + hc.x * 6.28) - sin(hc.x * 6.28));
    rn.alive = 1.0;
    float rNow = rBase * mix(0.75, 1.15, hc.w);
    float xcBase = (col + 0.5) * colW + (hc.y - 0.5) * colW * 0.5;
    float wvar = mix(0.6, 1.5, hc.w);
    // a runner that hits a bigger sitting drop merges into it and stops there:
    // scan the big-drop layer along the path for the first such drop
    float cs0 = layerCell(0);
    float dens0 = layerDens(0);
    float yStop = 1e9;
    vec2 stopCell = vec2(-1e5);
    float stopR = 0.0;
    float j0 = floor((y0 + rNow) / cs0);
    for (int i = 0; i < 24; i++) {
        float fj = j0 + float(i);
        if (fj * cs0 > y + rNow) break;
        float yc = (fj + 0.5) * cs0;
        for (int c2 = 0; c2 < 2; c2++) {
            float cx = floor((xcBase + (c2 == 0 ? -0.3 : 0.3) * colW) / cs0);
            if (c2 == 1 && cx == floor((xcBase - 0.3 * colW) / cs0)) continue;
            vec2 cc = vec2(cx, fj);
            vec2 cen = (cc + 0.5) * cs0;
            float dh = dens0 * layerCluster(0, cen, cs0);
            vec4 nb = sessileBase(cc, 0.0, cs0, 1.9 * pxScale, cs0 * 0.36, dh);
            if (nb.w <= 0.0 || nb.z < rNow * 1.15) continue;
            float px = xcBase + pathX(nb.y, col, layer, colW, wvar);
            if (abs(px - nb.x) > nb.z + rNow * 0.7) continue;
            float ys = nb.y - nb.z * 0.5;
            if (ys > y0 + rNow && ys < yStop) { yStop = ys; stopCell = cc; stopR = nb.z; }
        }
    }
    if (y > yStop) {
        // arrived: the head keeps sliding into the body of the sitting drop
        // while it melts into it, and the drop grows visibly
        float over = (y - yStop) / max(v, 1.0);
        rn.merged = smoothstep(0.0, 1.2, over);
        rn.stopCell = stopCell;
        y = yStop + min(y - yStop, stopR * 0.9);
    }
    rn.y0 = y0;
    rn.widthVar = wvar;
    // pickups: every so often the head swallows a sitting drop and jumps in size
    float seg = 75.0 * pxScale;
    float nseg = (y - y0) / seg;
    float picked = 0.0;
    for (int i = 0; i < 16; i++) {
        float fi = float(i);
        if (fi > nseg) break;
        float hp = hash11(fi * 3.7 + col * 11.3 + cycleK * 0.61 + layer * 5.0 + seed);
        if (hp < 0.45) picked += smoothstep(fi, fi + 0.25, nseg) * (0.5 + hp);
    }
    rn.r = rNow * pow(1.0 + rainGrow * 0.6 * picked, 0.4);
    rn.stopVol = rn.r * rn.r * rn.r * rn.merged * 5.0;
    rn.v = v * (1.0 + 2.0 * accel * tau);
    rn.xc = xcBase;
    rn.head = vec2(rn.xc + pathX(y, col, layer, colW, rn.widthVar), y);
    rn.tw = rn.r * 0.8 * rainTrailWidth * mix(0.8, 1.2, hc.w);
    rn.born = t0;
    // after the head is long gone the track re-fogs and the beads evaporate,
    // so nothing pops when the cycle is dropped from evaluation
    rn.dying = smoothstep(T * 0.9, T * 1.8, tau);
    return rn;
}

#ifndef RUNNER_TABLE
// Read a runner from the per-frame state table: 6 texels per (layer, cycle) slot.
vec4 rtFetch(float col, float slot, float g) {
    return texture(runTex, vec2((col + 0.5) / RT_COLS, (slot * RT_SLOT + g + 0.5) / RT_ROWS));
}
// Sampled curves along y (32 samples over -0.35H .. 1.15H), packed 4 per texel.
float rtCurve(float col, float slot, float firstRow, float y) {
    float fi = clamp((y / resolution.y + 0.35) / 1.5, 0.0, 1.0) * (RT_NS - 1.0);
    float i0 = floor(fi);
    float fr = fi - i0;
    float i1 = min(i0 + 1.0, RT_NS - 1.0);
    vec4 a = rtFetch(col, slot, firstRow + floor(i0 / 4.0));
    vec4 b = rtFetch(col, slot, firstRow + floor(i1 / 4.0));
    float k0 = mod(i0, 4.0), k1 = mod(i1, 4.0);
    float va = k0 < 0.5 ? a.x : (k0 < 1.5 ? a.y : (k0 < 2.5 ? a.z : a.w));
    float vb = k1 < 0.5 ? b.x : (k1 < 1.5 ? b.y : (k1 < 2.5 ? b.z : b.w));
    return mix(va, vb, fr);
}
float rtPath(float col, float slot, float y) { return rtCurve(col, slot, 6.0, y); }
float rtWidth(float col, float slot, float y) { return rtCurve(col, slot, 14.0, y); }
// Cheap first look: alive, head y, radius, column centre. Only runners that
// can reach this pixel are fetched in full.
vec4 runnerPeek(float col, float layer, float cycle) {
    return rtFetch(col, layer * 2.0 + cycle, 0.0);
}
Runner runnerFetch(float col, float layer, float cycle, float colW, vec4 t0) {
    Runner rn;
    float slot = layer * 2.0 + cycle;
    rn.alive = t0.x; rn.head.y = t0.y; rn.r = t0.z; rn.xc = t0.w;
    vec4 t1 = rtFetch(col, slot, 1.0);
    rn.y0 = t1.x; rn.v = t1.y; rn.head.x = t1.z; rn.tw = t1.w;
    vec4 t2 = rtFetch(col, slot, 2.0);
    rn.widthVar = t2.x; rn.dying = t2.y; rn.born = t2.z; rn.merged = t2.w;
    rn.shape = rtFetch(col, slot, 3.0);
    vec4 t4 = rtFetch(col, slot, 4.0);
    rn.lean = t4.x; rn.spark = t4.y; rn.stopCell = t4.zw;
    vec4 t5 = rtFetch(col, slot, 5.0);
    rn.stopVol = t5.x;
    rn.col = col; rn.layer = layer; rn.colW = colW;
    return rn;
}
#endif

// -------------------------------------------------------------- shading
vec2 mirrorUv(vec2 uv) {
    vec2 m = mod(uv, 2.0);
    return 1.0 - abs(m - 1.0);
}

vec3 sampleBg(vec2 uv, float sharpMix) {
    vec3 b = texture(blurTex, uv).rgb;
    if (sharpMix <= 0.001) return b;
    // "sharp" means 1080p-level detail whatever the render resolution
    float lod = max(0.0, log2(pxScale));
    vec3 s = textureLod(sharpTex, uv, lod).rgb;
    return mix(b, s, sharpMix);
}

vec3 fogColor(vec2 uv) {
    vec3 f = texture(fogTex, uv).rgb;
    float l = dot(f, vec3(0.2126, 0.7152, 0.0722));
    // scattering: desaturated, low contrast, lifted toward ambient light
    f = mix(f, vec3(l), 0.3);
    vec3 ambient = mix(vec3(0.72), fogTint.rgb * 0.8, fogTint.a);
    f = mix(f * 0.9 + 0.05, ambient, fogLift * 0.55);
    return f;
}


// Shade a drop field. `pane` is the colour of the glass under it (used for
// the fringe). Returns premultiplied colour in rgb and coverage in a.
vec4 shadeDrop(Acc acc, vec2 uv, vec3 pane, vec3 L, vec2 lxy, float runner) {
    float ps = pxScale;
    if (acc.h <= 0.001) return vec4(0.0);
    vec3 n = normalize(vec3(acc.n, 1.0));
    vec2 outward = normalize(acc.n + vec2(1e-5));
    float steep = 1.0 - n.z;
    float litSide = 0.5 + 0.5 * dot(outward, lxy);
    float sizeK = smoothstep(2.5 * ps, 14.0 * ps, acc.rNear);
    float rad = sqrt(clamp(acc.qmin, 0.0, 1.0));   // 0 centre .. 1 contact line
    float f = acc.fade;                              // 1 = full drop, 0 = flat wet film

    // the lens image: inverted, wide field, sharper and punchier than the
    // pane (a plano-convex lens gathers light from a wide field). Small
    // drops cannot resolve an image, so they carry more of the blurred scene.
    vec2 lensOff = acc.lens * refraction;
    vec2 dropUv = mirrorUv(uv + lensOff / resolution);
    vec3 inside = sampleBg(dropUv, dropSharp * mix(0.3, 1.0, sizeK) * f);
    inside = (inside - 0.5) * mix(1.0, dropContrast, f) + 0.5;
    inside *= 1.0 + (brighten + 0.2 * runner) * f;
    // Fresnel loss and the wide field of view make a real drop a little
    // darker than the pane, more so toward the rim
    inside *= mix(1.0, 0.85 * (1.0 - 0.3 * smoothstep(0.55, 1.0, rad)), f);
    float inLum = dot(inside, vec3(0.2126, 0.7152, 0.0722));
    inside = mix(vec3(inLum), inside, 0.7);

    // dark cap: a crescent over the top ~30% of the radius on the lit side,
    // where grazing refraction and TIR remove the transmitted light
    float capMask = smoothstep(0.5, 0.98, rad) * pow(litSide, 1.3);
    float rim = 1.0 - rimDark * (1.0 - 0.5 * runner) * mix(0.5, 1.0, sizeK) * capMask * f;
    // bright arc: a whitish crescent along the far rim
    float arcDir = max(dot(outward, -lxy), 0.0);
    float arc = pow(arcDir, 2.0) * smoothstep(0.62, 0.97, rad) * (1.0 - smoothstep(0.985, 1.0, rad)) * highlight * 0.7 * f;
    // neutral contact line, world-space width
    float olw = max(1.2 * ps, 0.035 * acc.rNear);
    float ol = 1.0 - outline * mix(0.3, 1.0, sizeK) * smoothstep(olw, 0.0, abs(acc.edge)) * 0.5 * f;
    // reflections of the room on the lit side of the dome
    float fres = 0.02 + 0.98 * pow(steep, 5.0);
    vec3 reflScene = texture(blurTex, mirrorUv(uv + outward * 0.15 * steep)).rgb;
    vec3 refl = mix(reflectColor.rgb, reflScene * 1.5, 0.5) * fres * reflectColor.a * (0.25 + 0.75 * litSide) * f;
    // small round highlight near the top of every bead, jittered per drop
    float ang = (acc.spark - 0.9) * 0.6;
    vec3 Lj = normalize(vec3(L.x * cos(ang) - L.y * sin(ang), L.x * sin(ang) + L.y * cos(ang), L.z));
    vec3 hv = normalize(Lj + vec3(0.0, 0.0, 1.0));
    float hl = max(dot(n, hv), 0.0);
    float specPow = mix(90.0, 260.0, sizeK);
    float specMask = smoothstep(2.5 * ps, 9.0 * ps, acc.rNear) * smoothstep(0.62, 0.9, acc.spark) * f;
    float spec = pow(hl, specPow) * highlight * 1.1 * specMask;

    vec3 lightCol = vec3(0.95, 0.96, 1.0);
    vec3 dcol = inside * rim * ol + refl + spec * lightCol + arc * (inside * 0.9 + lightCol * 0.45);
    // anti-aliased coverage; a fading tail also gets a soft, blurred edge
    float aa = mix(6.0 * ps, 1.8 * ps, f);
    float cov = smoothstep(aa, -aa, acc.edge) * mix(0.0, 1.0, f);
    // bright Fresnel fringe just outside the contact line on the far side
    float fringe = (1.0 - smoothstep(0.0, 1.4 * ps, acc.edge)) * smoothstep(0.0, 1.0, acc.edge / max(0.4 * ps, 1e-3)) * arcDir * highlight * 0.35 * sizeK * f;
    return vec4(dcol * cov + fringe * (pane * 0.8 + 0.15), cov);
}



#ifdef RUNNER_TABLE
// ==================================================== runner table pass
// One texel column per runner column, 6 rows per (layer, cycle) slot.
void main() {
    float col = floor(qt_TexCoord0.x * RT_COLS);
    float row = floor(qt_TexCoord0.y * RT_ROWS);
    float slot = floor(row / RT_SLOT);
    float g = row - slot * RT_SLOT;
    int l = int(floor(slot / 2.0));
    float c = slot - float(l) * 2.0;
    float fl = float(l);
    float ps = pxScale;
    int layers = int(clamp(rainLayers, 1.0, 3.0));
    fragColor = vec4(0.0);
    if (l >= layers) return;
    float layerScale = (l == 0) ? 1.0 : (l == 1 ? 0.62 : 0.4);
    float colW = 150.0 * ps * layerScale * rainSize;
    float rBase = 7.5 * ps * layerScale * rainSize;
    float hcol = hash12(vec2(col * 3.3 + fl * 17.0, seed + fl));
    float thin = (l == 0) ? 1.0 : (l == 1 ? 0.7 : 0.5);
    if (hcol > rainAmount * thin) return;
    float ncyc = max(floor(mix(6.0, 20.0, hash11(col * 7.7 + fl * 3.1 + seed)) * clamp(rainSpawn, 0.05, 8.0)), 1.0);
    float T = PERIOD / ncyc;
    float k = floor(time / T);
    float kk = k - c;
    if (kk < 0.0) kk += ncyc;
    Runner rn = runnerFor(col, fl, colW, rBase, kk, T);
    if (rn.alive < 0.5) return;
    if (g < 0.5) fragColor = vec4(rn.alive, rn.head.y, rn.r, rn.xc);
    else if (g < 1.5) fragColor = vec4(rn.y0, rn.v, rn.head.x, rn.tw);
    else if (g < 2.5) fragColor = vec4(rn.widthVar, rn.dying, rn.born, rn.merged);
    else if (g < 3.5) fragColor = rn.shape;
    else if (g < 4.5) fragColor = vec4(rn.lean, rn.spark, rn.stopCell);
    else if (g < 5.5) fragColor = vec4(rn.stopVol, fl, colW, 0.0);
    else if (g < 13.5) {
        // path x offset at 4 consecutive sample heights
        float si = (g - 6.0) * 4.0;
        vec4 o;
        for (int k = 0; k < 4; k++) {
            float ys = (mix(-0.35, 1.15, (si + float(k)) / (RT_NS - 1.0))) * resolution.y;
            float v = rn.xc + pathX(ys, col, fl, colW, rn.widthVar);
            if (k == 0) o.x = v; else if (k == 1) o.y = v; else if (k == 2) o.z = v; else o.w = v;
        }
        fragColor = o;
    } else {
        // track width modulation at 4 consecutive sample heights
        float si = (g - 14.0) * 4.0;
        vec4 o;
        for (int k = 0; k < 4; k++) {
            float ys = (mix(-0.35, 1.15, (si + float(k)) / (RT_NS - 1.0))) * resolution.y;
            float v = vnoise(vec2(ys / (70.0 * ps), col * 3.0 + fl));
            if (k == 0) o.x = v; else if (k == 1) o.y = v; else if (k == 2) o.z = v; else o.w = v;
        }
        fragColor = o;
    }
}
#else
void main() {
    vec2 uv = qt_TexCoord0;
    vec2 p = uv * resolution;
    float ps = pxScale;
    vec3 L = normalize(lightDir.xyz);
    vec2 lxy = normalize(L.xy + vec2(1e-4));

    // static glass texture: grain bump field, condensation density, scratches/dust/pings
    vec4 g = texture(glassTex, uv);
    float patches = g.b * 2.0;

    Acc runAcc; accInit(runAcc);
    float trailClear = 0.0;   // 0..1 condensation wiped by a runner track
    float trailMen = 0.0;     // meniscus glints along track edges
    float sweep = 0.0;        // 0..1 sessile drops here were swallowed by a runner
    float sweepX = -1e5;      // path x, head radius and head y of the strongest sweep here
    float sweepW = 1.0;
    float sweepHeadY = -1e5;
    float sweepV = 1.0;
    float runUnder = 0.0;     // a merging head is drawn beneath the sitting drop it joins
    vec2 growCell = vec2(-1e5);   // big-drop cell that a runner merged into near this pixel
    float growVol = 0.0;

    int layers = int(clamp(rainLayers, 1.0, 3.0));

    // --------------------------------------------------------- runners
    for (int l = 0; l < 3; l++) {
        if (l >= layers) break;
        float fl = float(l);
        float layerScale = (l == 0) ? 1.0 : (l == 1 ? 0.62 : 0.4);
        float colW = 150.0 * ps * layerScale * rainSize;
        float rBase = 7.5 * ps * layerScale * rainSize;
        float colIdx = floor(p.x / colW);
        for (int j = -1; j <= 1; j++) {
            float col = colIdx + float(j);
            if (col < 0.0 || col >= RT_COLS) continue;
            for (int c = 0; c < 2; c++) {
                vec4 t0 = runnerPeek(col, fl, float(c));
                if (t0.x < 0.5) continue;
                // a runner never strays further than this from its column centre
                if (abs(p.x - t0.w) > colW * 0.75 + t0.z * 4.0 + 80.0 * ps) continue;
                Runner rn = runnerFetch(col, fl, float(c), colW, t0);
                if (rn.dying > 0.999) continue;
                float slotId = fl * 2.0 + float(c);
                float pathHere = rtPath(col, slotId, p.y);
                float dxp = p.x - pathHere;
                float dyh = p.y - rn.head.y;
#ifdef SESSILE
                // sweep: everything the head touched is gone
                if (p.y < rn.head.y && p.y > rn.y0 - rn.r) {
                    float dx = p.x - pathHere;
                    // any pixel that could belong to a drop the head touches
                    float sw = (abs(dx) < rn.r * 3.0 + 80.0 * ps ? 1.0 : 0.0) * (1.0 - rn.dying);
                    if (sw > sweep) { sweep = sw; sweepX = pathHere; sweepW = rn.r; sweepHeadY = rn.head.y; sweepV = max(rn.v, 1.0); }
                }
                if (rn.merged > 0.0 && rn.stopVol > growVol) { growCell = rn.stopCell; growVol = rn.stopVol; }
#else
                if (p.y < rn.head.y && p.y > rn.y0 - rn.r) {
                    float dx = p.x - pathHere;
                    float wn = rtWidth(col, slotId, p.y);
                    float wn2 = vnoise(vec2(p.y / (16.0 * ps), rn.col * 5.0 + fl + 3.0));
                    float tw = rn.tw * (0.8 + 0.3 * (wn - 0.5) * 2.0 + 0.12 * (wn2 - 0.5) * 2.0);
                    float age = (rn.head.y - p.y) / max(rn.v, 1.0);
                    float regrow = 1.0 - exp(-age * fogRegrow * 0.06);
                    float fresh = (1.0 - regrow) * (1.0 - rn.dying);
                    // the fog regrows inward from the sides as the track ages
                    float shrink = tw * (1.0 - 0.5 * regrow);
                    float band = smoothstep(shrink + 1.5 * ps, shrink - 1.5 * ps, abs(dx));
                    trailClear = max(trailClear, band * fresh);
                    // meniscus glints: short segments along the wet edge
                    float men = (1.0 - smoothstep(0.0, 2.5 * ps, abs(abs(dx) - shrink))) * fresh * (0.6 + 0.4 * wn2);
                    trailMen = max(trailMen, men);
                }

                // pixels far from the head and its beads skip the expensive part
                if (abs(dxp) > 4.0 * rn.r) continue;
                if (dyh < 1.8 * rn.r && dyh > -(rn.shape.w + 1.5) * rn.r) {
                // head: oriented (partly) along its path, round advancing front,
                // tail that narrows to the track width and flattens into the film
                float slopeH = (rtPath(col, slotId, rn.head.y + 12.0 * ps) - rtPath(col, slotId, rn.head.y - 24.0 * ps)) / (36.0 * ps);
                float turnAng = atan(slopeH * rainTurn) + rn.lean;
                vec2 tdir = vec2(sin(turnAng), cos(turnAng));
                vec2 dh = p - rn.head;
                vec2 dl = vec2(dh.x * tdir.y - dh.y * tdir.x, dh.x * tdir.x + dh.y * tdir.y);
                float tailLen = rn.shape.w;
                float taper = clamp(-dl.y / (tailLen * rn.r), 0.0, 1.0);
                float rx = rn.r * rn.shape.y * mix(1.0, 0.55 * rainTrailWidth / rn.shape.y, pow(taper, 1.1));
                float tailFade = (1.0 - smoothstep(0.08, 0.9, taper)) * (1.0 - rn.merged);
                float tailDome = rn.shape.z * (1.0 - 0.9 * smoothstep(0.05, 0.8, taper));
                addDrop(runAcc, dl, rx, rn.r * tailLen, rn.r * 1.05 / rn.shape.y, rn.shape.x, rn.col * 1.3, rn.r, 0.25 + 0.2 * dropMerge, lensZoom, tailDome, rn.spark, tailFade);
                if (rn.merged > 0.0 && length(dh) < rn.r * 2.5) runUnder = max(runUnder, smoothstep(0.0, 0.3, rn.merged));
                }

                // pearling: the receding contact line leaves a chain of beads
                if (rainTrail > 0.001 && p.y < rn.head.y + rn.r && p.y > rn.y0 - rn.r) {
                    float cs = rn.r * 0.55;
                    float cy = floor(p.y / cs);
                    float pathUp = rtPath(col, slotId, p.y - cs);
                    float slope = (pathHere - pathUp) / cs;
                    for (int i2 = -1; i2 <= 1; i2++) {
                        float ci = cy + float(i2);
                        vec4 hd = hash42(vec2(ci * 1.3 + rn.col * 9.1, fl * 4.4 + seed + rn.born * 0.01));
                        float clump = 0.5 + 0.5 * hash12(vec2(floor(ci / 5.0), rn.col * 4.0 + fl + 11.0));
                        if (hd.x > rainTrail * 0.8 * clump) continue;
                        float yc = (ci + 0.1 + 0.8 * hd.y) * cs;
                        if (yc > rn.head.y - rn.r * 0.9 || yc < rn.y0) continue;
                        float twc = rn.tw * (0.7 + 0.6 * hd.w);
                        float xcc = pathHere + slope * (yc - p.y) + (hd.z - 0.5) * twc * 1.6;
                        float fresh = 1.0 - smoothstep(0.0, 6.0 * rn.r, rn.head.y - yc);
                        float rt = rn.r * mix(0.06, 0.3, hd.w * hd.w * hd.w) * (1.0 + 0.3 * fresh) * (1.0 - rn.dying);
                        if (rt < 0.6) continue;
                        float relax = clamp((rn.head.y - yc) / max(rn.v, 1.0), 0.0, 1.0);
                        vec2 dd = p - vec2(xcc, yc);
                        addDrop(runAcc, dd, rt * mix(0.8, 0.95, relax), rt * mix(1.5, 1.05, relax), rt * 1.1, 0.02, hd.x * 6.0, rt, 0.1 + 0.2 * dropMerge, lensZoom, 0.7 + 0.3 * hd.y, 0.5 + 0.7 * hd.z, 1.0);
                    }
                }
#endif
            }
        }
    }

#ifdef SESSILE
    // ==================================================== sessile pass
    // Rendered into a cached texture at a low rate: the sitting drops, their
    // dry halo and their shadow, as a premultiplied layer over the pane.
    Acc sess; accInit(sess);
    int dl = int(clamp(dropLayers, 1.0, 3.0));
    // per-layer cell size / density as seen from this pixel
    float csL[3]; float densL[3];
    for (int l = 0; l < 3; l++) { csL[l] = layerCell(l); densL[l] = layerDens(l) * layerCluster(l, p, layerCell(l)); }
    for (int l = 0; l < 3; l++) {
        if (l >= dl) break;
        float fl = float(l);
        float cs = csL[l];
        float densHere = densL[l];
        float rMax = cs * 0.36;
        float rMin = 1.9 * ps;
        // the four cells whose centres are nearest: a drop never reaches
        // further than jitter + rMax < 1 cell from its own centre
        vec2 cell = floor(p / cs - 0.5);
        for (int y = 0; y <= 1; y++) {
            for (int x = 0; x <= 1; x++) {
                vec2 cc = cell + vec2(float(x), float(y));
                vec4 me = sessileAt(cc, fl, cs, rMin, rMax, densHere);
                if (me.w <= 0.0) continue;
                vec2 centre = me.xy;
                float exist = me.w;
                float rr = me.z;
                // a runner swallows every drop its head touches on the way down:
                // the drop is pulled into the head and shrinks away over ~0.4 s
                if (sweep > 0.001) {
                    float reach = sweepW * 1.05 + rr;
                    if (abs(centre.x - sweepX) < reach) {
                        // seconds since the head's front touched the drop; the pull starts on contact
                        float tpass = (sweepHeadY + sweepW - (centre.y - rr)) / sweepV;
                        float gone = smoothstep(0.0, 0.22, tpass);
                        centre.x += (sweepX - centre.x) * gone * 0.3;
                        exist *= 1.0 - gone;
                        rr *= 1.0 - gone;
                    }
                }
                if (rr < 0.6) continue;
                vec2 d = p - centre;
                if (abs(d.x) > rr * 3.0 || abs(d.y) > rr * 3.0) continue;

                // coalescence: water does not overlap. A drop touching a bigger
                // neighbour is absorbed by it; the bigger one grows by the volume.
                float vol = rr * rr * rr;
                // a runner that stopped here adds its water
                if (l == 0 && cc == growCell) vol += growVol;
                float absorbed = 0.0;
                if (l < 2) {
                    for (int ny = -1; ny <= 1; ny++) for (int nx = -1; nx <= 1; nx++) {
                        if (nx == 0 && ny == 0) continue;
                        vec2 nc = cc + vec2(float(nx), float(ny));
                        vec4 nb = sessileBase(nc, fl, cs, rMin, rMax, densHere);
                        if (nb.w <= 0.0 || nb.z < 0.6) continue;
                        float dist = length(nb.xy - centre);
                        float touch = smoothstep(0.95 * (rr + nb.z), 0.8 * (rr + nb.z), dist);
                        if (touch <= 0.0) continue;
                        // tie-break by cell hash so exactly one side wins
                        bool theyWin = nb.z > rr || (nb.z == rr && hash12(nc) > hash12(cc));
                        if (theyWin) absorbed = max(absorbed, touch);
                        else vol += nb.z * nb.z * nb.z * touch;
                    }
                }
                // smaller layers are swallowed by any bigger-layer drop they touch
                for (int bl = 0; bl < 2; bl++) {
                    if (bl >= l) break;
                    float bcs = csL[bl];
                    vec2 bcell = floor(centre / bcs - 0.5);
                    for (int by = 0; by <= 1; by++) for (int bx = 0; bx <= 1; bx++) {
                        vec4 big = sessileBase(bcell + vec2(float(bx), float(by)), float(bl), bcs, 1.9 * ps, bcs * 0.36, densL[bl]);
                        if (big.w <= 0.0 || big.z < 0.6) continue;
                        float dist = length(big.xy - centre);
                        absorbed = max(absorbed, smoothstep(1.0 * (rr + big.z), 0.85 * (rr + big.z), dist));
                    }
                }
                rr = pow(vol, 1.0 / 3.0) * (1.0 - absorbed);
                if (rr < 0.6) continue;
                d = p - centre;
                if (abs(d.x) > rr * 2.2 || abs(d.y) > rr * 2.6) continue;

                vec4 hs = hash42(cc * 1.37 + vec2(fl * 41.0 + seed, fl * 17.0 - seed));
                vec3 hk = hash32(cc * 0.71 + vec2(fl, seed));
                float sag = clamp(rr / (20.0 * ps), 0.0, 1.0) * dropIrregular;
                float rx = rr * (0.97 + 0.08 * (hk.y - 0.5) * dropIrregular);
                float ryUp = rr * (0.94 - 0.04 * sag);
                float ryDown = rr * (1.12 + 0.18 * sag);
                float wob = 0.06 * dropIrregular * (0.4 + 0.6 * hk.z);
                addDrop(sess, d, rx, ryUp, ryDown, wob, hk.z * 6.28 + hs.w * 3.0, rr, 0.2 + 0.25 * dropMerge, lensZoom, 0.6 + 0.4 * hs.w, 0.6 + 0.8 * hk.y, 1.0);
            }
        }
    }

    vec3 clear = sampleBg(uv, 0.0);
    vec4 outc = vec4(0.0);
    // dry halo: the condensation is gone in a ring around each drop, so the
    // clear pane shows through there
    float halo = smoothstep(1.7, 1.15, sess.qmin) * fogHalo * clamp(sess.rNear / (6.0 * ps), 0.0, 1.0);
    float haloA = clamp(halo * fogAmount * patches, 0.0, 1.0);
    outc = vec4(clear * haloA, haloA);
    // soft shadow on the pane away from the light, hugging the edge
    float outsideNear = smoothstep(1.6, 1.0, sess.qmin) * (1.0 - sess.wet);
    float shadowSide = pow(smoothstep(-0.2, 1.0, dot(sess.toC, -lxy)), 2.0);
    float clum = dot(clear, vec3(0.2126, 0.7152, 0.0722));
    float sh = shadow * 0.22 * outsideNear * shadowSide * clamp(sess.rNear / (10.0 * ps), 0.15, 1.0) * (0.3 + 0.7 * clum);
    outc.rgb *= 1.0 - sh;
    outc.a = 1.0 - (1.0 - outc.a) * (1.0 - sh);
    vec4 dr = shadeDrop(sess, uv, clear, L, lxy, 0.0);
    outc = vec4(dr.rgb + outc.rgb * (1.0 - dr.a), dr.a + outc.a * (1.0 - dr.a));
    fragColor = outc * qt_Opacity;
#else
    // ======================================================= main pass
    vec2 gn = (g.rg - 0.5) * 2.0 * fogGrain;
    float glassAdd = max(g.a - 0.5, 0.0) * 2.0;
    float glassDust = max(0.5 - g.a, 0.0) * 2.0;

    // ------------------------------------------------------- condensation
    float fogLocal = clamp(fogAmount * patches, 0.0, 1.0);
    fogLocal *= (1.0 - runAcc.wet);
    // a wet track scatters a little even when the condensation is gone
    fogLocal *= (1.0 - trailClear * 0.85);
    fogLocal = clamp(fogLocal, 0.0, 1.0);
    // micro-droplets are lit from the light side: a stipple of bright and dark flanks
    float gl = dot(gn, lxy) * 0.07;

    // ------------------------------------------------------------- base
    vec2 bgUv = uv + gn * 2.5 * ps / resolution * fogLocal;
    vec3 clear = sampleBg(bgUv, 0.0);
    vec3 fogged = fogColor(bgUv) * (1.0 + gl);
    vec3 col = mix(clear, fogged, fogLocal);
    col += glassAdd * 0.06 * fogLocal * fogGrain;
    // meniscus: refract the pane slightly along the wet edge instead of painting a line
    col = mix(col, sampleBg(bgUv + vec2(0.0, 2.0 * ps / resolution.y), 0.0) * 1.06, trailMen * trailEdge * 0.6);

    // --------------------------------------------------- sessile layer
    vec4 st = texture(sessTex, uv);
    col = col * (1.0 - st.a) + st.rgb;

    // ------------------------------------------------------------ runners
    float cov = 0.0;
    if (runAcc.h > 0.001) {
        float outsideNear = smoothstep(1.6, 1.0, runAcc.qmin) * (1.0 - runAcc.wet);
        float shadowSide = pow(smoothstep(-0.2, 1.0, dot(runAcc.toC, -lxy)), 2.0);
        float bgLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col *= 1.0 - shadow * 0.22 * outsideNear * shadowSide * clamp(runAcc.rNear / (10.0 * ps), 0.15, 1.0) * (0.3 + 0.7 * bgLum) * runAcc.fade;
        vec4 dr = shadeDrop(runAcc, uv, col, L, lxy, 1.0);
        dr *= 1.0 - st.a * runUnder;
        col = col * (1.0 - dr.a) + dr.rgb;
        cov = dr.a;
    }

    // ------------------------------------------------------------- glass
    col = mix(col, col * 0.55 + 0.08, glassDust * (1.0 - cov) * (1.0 - st.a));

    // ------------------------------------------------------------- post
    vec2 vc = uv - 0.5;
    col *= 1.0 - vignette * smoothstep(0.35, 0.9, dot(vc, vc) * 2.0);
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, saturation);
    col = (col - 0.5) * contrast + 0.5 + (brightness - 1.0);
    col = clamp(col, 0.0, 1.0);
    vec3 curve = col * col * (3.0 - 2.0 * col);
    col = mix(col, curve, filmic);
    fragColor = vec4(col, 1.0) * qt_Opacity;
#endif
}
#endif
