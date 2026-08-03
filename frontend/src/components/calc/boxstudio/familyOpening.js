/**
 * Map rigid-box family → carton opening / special 3D mode.
 */
export const FAMILY_OPENING = {
  lid_base: 'lid_base_two_piece',
  tall_bottle: 'lid_base_two_piece',
  shoulder: 'lid_base_two_piece',
  flip_top: 'lid_from_back',
  magnetic: 'lid_from_back',
  drawer: 'drawer',
  sleeve_drawer: 'drawer',
  double_door: 'double_door_lids',
  tuck_end: 'lid_from_back',
  book: 'lid_from_left',
};

export function openingForFamily(family) {
  return FAMILY_OPENING[family] || 'lid_from_back';
}
