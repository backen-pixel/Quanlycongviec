/**
 * Moon surface — sun-lit day side + earthshine on night side.
 */

export const MOON_SURFACE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MOON_SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalW;

  uniform sampler2D uMap;
  uniform float uUseMap;
  uniform vec3 uSunDirection;
  uniform float uBrightness;
  uniform float uEarthshine;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 sunDir = normalize(uSunDirection);
    float ndl = dot(n, sunDir);
    float day = smoothstep(-0.08, 0.48, ndl);

    vec3 tex = mix(vec3(0.82), texture2D(uMap, vUv).rgb, uUseMap);
    vec3 dayColor = tex * uBrightness * (0.95 + max(ndl, 0.0) * 0.5);
    vec3 nightColor = tex * uEarthshine * 1.15;
    vec3 color = mix(nightColor, dayColor, day);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const MOON_GLOW_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDirW = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MOON_GLOW_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform vec3 uGlowColor;
  uniform float uStrength;

  void main() {
    float rim = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0), 2.0);
    float alpha = rim * uStrength;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uGlowColor * alpha, alpha);
  }
`;
