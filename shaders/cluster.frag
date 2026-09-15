#version 440
// Static, very smooth density fields for the three sitting-drop size classes
// (R, G, B). Rendered once at 1/8 resolution; the drop pass reads it instead
// of evaluating value noise for every cell and neighbour.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;   // full render resolution in px
    float pxScale;
    float seed;
    float dropSize;
};
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
    vec2 p = qt_TexCoord0 * resolution;
    float cs0 = 74.0 * pxScale * dropSize, cs1 = 38.0 * pxScale * dropSize, cs2 = 19.0 * pxScale * dropSize;
    float c0 = 0.3 + 1.4 * vnoise(p / (cs0 * 4.8) + vec2(seed * 3.0, 9.0));
    float c1 = 0.3 + 1.4 * vnoise(p / (cs1 * 9.0) + vec2(seed * 3.0, 9.0));
    float c2 = 0.3 + 1.4 * vnoise(p / (cs2 * 18.0) + vec2(seed * 3.0, 9.0));
    fragColor = vec4(c0, c1, c2, 1.0) * 0.5;
}
