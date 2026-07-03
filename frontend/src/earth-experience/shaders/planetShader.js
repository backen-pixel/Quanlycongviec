/**
 * Simple lit sphere for decorative deep-space planets.
 */

export const PLANET_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PLANET_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform vec3 uSunDirection;
  uniform vec3 uBaseColor;
  uniform vec3 uEmissive;
  uniform float uStripeMix;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(vViewDirW);
    vec3 sunDir = normalize(uSunDirection);
    float ndl = max(dot(n, sunDir), 0.0);

    vec3 albedo = uBaseColor;
    if (uStripeMix > 0.01) {
      float band = sin(vUv.y * 52.0) * 0.5 + 0.5;
      albedo = mix(albedo, albedo * vec3(1.12, 1.04, 0.92), band * uStripeMix);
    }

    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
    vec3 lit = albedo * (0.32 + ndl * 0.68) + uEmissive * 0.85 + albedo * rim * 0.38;
    lit = max(lit, albedo * 0.14);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

export const PLANET_GLOW_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PLANET_GLOW_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform vec3 uGlowColor;
  uniform float uGlowStrength;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(vViewDirW);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 1.6);
    float alpha = rim * uGlowStrength;
    gl_FragColor = vec4(uGlowColor * alpha, alpha);
  }
`;
