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

vec4 hash42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
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

    // condensation = dropwise: a dense stipple of micro-beads (two size
    // classes), each a tiny dome. Their outward slope is stored as the grain
    // normal so the rain pass can refract and light them like real beads.
    vec2 gn = vec2(0.0);
    float bead = 0.0;
    for (int s2 = 0; s2 < 2; s2++) {
        float gc = (s2 == 0 ? 3.2 : 6.6) * ps;
        vec2 gp = p / gc;
        vec2 gi = floor(gp - 0.5);
        for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
            vec2 c2 = gi + vec2(float(x), float(y));
            vec4 hb = hash42(c2 * 0.71 + seed * 3.0 + float(s2) * 17.0);
            if (hb.w > (s2 == 0 ? 0.45 : 0.3)) continue;
            vec2 cen = (c2 + 0.5 + (hb.xy - 0.5) * 0.9) * gc;
            float r = gc * mix(0.15, 0.5, hb.z * hb.z);
            vec2 d = (p - cen) / r;
            float q = dot(d, d);
            if (q < 1.0) {
                float h = sqrt(1.0 - q);
                gn += d * (1.0 - h * 0.4);
                bead = max(bead, h);
            }
        }
    }
    // condensation density: patches, plus vertical streaks where old runs dried
    float patches = 0.45 + 0.7 * vnoise(p / (260.0 * ps) + seed * 7.0) + 0.25 * vnoise(p / (90.0 * ps) + 3.0 + seed);
    float streaks = vnoise(vec2(p.x / (28.0 * ps), p.y / (520.0 * ps)) + seed * 11.0);
    patches *= 0.7 + 0.6 * smoothstep(0.25, 0.75, streaks);
    // each micro-bead throws a pinprick highlight toward the light
    float gspec = 0.0;
    {
        vec3 Lg = normalize(vec3(-0.45, -0.7, 0.75));
        vec3 hv = normalize(Lg + vec3(0.0, 0.0, 1.0));
        vec3 nb = normalize(vec3(-gn * 1.4, 1.0));
        gspec = pow(max(dot(nb, hv), 0.0), 60.0) * smoothstep(0.05, 0.4, bead);
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
