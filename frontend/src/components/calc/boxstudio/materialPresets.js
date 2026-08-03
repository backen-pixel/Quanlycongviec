/** Material presets from 3D Box Studio (MIT) */

export const MATERIAL_PRESETS = [
  {
    id: 'kraft',
    label: 'Kraft',
    roughness: 0.92,
    metalness: 0,
    color: '#c4a574',
    envMapIntensity: 0.35,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
  },
  {
    id: 'white_card',
    label: 'Carton trắng',
    roughness: 0.78,
    metalness: 0,
    color: '#f2f0ea',
    envMapIntensity: 0.55,
    clearcoat: 0.08,
    clearcoatRoughness: 0.4,
  },
  {
    id: 'corrugated',
    label: 'Sóng nâu',
    roughness: 0.95,
    metalness: 0,
    color: '#a08060',
    envMapIntensity: 0.25,
    clearcoat: 0,
    clearcoatRoughness: 0.5,
  },
  {
    id: 'soft_touch_black',
    label: 'Đen soft-touch',
    roughness: 0.85,
    metalness: 0.02,
    color: '#1c1d21',
    envMapIntensity: 0.4,
    clearcoat: 0.06,
    clearcoatRoughness: 0.7,
  },
  {
    id: 'metallic_foil',
    label: 'Foil vàng',
    roughness: 0.35,
    metalness: 0.65,
    color: '#d4af37',
    envMapIntensity: 1.4,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
  },
  {
    id: 'gloss_plastic',
    label: 'Nhựa bóng',
    roughness: 0.18,
    metalness: 0.05,
    color: '#ffffff',
    envMapIntensity: 1.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  },
];

export function getPreset(id) {
  return MATERIAL_PRESETS.find((p) => p.id === id) || MATERIAL_PRESETS[1];
}
