/**
 * Templates from 3D Box Studio (MIT) + nhãn tiếng Việt
 * https://github.com/kashanshah/3dboxstudio
 */

export const BOX_TEMPLATES = [
  {
    id: 'mailer',
    label: 'Mailer / hộp ship',
    labelEn: 'Mailer / shipping box',
    unit: 'cm',
    dims: { width: 30, height: 8, length: 22 },
    opening: 'lid_from_back',
    hint: 'Roll-end mailer, nắp nâng từ cạnh trước.',
  },
  {
    id: 'cube',
    label: 'Hộp lập phương',
    labelEn: 'Cube',
    unit: 'cm',
    dims: { width: 18, height: 18, length: 18 },
    opening: 'top_split_meet_center',
    hint: 'Nắp 2 cánh gặp giữa.',
  },
  {
    id: 'shipping_carton',
    label: 'Carton ship (RSC)',
    labelEn: 'Shipping carton (RSC)',
    unit: 'cm',
    dims: { width: 40, height: 30, length: 30 },
    opening: 'top_split_meet_center',
    hint: 'Regular slotted carton.',
  },
  {
    id: 'tuck_end',
    label: 'Tuck-end (cao / mỹ phẩm)',
    labelEn: 'Tuck-end carton (tall)',
    unit: 'cm',
    dims: { width: 7, height: 20, length: 4 },
    opening: 'lid_from_back',
    hint: 'Carton bán lẻ cao, mỹ phẩm / dược.',
  },
  {
    id: 'rigid_gift',
    label: 'Hộp quà (kiểu rigid)',
    labelEn: 'Rigid gift box',
    unit: 'cm',
    dims: { width: 22, height: 9, length: 22 },
    opening: 'lid_from_back',
    hint: 'Tỷ lệ hộp quà 2 mảnh, nắp nâng.',
  },
  {
    id: 'shoe_box',
    label: 'Hộp giày',
    labelEn: 'Shoe box',
    unit: 'cm',
    dims: { width: 33, height: 12, length: 20 },
    opening: 'lid_from_back',
    hint: 'Tỷ lệ hộp giày cổ điển.',
  },
  {
    id: 'wine_gift',
    label: 'Hộp rượu / chai',
    labelEn: 'Wine / bottle box',
    unit: 'cm',
    dims: { width: 10, height: 36, length: 10 },
    opening: 'lid_from_front',
    hint: 'Hộp cao 1 chai.',
  },
  {
    id: 'card_sleeve',
    label: 'Sleeve thẻ mỏng',
    labelEn: 'Slim card sleeve',
    unit: 'cm',
    dims: { width: 14, height: 2, length: 10 },
    opening: 'door_left',
    hint: 'Sleeve mỏng, mở cạnh.',
  },
  {
    id: 'display_pdq',
    label: 'Display / PDQ',
    labelEn: 'Display / PDQ',
    unit: 'cm',
    dims: { width: 30, height: 20, length: 24 },
    opening: 'double_doors',
    hint: 'Trưng bày, hai cánh bên mở.',
  },
];

export function getBoxTemplate(id) {
  return BOX_TEMPLATES.find((t) => t.id === id) || BOX_TEMPLATES[0];
}
