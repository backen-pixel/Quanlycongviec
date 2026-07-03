/**
 * Tune Earth experience quality by device tier — keeps visuals, reduces GPU load.
 * Background mode (full-page preset) always applies cuts, including on "high" tier.
 *
 * @param {import('./earthExperienceDefaults.js').EarthExperienceConfig} config
 * @param {'low' | 'medium' | 'high'} tier
 * @param {{ backgroundMode?: boolean }} [options]
 */
export function applyEarthPerformanceProfile(config, tier, options = {}) {
  const background = options.backgroundMode === true;
  if (!background && tier === 'high') return config;

  const fogLayers = config.milkyWay?.fogLayers?.layers ?? [];
  const planetItems = (config.deepSpacePlanets?.items ?? []).filter(
    (item) => !String(item.id).startsWith('Star-'),
  );

  if (background && tier === 'high') {
    return {
      ...config,
      renderer: {
        ...config.renderer,
        pixelRatioMax: 1.5,
        precision: 'mediump',
        shadowMap: false,
        postProcess: { ...config.renderer.postProcess, enabled: false },
      },
      sun: {
        ...config.sun,
        castShadow: false,
        visual: {
          ...config.sun.visual,
          coronaLayerCount: 3,
          discSegments: 48,
        },
      },
      earth: {
        ...config.earth,
        widthSegments: 72,
        heightSegments: 52,
        cloudSegments: 48,
      },
      atmosphere: {
        ...config.atmosphere,
        shellSegments: 48,
      },
      moon: {
        ...config.moon,
        segments: 40,
      },
      milkyWay: {
        ...config.milkyWay,
        segments: 48,
        fogLayers: {
          ...config.milkyWay.fogLayers,
          layers: fogLayers.slice(0, 2),
        },
      },
      starfield: {
        ...config.starfield,
        count: 4000,
      },
      deepSpacePlanets: {
        ...config.deepSpacePlanets,
        glowStars: {
          ...config.deepSpacePlanets.glowStars,
          count: 40,
        },
        items: planetItems,
      },
      textures: {
        ...config.textures,
        normal: null,
        specular: null,
        roughness: null,
      },
      animation: {
        ...config.animation,
        targetFps: 30,
      },
    };
  }

  if (background && tier === 'medium') {
    return {
      ...config,
      renderer: {
        ...config.renderer,
        pixelRatioMax: 1.35,
        antialias: true,
        precision: 'mediump',
        shadowMap: false,
        postProcess: { ...config.renderer.postProcess, enabled: false },
      },
      sun: {
        ...config.sun,
        castShadow: false,
        visual: {
          ...config.sun.visual,
          coronaLayerCount: 2,
          discSegments: 40,
        },
      },
      earth: {
        ...config.earth,
        widthSegments: 64,
        heightSegments: 48,
        cloudSegments: 40,
      },
      atmosphere: {
        ...config.atmosphere,
        shellSegments: 40,
      },
      moon: {
        ...config.moon,
        segments: 36,
      },
      milkyWay: {
        ...config.milkyWay,
        segments: 40,
        fogLayers: {
          ...config.milkyWay.fogLayers,
          layers: fogLayers.slice(0, 2),
        },
      },
      starfield: {
        ...config.starfield,
        count: 3000,
      },
      deepSpacePlanets: {
        ...config.deepSpacePlanets,
        glowStars: {
          ...config.deepSpacePlanets.glowStars,
          count: 28,
        },
        items: planetItems.slice(0, 5),
      },
      textures: {
        ...config.textures,
        normal: null,
        specular: null,
        roughness: null,
      },
      animation: {
        ...config.animation,
        targetFps: 24,
      },
    };
  }

  // low tier, or medium/low without background flag
  const sliceFog = tier === 'low' ? 1 : (background ? 2 : 3);

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
      enabled: tier === 'low' && background ? false : config.moon?.enabled,
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
      count: tier === 'low' ? (background ? 1800 : 3500) : (background ? 2500 : 5500),
    },
    deepSpacePlanets: {
      ...config.deepSpacePlanets,
      glowStars: {
        ...config.deepSpacePlanets.glowStars,
        count: tier === 'low' ? (background ? 0 : 36) : (background ? 20 : 58),
      },
      items: background
        ? planetItems.slice(0, tier === 'low' ? 4 : 5)
        : config.deepSpacePlanets.items,
    },
    textures: background ? {
      ...config.textures,
      normal: null,
      specular: null,
      roughness: null,
    } : config.textures,
    animation: {
      ...config.animation,
      targetFps: background ? (tier === 'low' ? 20 : 24) : (config.animation?.targetFps ?? 0),
    },
  };
}
