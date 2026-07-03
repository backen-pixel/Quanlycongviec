/**
 * GLSL for cinematic Earth — day/night, PBR-ish ocean, color grading.
 */

export const EARTH_TEXTURED_VERTEX = /* glsl */ `
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

export const EARTH_TEXTURED_FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDirW;

  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uSpecularMap;
  uniform sampler2D uRoughnessMap;
  uniform vec3 uSunDirection;
  uniform float uSpecularStrength;
  uniform float uShininess;
  uniform float uNightBoost;
  uniform float uSaturation;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uDayLift;
  uniform float uForestBoost;
  uniform vec3 uForestTint;
  uniform float uOceanBoost;
  uniform vec3 uOceanTint;
  uniform float uUsePBRMaps;

  vec3 adjustSaturation(vec3 color, float amount) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, amount);
  }

  vec3 adjustContrast(vec3 color, float amount) {
    return (color - 0.5) * amount + 0.5;
  }

  float oceanMask(vec3 color) {
    float blueLead = color.b - max(color.r, color.g);
    float texOcean = mix(0.0, texture2D(uSpecularMap, vUv).r, uUsePBRMaps);
    return max(smoothstep(0.03, 0.16, blueLead), texOcean * 0.85);
  }

  float vegetationMask(vec3 color) {
    float greenLead = color.g - max(color.r, color.b);
    float veg = smoothstep(0.03, 0.17, greenLead);
    float ocean = smoothstep(0.05, 0.2, color.b - max(color.r, color.g));
    float desert = smoothstep(0.05, 0.16, color.r - color.g) * smoothstep(0.0, 0.12, color.r - color.b);
    float snow = smoothstep(0.68, 0.86, dot(color, vec3(0.2126, 0.7152, 0.0722)));
    return veg * (1.0 - ocean) * (1.0 - desert) * (1.0 - snow);
  }

  vec3 boostOceanBlue(vec3 color, float strength, vec3 tint) {
    float mask = oceanMask(color);
    vec3 ocean = color;
    ocean.b = min(ocean.b * mix(1.0, 1.48, strength), 1.0);
    ocean.g *= mix(1.0, 0.9, mask * strength);
    ocean.r *= mix(1.0, 0.75, mask * strength);
    ocean = mix(ocean, mix(ocean, tint, 0.42), mask * strength);
    return mix(color, ocean, mask * strength);
  }

  vec3 boostForestGreen(vec3 color, float strength, vec3 tint) {
    float mask = vegetationMask(color);
    vec3 lush = color;
    lush.g = min(lush.g * mix(1.0, 1.38, strength), 1.0);
    lush.r *= mix(1.0, 0.82, mask * strength);
    lush.b *= mix(1.0, 0.78, mask * strength);
    lush = mix(lush, mix(lush, tint, 0.4), mask * strength);
    return mix(color, lush, mask * strength);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    if (uUsePBRMaps > 0.5) {
      vec3 mapN = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      n = normalize(n + mapN * 0.12);
    }

    vec3 sunDir = normalize(uSunDirection);
    vec3 viewDir = normalize(vViewDirW);
    float ndl = dot(n, sunDir);
    float dayMix = smoothstep(-0.2, 0.34, ndl);

    vec3 dayColor = texture2D(uDayMap, vUv).rgb * uBrightness;
    dayColor = adjustSaturation(dayColor, uSaturation);
    dayColor = adjustContrast(dayColor, uContrast);
    dayColor = boostOceanBlue(dayColor, uOceanBoost, uOceanTint);
    dayColor = boostForestGreen(dayColor, uForestBoost, uForestTint);
    dayColor += vec3(uDayLift);

    vec3 nightColor = texture2D(uNightMap, vUv).rgb * uNightBoost;
    nightColor *= smoothstep(0.35, -0.08, ndl);

    vec3 albedo = mix(nightColor, dayColor, dayMix);

    float waterMask = oceanMask(dayColor);
    float roughness = mix(0.85, 0.12, waterMask);
    if (uUsePBRMaps > 0.5) {
      roughness = mix(texture2D(uRoughnessMap, vUv).r, 0.15, waterMask);
    }

    vec3 halfVec = normalize(sunDir + viewDir);
    float specPower = mix(8.0, uShininess, 1.0 - roughness);
    float spec = pow(max(dot(n, halfVec), 0.0), specPower);
    float sunSpec = spec * uSpecularStrength * waterMask * dayMix;

    vec3 reflectDir = reflect(-sunDir, n);
    float sparkle = pow(max(dot(reflectDir, viewDir), 0.0), 120.0);
    sparkle *= waterMask * dayMix * 0.55;

    albedo += sunSpec + sparkle * vec3(0.85, 0.92, 1.0);

    gl_FragColor = vec4(albedo, 1.0);
  }
`;
