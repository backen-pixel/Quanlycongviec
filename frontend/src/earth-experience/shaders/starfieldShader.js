/**
 * Layered twinkling starfield with depth (near / mid / far).
 */

export const STARFIELD_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aDepth;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDepth;

  uniform float uTime;

  void main() {
    vDepth = aDepth;
    vColor = aColor;

    float twinkleSpeed = mix(0.7, 1.6, aDepth);
    float twinkleAmp = mix(0.1, 0.22, aDepth);
    vTwinkle = 1.0 - twinkleAmp + sin(uTime * twinkleSpeed + aPhase * 6.283) * twinkleAmp;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float depthScale = mix(0.42, 1.45, aDepth);
    float perspective = 300.0 / max(-mvPosition.z, 0.1);
    gl_PointSize = aSize * depthScale * perspective;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const STARFIELD_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vTwinkle;
  varying float vDepth;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    float core = smoothstep(0.5, 0.0, d);
    float halo = exp(-d * d * mix(18.0, 8.0, vDepth)) * 0.35;
    float alpha = (core + halo) * vTwinkle * mix(0.32, 1.0, vDepth);

    if (alpha < 0.008) discard;

    vec3 col = vColor * mix(0.75, 1.15, vDepth);
    gl_FragColor = vec4(col * vTwinkle, alpha);
  }
`;
