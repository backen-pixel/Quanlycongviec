/** Màu từng mặt — dễ phân biệt 3D (không phải màu in thật). */
export const FACE_COLORS = {
  front: '#38bdf8',
  back: '#818cf8',
  left: '#34d399',
  right: '#fbbf24',
  top: '#fb7185',
  bottom: '#94a3b8',
  topLeft: '#fda4af',
  topRight: '#f43f5e',
};

export const PART_COLORS = {
  base: '#38bdf8',
  lid: '#fb7185',
  sleeve: '#a78bfa',
  drawer: '#fbbf24',
};

export function withFaceColor(preset, faceId, colorByFace) {
  if (!colorByFace) return preset;
  const c = FACE_COLORS[faceId] || preset.color;
  return { ...preset, color: c, roughness: Math.min(0.85, (preset.roughness || 0.7) + 0.05) };
}

export function withPartColor(preset, partKey, colorByFace) {
  if (!colorByFace) return preset;
  return { ...preset, color: PART_COLORS[partKey] || preset.color };
}
