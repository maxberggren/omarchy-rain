#version 440
// Static "glass" texture, rendered once: the micro-droplet grain of the
// condensation as a bump field, plus scratches and dust. The rain pass
// samples this once per pixel instead of evaluating noise every frame.
//   R,G  grain slope (biased around 0.5)
//   B    condensation density modulation (patches and old dried streaks), 0..1
//   A    0.5 + scratches * 0.5 - dust * 0.5 (+ micro-droplet highlight pings)
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;
    float pxScale;
    float seed;
    float scratches;
    float dust;
};

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3  hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 p = qt_TexCoord0 * resolution;
    float ps = pxScale;

    // condensation grain: two octaves of value noise as a height field
    vec2 gp = p / (1.8 * ps);
    float e = 0.9;
    float n1 = vnoise(gp + seed);
    float n2 = vnoise(gp * 0.42 + 13.1 + seed);
    vec2 gn = vec2(vnoise(gp + vec2(e, 0.0) + seed) - n1, vnoise(gp + vec2(0.0, e) + seed) - n1) * 2.0
            + vec2(vnoise(gp * 0.42 + vec2(e, 0.0) + 13.1 + seed) - n2, vnoise(gp * 0.42 + vec2(0.0, e) + 13.1 + seed) - n2) * 1.2;
    // condensation density: patches, plus vertical streaks where old runs dried
    float patches = 0.45 + 0.7 * vnoise(p / (260.0 * ps) + seed * 7.0) + 0.25 * vnoise(p / (90.0 * ps) + 3.0 + seed);
    float streaks = vnoise(vec2(p.x / (28.0 * ps), p.y / (520.0 * ps)) + seed * 11.0);
    patches *= 0.7 + 0.6 * smoothstep(0.25, 0.75, streaks);
    // micro-droplet highlight pings: a dense stipple of 1 px glints
    float gspec = 0.0;
    for (int s2 = 0; s2 < 2; s2++) {
        float gc = (s2 == 0 ? 3.0 : 5.5) * ps;
        vec2 sc = floor(p / gc);
        vec3 hsp = hash32(sc * 0.61 + seed * 5.0 + float(s2) * 3.0);
        if (hsp.x < 0.3) {
            vec2 scen = (sc + hsp.yz) * gc;
            float dd = length(p - scen);
            gspec = max(gspec, (1.0 - smoothstep(0.25 * ps, 0.9 * ps, dd)) * (0.3 + 0.7 * hsp.x / 0.3));
        }
    }

    // micro-scratches: sparse short segments in three directions
    float scr = 0.0;
    if (scratches > 0.001) {
        for (int i = 0; i < 3; i++) {
            float ang = (0.35 + float(i) * 1.13 + seed * 0.1);
            vec2 dir = vec2(cos(ang), sin(ang));
            vec2 rp = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
            float lane = floor(rp.y / (90.0 * ps));
            float lh = hash12(vec2(lane, float(i) * 3.7 + seed));
            if (lh > scratches * 0.5) continue;
            float w = 0.5 * ps + 0.5 * ps * lh;
            float off = fract(lh * 91.7) * 90.0 * ps;
            float line = 1.0 - smoothstep(0.0, w, abs(mod(rp.y, 90.0 * ps) - off));
            float seg = smoothstep(0.56, 0.68, vnoise(vec2(rp.x / (32.0 * ps), lane * 3.0 + float(i))));
            scr = max(scr, line * seg);
        }
    }
    // dust specks
    float dst = 0.0;
    if (dust > 0.001) {
        vec2 dc = floor(p / (16.0 * ps));
        vec3 hd = hash32(dc * 0.77 + seed * 2.0);
        if (hd.x < dust * 0.08) {
            vec2 dcen = (dc + hd.yz) * 16.0 * ps;
            float dd = length(p - dcen) / (0.7 * ps);
            dst = 1.0 - smoothstep(0.5, 1.3, dd);
        }
    }
    fragColor = vec4(clamp(0.5 + gn * 0.5, 0.0, 1.0), clamp(patches * 0.5, 0.0, 1.0), clamp(0.5 + scr * 0.5 - dst * 0.5 + gspec * 0.35, 0.0, 1.0));
}
