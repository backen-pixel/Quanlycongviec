/**
 * GLSL sources for atmospheric limb glow — Rayleigh-style blue scattering at silhouette.
 */

export const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform vec3 uInnerColor;
  uniform vec3 uOuterColor;
  uniform vec3 uSunDirection;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uFalloffStart;
  uniform float uFalloffEnd;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(vViewDirW);
    vec3 sunDir = normalize(uSunDirection);

    float sunLit = smoothstep(-0.35, 0.45, dot(n, sunDir));
    float rim = 1.0 - max(dot(n, viewDir), 0.0);

    float limb = smoothstep(uFalloffStart, uFalloffEnd, rim);
    limb = pow(limb, 1.65);

    float scatter = pow(rim, 2.8) * sunLit;
    vec3 scatterColor = mix(uInnerColor, uOuterColor, scatter);
    float alpha = clamp((limb * 0.55 + scatter * 0.45) * uIntensity * uOpacity * sunLit, 0.0, 0.72);

    gl_FragColor = vec4(scatterColor, alpha);
  }
`;
