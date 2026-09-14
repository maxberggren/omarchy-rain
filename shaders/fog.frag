#version 440
// Wide diffuse blur of the already lens-blurred wallpaper. Rendered at low
// resolution once; the rain shader reads it as the "condensation" layer.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 resolution;   // this pass's texture size in px
    float spread;      // blur spread in low-res px
};
layout(binding = 1) uniform sampler2D src;

void main() {
    vec2 uv = qt_TexCoord0;
    vec2 px = spread / resolution;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int y = -4; y <= 4; y++) {
        for (int x = -4; x <= 4; x++) {
            vec2 o = vec2(float(x), float(y));
            float w = exp(-dot(o, o) / 9.0);
            acc += textureLod(src, uv + o * px, 2.0).rgb * w;
            wsum += w;
        }
    }
    fragColor = vec4(acc / wsum, 1.0) * qt_Opacity;
}
