/**
 * Stratified galactic fog — multiple translucent shells along the Milky Way band.
 */

export const MILKY_WAY_FOG_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MILKY_WAY_FOG_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDir;

  uniform float uTime;
  uniform float uLayerDepth;
  uniform float uDensity;
  uniform float uOpacity;
  uniform float uBandWidth;
  uniform vec3 uFogColor;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), u.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), u.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
      u.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.05;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    vec3 galacticUp = normalize(vec3(0.58, 0.68, 0.47));
    float planeDist = abs(dot(dir, galacticUp));

    float bandCore = exp(-pow(planeDist / (uBandWidth * 0.55), 2.2));
    float bandHalo = exp(-pow(planeDist / uBandWidth, 1.8));
    float band = bandCore * 0.65 + bandHalo * 0.35;

    vec3 sampleDir = dir + vec3(uTime * 0.0018, uTime * 0.001, 0.0);
    float layerScale = mix(3.5, 11.0, uLayerDepth);
    float wisps = fbm(sampleDir * layerScale + vec3(uLayerDepth * 4.0, 1.0, 2.0));
    float filaments = fbm(sampleDir * layerScale * 2.1 + vec3(0.5, uLayerDepth * 2.0, 0.0));

    float horizonFade = pow(1.0 - abs(dir.y) * 0.68, 1.4);
    float depthBias = mix(0.55, 1.0, uLayerDepth);

    float fog = band * (0.35 + wisps * 0.42 + filaments * 0.23);
    fog *= uDensity * depthBias * horizonFade;

    float alpha = fog * uOpacity;
    if (alpha < 0.004) discard;

    vec3 col = uFogColor * (0.85 + bandCore * 0.35);
    gl_FragColor = vec4(col, alpha);
  }
`;
