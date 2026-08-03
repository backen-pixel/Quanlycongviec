/**
 * Types adapted from 3D Box Studio (MIT)
 * https://github.com/kashanshah/3dboxstudio
 */

export const OPENING_STYLES = [
  { value: 'closed', label: 'Đóng kín' },
  { value: 'lid_from_back', label: 'Nắp lật từ sau' },
  { value: 'lid_from_front', label: 'Nắp lật từ trước' },
  { value: 'lid_from_left', label: 'Nắp lật trái' },
  { value: 'lid_from_right', label: 'Nắp lật phải' },
  { value: 'top_split_meet_center', label: 'Nắp 2 cánh giữa (RSC)' },
  { value: 'door_left', label: 'Cửa trái' },
  { value: 'door_right', label: 'Cửa phải' },
  { value: 'double_doors', label: 'Hai cửa bên' },
];

export const faceShortLabels = {
  front: 'Trước',
  back: 'Sau',
  left: 'Trái',
  right: 'Phải',
  top: 'Nắp',
  bottom: 'Đáy',
  topLeft: 'Nửa trái',
  topRight: 'Nửa phải',
};

export function openingRequiresSplitTop(o) {
  return o === 'top_split_meet_center';
}
