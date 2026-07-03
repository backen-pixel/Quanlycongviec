import {
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { EARTH_TEXTURED_FRAGMENT, EARTH_TEXTURED_VERTEX } from '../shaders/earthTexturedShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Builds the Earth sphere using day/night texture maps and optional PBR maps.
 */
export class EarthMeshFactory {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['earth']} earthConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['sun']} sunConfig
   * @param {object} textures
   * @param {ResourceRegistry} registry
   */
  constructor(earthConfig, sunConfig, textures, registry) {
    this.geometry = registry.register(new SphereGeometry(
      earthConfig.radius,
      earthConfig.widthSegments,
      earthConfig.heightSegments,
    ));

    const usePBR = Boolean(textures.normal && textures.specular);

    this.material = registry.register(new ShaderMaterial({
      vertexShader: EARTH_TEXTURED_VERTEX,
      fragmentShader: EARTH_TEXTURED_FRAGMENT,
      uniforms: {
        uDayMap: { value: textures.day },
        uNightMap: { value: textures.night },
        uNormalMap: { value: textures.normal ?? textures.day },
        uSpecularMap: { value: textures.specular ?? textures.day },
        uRoughnessMap: { value: textures.roughness ?? textures.specular ?? textures.day },
        uSunDirection: { value: toSunVector(sunConfig.direction) },
        uSpecularStrength: { value: earthConfig.specularStrength },
        uShininess: { value: earthConfig.shininess },
        uNightBoost: { value: earthConfig.nightBoost },
        uSaturation: { value: earthConfig.saturation },
        uBrightness: { value: earthConfig.brightness },
        uContrast: { value: earthConfig.contrast ?? 1.08 },
        uDayLift: { value: earthConfig.dayLift ?? 0 },
        uForestBoost: { value: earthConfig.forestBoost },
        uForestTint: { value: new Color(earthConfig.forestTint) },
        uOceanBoost: { value: earthConfig.oceanBoost },
        uOceanTint: { value: new Color(earthConfig.oceanTint) },
        uUsePBRMaps: { value: usePBR ? 1.0 : 0.0 },
      },
    }));

    this.mesh = registry.register(new Mesh(this.geometry, this.material));
    this.mesh.name = 'EarthSurface';
    this.mesh.frustumCulled = true;
    this.mesh.receiveShadow = true;
  }

  /**
   * @param {Vector3} sunDirection
   */
  setSunDirection(sunDirection) {
    this.material.uniforms.uSunDirection.value.copy(sunDirection);
  }
}

/**
 * @param {{ x: number, y: number, z: number }} direction
 * @returns {Vector3}
 */
function toSunVector(direction) {
  return new Vector3(direction.x, direction.y, direction.z).normalize();
}
