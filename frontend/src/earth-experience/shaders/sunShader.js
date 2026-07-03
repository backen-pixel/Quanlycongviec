/**
 * Cinematic billboard Sun — hot core, limb darkening, soft multi-layer corona.
 */

export const SUN_SURFACE_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SUN_SURFACE_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uMap;
  uniform float uUseMap;
  uniform vec3 uTint;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uSaturation;
  uniform float uContrast;
  uniform float uTextureBlend;

  vec3 applySaturation(vec3 color, float sat) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, sat);
  }

  vec3 applyContrast(vec3 color, float contrast) {
    return clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.05;
      a *= 0.5;
    }
    return v;
  }

  vec3 sampleSunMap(vec2 discUv) {
    vec2 p = discUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) return vec3(0.0);
    float theta = atan(p.y, p.x);
    vec2 texUv = vec2(theta / 6.2831853 + 0.5, r * 0.48 + 0.02);
    return texture2D(uMap, texUv).rgb;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;

    if (r > 1.0) discard;

    float disc = 1.0 - smoothstep(0.78, 1.0, r);
    float limb = pow(1.0 - r * r, 0.28);

    vec2 flow = vec2(uTime * 0.014, uTime * 0.009);
    float gran = fbm(p * 18.0 + flow);
    float gran2 = fbm(p * 36.0 - flow * 1.4);
    float surfaceNoise = 0.88 + gran * 0.14 + gran2 * 0.06;

    vec3 hotCore = mix(vec3(1.0, 0.98, 0.92), vec3(1.0, 0.62, 0.12), pow(r, 1.45));
    vec3 texColor = sampleSunMap(vUv);
    texColor = applyContrast(applySaturation(texColor * uTint, uSaturation), uContrast);
    vec3 base = mix(hotCore, texColor, uUseMap * uTextureBlend);
    base *= surfaceNoise;

    float pulse = 0.97 + sin(uTime * 0.45) * 0.018 + sin(uTime * 1.35 + 2.1) * 0.012;
    vec3 color = applySaturation(base * uBrightness * pulse * limb, uSaturation * 0.82);

    gl_FragColor = vec4(color, disc);
  }
`;

export const SUN_CORONA_VERTEX = SUN_SURFACE_VERTEX;

export const SUN_CORONA_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec3 uCoronaColor;
  uniform vec3 uCoronaColorOuter;
  uniform float uStrength;
  uniform float uFalloff;
  uniform float uTime;

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;

    float inner = exp(-r * r * uFalloff);
    float outer = exp(-r * r * (uFalloff * 0.28));
    float edgeFade = 1.0 - smoothstep(0.55, 1.0, r);
    float shimmer = 0.97 + sin(uTime * 0.55 + r * 4.0) * 0.018;

    vec3 col = mix(uCoronaColorOuter, uCoronaColor, inner);
    float alpha = (inner * 0.58 + outer * 0.16) * uStrength * shimmer * edgeFade;

    if (alpha < 0.002) discard;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;
