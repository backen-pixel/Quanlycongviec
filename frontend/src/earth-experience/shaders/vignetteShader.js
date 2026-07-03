/**
 * Subtle vignette pass for post-processing.
 */

export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.25 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uStrength;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      float vig = 1.0 - dot(p, p) * uStrength;
      gl_FragColor = vec4(color.rgb * vig, color.a);
    }
  `,
};
