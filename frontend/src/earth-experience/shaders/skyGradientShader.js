/**
 * Innermost background gradient shell — dark navy CRM backdrop.
 */

export const SKY_GRADIENT_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SKY_GRADIENT_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDir;

  uniform vec3 uTopColor;
  uniform vec3 uBottomColor;
  uniform float uBrightness;

  void main() {
    float t = clamp(vWorldDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uBottomColor, uTopColor, t) * uBrightness;
    gl_FragColor = vec4(color, 1.0);
  }
`;
