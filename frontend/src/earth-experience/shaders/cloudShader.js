/**
 * Volumetric-style cloud shell with sun lighting and night fade.
 */

export const CLOUD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalW;

  uniform sampler2D uCloudMap;
  uniform vec3 uSunDirection;
  uniform float uOpacity;
  uniform float uSunStrength;

  void main() {
    float density = texture2D(uCloudMap, vUv).r;
    if (density < 0.04) discard;

    vec3 n = normalize(vNormalW);
    vec3 sunDir = normalize(uSunDirection);
    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.22, 0.28, ndl);

    vec3 lit = vec3(1.0) * (0.35 + max(ndl, 0.0) * uSunStrength);
    float shadow = mix(0.55, 1.0, dayMix);
    float alpha = density * uOpacity * shadow * mix(0.35, 1.0, dayMix);

    gl_FragColor = vec4(lit, alpha);
  }
`;
