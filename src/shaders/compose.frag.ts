export const composeFragmentShader = `
uniform sampler2D u_current;
uniform sampler2D u_prev;
uniform float u_blend;
varying vec2 vUv;
void main() {
    vec4 cur = texture2D(u_current, vUv);
    vec4 prev = texture2D(u_prev, vUv);
    gl_FragColor = mix(cur, prev, clamp(u_blend, 0.0, 0.95));
}
`;
