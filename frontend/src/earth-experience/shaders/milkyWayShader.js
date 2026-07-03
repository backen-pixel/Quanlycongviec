/**
 * GLSL for procedural Milky Way sky dome with layered depth.
 */

export const MILKY_WAY_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MILKY_WAY_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vWorldDir;

  uniform float uTime;
  uniform float uBandIntensity;
  uniform float uNebulaIntensity;
  uniform float uStarDensity;
  uniform float uDepthStrength;
  uniform vec3 uCoreColor;
  uniform vec3 uBandWarmColor;
  uniform vec3 uBandHotColor;
  uniform vec3 uNebulaColorA;
  uniform vec3 uNebulaColorB;
  uniform vec3 uDeepSpaceColor;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), u.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), u.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), u.x), u.y),
      u.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    vec3 galacticUp = normalize(vec3(0.58, 0.68, 0.47));
    float planeDist = abs(dot(dir, galacticUp));
    float band = exp(-pow(planeDist / 0.092, 2.0));
    float bandCore = exp(-pow(planeDist / 0.042, 2.1));

    vec3 sampleDir = dir + vec3(uTime * 0.003, uTime * 0.0015, 0.0);

    float dustFar = fbm(sampleDir * 4.2 + vec3(0.0, 2.0, 0.0));
    float dustMid = fbm(sampleDir * 8.5 + vec3(1.2, 0.4, 1.8));
    float dustNear = fbm(sampleDir * 17.0 + vec3(2.4, 0.8, 0.5));
    float structure = dustFar * 0.45 + dustMid * 0.35 + dustNear * 0.2;

    float horizon = pow(1.0 - abs(dir.y) * 0.72, 1.6);
    float galacticDepth = mix(0.62, 1.0, band) * mix(0.78, 1.0, horizon);
    vec3 color = uDeepSpaceColor * galacticDepth;

    float bgStarFar = hash(floor(dir * 420.0 + vec3(0.1, 0.0, 0.0)));
    float bgStarMid = hash(floor(dir * 680.0 + vec3(0.0, 0.2, 0.0)));
    float bgStarNear = hash(floor(dir * 1050.0 + vec3(0.0, 0.0, 0.3)));
    color += vec3(0.75, 0.82, 1.0) * step(0.992, bgStarFar) * 0.28;
    color += vec3(0.9, 0.92, 1.0) * step(0.9938, bgStarMid) * 0.48;
    color += vec3(1.0, 0.95, 0.82) * step(0.9952, bgStarNear) * 0.72;

    vec3 nebulaFar = mix(uNebulaColorB * 0.7, uNebulaColorA * 0.55, dustFar);
    vec3 nebulaNear = mix(uNebulaColorA, uNebulaColorB, dustNear);
    color = mix(color, nebulaFar, dustFar * uNebulaIntensity * 0.38 * (0.18 + band * 0.42));
    color = mix(color, nebulaNear, dustNear * uNebulaIntensity * 0.52 * (0.28 + band * 0.65));

    float dustLane = fbm(sampleDir * 24.0 + vec3(4.0, 1.2, 0.0));
    float laneCut = smoothstep(0.5, 0.68, dustLane) * band;
    color = mix(color, uDeepSpaceColor * 0.35, laneCut * 0.55 * uDepthStrength);

    vec3 warmBand = mix(uBandWarmColor, uBandHotColor, bandCore);
    warmBand = mix(warmBand, uCoreColor, bandCore * 0.7);
    float bandLift = 0.52 + structure * 1.08 + dustMid * 0.35;
    color += warmBand * band * uBandIntensity * bandLift;

    float grainFar = hash(floor(dir * 620.0));
    float grainNear = hash(floor(dir * 1180.0));
    float starSpeckFar = smoothstep(0.982, 1.0, grainFar) * band * 0.45;
    float starSpeckNear = smoothstep(0.988, 1.0, grainNear) * band;
    color += vec3(0.88, 0.9, 1.0) * starSpeckFar * uStarDensity * 0.55;
    color += vec3(1.0, 0.92, 0.75) * starSpeckNear * uStarDensity * 1.05;

    float rimDepth = pow(1.0 - abs(dot(dir, normalize(vec3(0.0, 1.0, 0.0)))), 2.8);
    color *= mix(1.0, 0.82, rimDepth * 0.35 * uDepthStrength);

    color = pow(max(color, 0.0), vec3(0.92));
    color *= 1.08;

    gl_FragColor = vec4(color, 1.0);
  }
`;
