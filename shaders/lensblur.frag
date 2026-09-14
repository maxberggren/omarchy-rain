#version 440
// Lens (bokeh) blur of the wallpaper. Runs once per wallpaper / config change,
// so it is a brute-force gather: a Vogel (golden-angle) disk, optionally
// shaped into an N-blade polygon, in linear light, with a highlight boost so
// bright points bloom into rimmed discs the way a real out-of-focus lens does.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;      // texture size in px
    float radius;         // blur radius in px
    float blades;         // 0 = circular aperture, >=3 = polygon
    float rotation;       // aperture rotation, radians
    float boost;          // highlight boost (bokeh bloom)
    float ring;           // 0..1 bright-rim bokeh (cat-eye/donut tendency)
    float threshold;      // luminance above which highlights bloom
};
layout(binding = 1) uniform sampler2D src;

const int N = 512;
const float GOLDEN = 2.39996323;

vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSRGB(vec3 c)   { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float luma(vec3 c)    { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
    vec2 uv = qt_TexCoord0;
    if (radius < 0.5) {
        fragColor = vec4(texture(src, uv).rgb, 1.0) * qt_Opacity;
        return;
    }
    // Sample spacing grows with radius; pull from a coarser mip so a sparse
    // disk still integrates the whole footprint instead of aliasing.
    float spacing = 2.0 * radius / sqrt(float(N));
    float lod = clamp(log2(max(spacing * 0.5, 1.0)), 0.0, 2.0);

    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    float polyK = (blades >= 3.0) ? 3.14159265 / blades : 0.0;
    for (int i = 0; i < N; i++) {
        float fi = float(i) + 0.5;
        float r = sqrt(fi / float(N));
        float a = fi * GOLDEN + rotation;
        float shape = 1.0;
        if (polyK > 0.0) {
            // radial scale that turns the disk into a regular polygon
            float am = mod(a - rotation, 2.0 * polyK) - polyK;
            shape = cos(polyK) / cos(am);
        }
        vec2 off = vec2(cos(a), sin(a)) * r * shape * radius / resolution;
        vec3 c = toLinear(textureLod(src, uv + off, lod).rgb);
        float l = luma(c);
        // energy-weighted gather: bright samples dominate their disc
        float w = 1.0 + boost * smoothstep(threshold, 1.0, l) * 6.0;
        // real lenses put more energy at the disc edge (spherical aberration)
        w *= mix(1.0, 0.35 + 1.4 * smoothstep(0.55, 1.0, r), ring);
        acc += c * w;
        wsum += w;
    }
    vec3 col = acc / max(wsum, 1e-4);
    fragColor = vec4(toSRGB(col), 1.0) * qt_Opacity;
}
