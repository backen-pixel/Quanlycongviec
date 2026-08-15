/**
 * Tune Earth experience quality by device tier — keeps visuals, reduces GPU load.
 * Background mode (full-page preset) always applies aggressive cuts so CRM UI stays responsive.
 *
 * @param {import('./earthExperienceDefaults.js').EarthExperienceConfig} config
 * @param {'low' | 'medium' | 'high'} tier
 * @param {{ backgroundMode?: boolean }} [options]
 */
export function applyEarthPerformanceProfile(config, tier, options = {}) {
  const background = options.backgroundMode === true;
  if (!background && tier === 'high') return config;

  const fogLayers = config.milkyWay?.fogLayers?.layers ?? [];
  /** Chỉ giữ hành tinh lớn, bỏ sao phụ + vệ tinh (rất tốn draw-call). */
  const majorPlanets = (config.deepSpacePlanets?.items ?? [])
    .filter((item) => !String(item.id).startsWith('Star-'))
    .slice(0, background ? (tier === 'high' ? 3 : 2) : 6)
    .map((item) => ({ ...item, moons: [] }));

  // ── Full-page CRM background: ưu tiên mượt UI hơn độ nét 3D ──────────────
  if (background) {
    const isLow = tier === 'low';
    const isMed = tier === 'medium';
    return {
      ...config,
      renderer: {
        ...config.renderer,
        // 1× DPR + scale canvas — giảm fill-rate trên màn retina
        pixelRatioMax: 1,
        resolutionScale: isLow ? 0.55 : isMed ? 0.65 : 0.72,
        antialias: false,
        precision: 'mediump',
        powerPreference: 'low-power',
        shadowMap: false,
        postProcess: { ...config.renderer.postProcess, enabled: false },
      },
      sun: {
        ...config.sun,
        castShadow: false,
        visual: {
          ...config.sun.visual,
          // Tắt đĩa mặt trời texture 4K — vẫn có directional light
          enabled: !isLow,
          coronaLayerCount: 1,
          discSegments: 24,
          glowStrength: 0.35,
        },
      },
      earth: {
        ...config.earth,
        widthSegments: isLow ? 40 : isMed ? 48 : 56,
        heightSegments: isLow ? 28 : isMed ? 32 : 40,
        cloudSegments: isLow ? 28 : isMed ? 32 : 36,
        cloudOpacity: isLow ? 0.32 : 0.4,
      },
      atmosphere: {
        ...config.atmosphere,
        shellSegments: isLow ? 28 : 32,
      },
      moon: {
        ...config.moon,
        enabled: !isLow,
        segments: 24,
        glowStrength: 0.35,
      },
      milkyWay: {
        ...config.milkyWay,
        segments: isLow ? 24 : 32,
        fogLayers: {
          ...config.milkyWay.fogLayers,
          enabled: !isLow,
          layers: fogLayers.slice(0, isLow ? 0 : 1),
        },
      },
      starfield: {
        ...config.starfield,
        count: isLow ? 600 : isMed ? 900 : 1200,
      },
      deepSpacePlanets: {
        ...config.deepSpacePlanets,
        groupRotationSpeedRadPerSec: 0.001,
        glowStars: {
          ...config.deepSpacePlanets.glowStars,
          count: 0,
        },
        items: isLow ? [] : majorPlanets,
      },
      textures: {
        ...config.textures,
        // Bỏ map phụ 4K; nền không cần specular/normal
        normal: null,
        specular: null,
        roughness: null,
        // Sun/Moon texture nặng — chỉ tải khi thực sự dùng
        sun: isLow ? null : config.textures?.sun,
        moon: isLow ? null : config.textures?.moon,
      },
      animation: {
        ...config.animation,
        // Cap FPS rõ ràng — nền trang, không phải demo
        targetFps: isLow ? 15 : isMed ? 18 : 20,
        maxDeltaSec: 0.08,
      },
    };
  }

  // ── Interactive / non-background (giữ chất lượng hơn) ────────────────────
  const sliceFog = tier === 'low' ? 1 : 3;

  return {
    ...config,
    renderer: {
      ...config.renderer,
      pixelRatioMax: tier === 'low' ? 1 : 1.25,
      antialias: tier !== 'low',
      precision: 'mediump',
      shadowMap: false,
      postProcess: { ...config.renderer.postProcess, enabled: false },
    },
    sun: {
      ...config.sun,
      castShadow: false,
      visual: {
        ...config.sun.visual,
        coronaLayerCount: tier === 'low' ? 2 : 3,
        discSegments: tier === 'low' ? 32 : 40,
      },
    },
    earth: {
      ...config.earth,
      widthSegments: tier === 'low' ? 56 : 64,
      heightSegments: tier === 'low' ? 40 : 48,
      cloudSegments: tier === 'low' ? 36 : 40,
    },
    atmosphere: {
      ...config.atmosphere,
      shellSegments: tier === 'low' ? 36 : 40,
    },
    moon: {
      ...config.moon,
      segments: tier === 'low' ? 32 : 36,
    },
    milkyWay: {
      ...config.milkyWay,
      segments: tier === 'low' ? 36 : 40,
      fogLayers: {
        ...config.milkyWay.fogLayers,
        layers: fogLayers.slice(0, sliceFog),
      },
    },
    starfield: {
      ...config.starfield,
      count: tier === 'low' ? 3500 : 5500,
    },
    deepSpacePlanets: {
      ...config.deepSpacePlanets,
      glowStars: {
        ...config.deepSpacePlanets.glowStars,
        count: tier === 'low' ? 36 : 58,
      },
      items: config.deepSpacePlanets.items,
    },
    animation: {
      ...config.animation,
      targetFps: config.animation?.targetFps ?? 0,
    },
  };
}
