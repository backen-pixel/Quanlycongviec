/**
 * Catalog ~60 rigid box dielines (Pacdora-style names).
 * Mỗi mẫu map vào 1 family có engine geometry thật.
 */

export const RIGID_BOX_FAMILIES = {
  lid_base: {
    id: 'lid_base',
    name: 'Âm dương (Lid & Base)',
    nameEn: 'Lid and base',
    desc: 'Khay đáy + nắp đậy riêng',
  },
  flip_top: {
    id: 'flip_top',
    name: 'Nắp lật (Flip top)',
    nameEn: 'Flip top / hinged lid',
    desc: 'Nắp liền bản lề với thân',
  },
  magnetic: {
    id: 'magnetic',
    name: 'Hộp nam châm',
    nameEn: 'Magnetic gift box',
    desc: 'Âm dương / flip có nam châm',
  },
  drawer: {
    id: 'drawer',
    name: 'Hộp kéo (Drawer)',
    nameEn: 'Drawer box',
    desc: 'Khay kéo trong ống sleeve',
  },
  sleeve_drawer: {
    id: 'sleeve_drawer',
    name: 'Sleeve + drawer',
    nameEn: 'Sleeve drawer',
    desc: 'Ống bọc + khay kéo',
  },
  double_door: {
    id: 'double_door',
    name: 'Hai cánh (Double door)',
    nameEn: 'Double door',
    desc: 'Hai nắp mở hai bên',
  },
  book: {
    id: 'book',
    name: 'Hộp sách (Book box)',
    nameEn: 'Book style box',
    desc: 'Bìa + gáy như sách',
  },
  shoulder: {
    id: 'shoulder',
    name: 'Shoulder / Neck',
    nameEn: 'Shoulder neck box',
    desc: 'Đáy + vai + nắp',
  },
  tall_bottle: {
    id: 'tall_bottle',
    name: 'Hộp chai cao',
    nameEn: 'Tall bottle box',
    desc: 'Tỷ lệ cao, nắp đậy',
  },
  tuck_end: {
    id: 'tuck_end',
    name: 'Tuck-end (tai gài)',
    nameEn: 'Tuck end carton',
    desc: 'Carton gài: dust flap + tuck flap + nếp gấp',
  },
};

/** @type {Array<{id:string,name:string,nameEn:string,family:string,category:string,defaults:object}>} */
export const RIGID_BOX_TEMPLATES = [
  // —— Lid & base / cosmetics ——
  { id: 'lid-base-classic', name: 'Hộp nắp đậy cơ bản', nameEn: 'Rigid box with lid', family: 'lid_base', category: 'gift', defaults: { L: 20, W: 15, H: 8, lidH: 3.5 } },
  { id: 'lid-base-luxury', name: 'Hộp luxury nắp đậy', nameEn: 'Luxury box with lid', family: 'lid_base', category: 'luxury', defaults: { L: 22, W: 16, H: 7, lidH: 3 } },
  { id: 'lid-base-luxury-366010', name: 'Luxury box with lid 366010', nameEn: 'Custom luxury box with lid 366010', family: 'lid_base', category: 'luxury', defaults: { L: 24, W: 18, H: 8, lidH: 3.5 } },
  { id: 'lid-base-360011', name: 'Luxury box with lid 360011', nameEn: 'Custom luxury box with lid 360011', family: 'lid_base', category: 'luxury', defaults: { L: 18, W: 18, H: 6, lidH: 2.5 } },
  { id: 'lid-base-366011', name: 'Luxury box with lid 366011', nameEn: 'Custom luxury box with lid 366011', family: 'lid_base', category: 'luxury', defaults: { L: 20, W: 12, H: 7, lidH: 3 } },
  { id: 'gift-with-lid', name: 'Gift box with lid', nameEn: 'Gift box with lid', family: 'lid_base', category: 'gift', defaults: { L: 25, W: 18, H: 8, lidH: 3.5 } },
  { id: 'square-with-lid', name: 'Square box with lid', nameEn: 'Square box with lid', family: 'lid_base', category: 'gift', defaults: { L: 16, W: 16, H: 8, lidH: 3.5 } },
  { id: 'open-gift', name: 'Open gift box', nameEn: 'Open gift box', family: 'lid_base', category: 'gift', defaults: { L: 20, W: 20, H: 10, lidH: 4 } },
  { id: 'gorgeous-gift', name: 'Gorgeous gift box', nameEn: 'Gorgeous gift box', family: 'lid_base', category: 'gift', defaults: { L: 28, W: 20, H: 9, lidH: 4 } },
  { id: 'premium-gift', name: 'Premium gift box', nameEn: 'Premium gift box', family: 'lid_base', category: 'gift', defaults: { L: 26, W: 18, H: 8, lidH: 3.5 } },
  { id: 'luxury-rigid', name: 'Luxury rigid box', nameEn: 'Luxury rigid box', family: 'lid_base', category: 'luxury', defaults: { L: 30, W: 22, H: 10, lidH: 4 } },
  { id: 'luxury-360151', name: 'Luxury rigid box 360151', nameEn: 'Custom luxury rigid box 360151', family: 'lid_base', category: 'luxury', defaults: { L: 22, W: 22, H: 7, lidH: 3 } },
  { id: 'luxury-360090', name: 'Luxury rigid box 360090', nameEn: 'Custom luxury rigid box 360090', family: 'lid_base', category: 'luxury', defaults: { L: 18, W: 12, H: 6, lidH: 2.5 } },
  { id: 'cosmetics-jar', name: 'Square cosmetics jar box', nameEn: 'Square cosmetics jar box', family: 'tuck_end', category: 'cosmetics', defaults: { L: 10, W: 10, H: 8 } },
  { id: 'cosmetics-box', name: 'Cosmetics box with lid', nameEn: 'Cosmetics box with lid', family: 'lid_base', category: 'cosmetics', defaults: { L: 14, W: 10, H: 6, lidH: 2.5 } },
  { id: 'face-cream-10001018', name: 'Face cream open tuck box', nameEn: 'Face Cream Open tuck end box', family: 'tuck_end', category: 'cosmetics', defaults: { L: 9, W: 9, H: 7 } },
  { id: 'perfume-lid', name: 'Perfume box with lid', nameEn: 'Perfume box with lid', family: 'lid_base', category: 'perfume', defaults: { L: 8, W: 8, H: 14, lidH: 3 } },
  { id: 'perfume-16001002', name: 'Perfume box 16001002', nameEn: 'Perfume box 16001002', family: 'lid_base', category: 'perfume', defaults: { L: 9, W: 7, H: 16, lidH: 3 } },
  { id: 'perfume-square-lid', name: 'Square perfume box with lid', nameEn: 'Square perfume box with lid', family: 'lid_base', category: 'perfume', defaults: { L: 10, W: 10, H: 12, lidH: 3 } },
  { id: 'perfume-deep', name: 'Deep square perfume box', nameEn: 'Deep square perfume box', family: 'lid_base', category: 'perfume', defaults: { L: 12, W: 12, H: 14, lidH: 3.5 } },
  { id: 'skincare-lid', name: 'Skincare box with lid', nameEn: 'Skincare box with lid', family: 'lid_base', category: 'cosmetics', defaults: { L: 12, W: 8, H: 10, lidH: 3 } },
  { id: 'hand-cream', name: 'Hand cream box with lid', nameEn: 'Hand cream box with lid', family: 'lid_base', category: 'cosmetics', defaults: { L: 8, W: 5, H: 12, lidH: 2.5 } },
  { id: 'face-wash', name: 'Face wash box with lid', nameEn: 'Box with lid face wash box', family: 'lid_base', category: 'cosmetics', defaults: { L: 7, W: 5, H: 16, lidH: 2.5 } },
  { id: 'serum-lid', name: 'Serum box with lid', nameEn: 'Serum box with lid', family: 'lid_base', category: 'cosmetics', defaults: { L: 5, W: 5, H: 14, lidH: 2 } },
  { id: 'body-lotion-lid', name: 'Body lotion box with lid', nameEn: 'Box with lid body lotion', family: 'lid_base', category: 'cosmetics', defaults: { L: 8, W: 6, H: 18, lidH: 3 } },
  { id: 'moisturizer', name: 'Moisturizer box with lid', nameEn: 'Box with lid moisturizer', family: 'lid_base', category: 'cosmetics', defaults: { L: 9, W: 9, H: 8, lidH: 2.5 } },
  { id: 'lotion-lid', name: 'Lotion box with lid', nameEn: 'Box with lid lotion box', family: 'lid_base', category: 'cosmetics', defaults: { L: 7, W: 7, H: 15, lidH: 2.5 } },
  { id: 'sunscreen', name: 'Sunscreen box', nameEn: 'Sunscreen box', family: 'lid_base', category: 'cosmetics', defaults: { L: 6, W: 4, H: 14, lidH: 2 } },
  { id: 'jewelry-gift', name: 'Jewelry gift box', nameEn: 'Jewelry gift box', family: 'lid_base', category: 'jewelry', defaults: { L: 12, W: 12, H: 4, lidH: 2 } },
  { id: 'square-jewelry', name: 'Square jewelry box', nameEn: 'Square jewelry box', family: 'lid_base', category: 'jewelry', defaults: { L: 10, W: 10, H: 4, lidH: 2 } },
  { id: 'jewelry-luxury', name: 'Jewelry luxury gift box', nameEn: 'Jewelry luxury gift box', family: 'lid_base', category: 'jewelry', defaults: { L: 14, W: 14, H: 5, lidH: 2.5 } },
  { id: 'luxury-jewelry', name: 'Luxury jewelry gift box', nameEn: 'Luxury jewelry gift box', family: 'lid_base', category: 'jewelry', defaults: { L: 16, W: 12, H: 5, lidH: 2.5 } },

  // —— Flip top / magnetic ——
  { id: 'flip-magnetic', name: 'Flip top magnetic gift box', nameEn: 'Flip top magnetic gift box', family: 'magnetic', category: 'gift', defaults: { L: 20, W: 15, H: 6, lidH: 6 } },
  { id: 'flip-magnetic-2', name: 'Flip top magnetic gift box (alt)', nameEn: 'Flip top magnetic gift box', family: 'magnetic', category: 'gift', defaults: { L: 22, W: 16, H: 5, lidH: 5 } },
  { id: 'magnetic-gift', name: 'Magnetic gift box', nameEn: 'Magnetic gift box', family: 'magnetic', category: 'gift', defaults: { L: 18, W: 12, H: 5, lidH: 5 } },
  { id: 'flip-jewelry', name: 'Flip top jewelry box', nameEn: 'Flip top jewelry box', family: 'flip_top', category: 'jewelry', defaults: { L: 12, W: 10, H: 4, lidH: 4 } },
  { id: 'flip-luxury', name: 'Flip top luxury rigid box', nameEn: 'Flip top luxury rigid box', family: 'flip_top', category: 'luxury', defaults: { L: 24, W: 18, H: 7, lidH: 7 } },
  { id: 'flip-skincare', name: 'Flip top square skincare box', nameEn: 'Flip top Square skincare box', family: 'flip_top', category: 'cosmetics', defaults: { L: 12, W: 12, H: 8, lidH: 8 } },
  { id: 'flip-perfume-mag', name: 'Flip top magnetic perfume box', nameEn: 'Flip top magnetic perfume box', family: 'magnetic', category: 'perfume', defaults: { L: 9, W: 9, H: 12, lidH: 12 } },
  { id: 'flip-body-lotion', name: 'Flip top body lotion box', nameEn: 'Flip top body lotion box', family: 'flip_top', category: 'cosmetics', defaults: { L: 8, W: 6, H: 16, lidH: 8 } },
  { id: 'flip-board-game', name: 'Flip top board game box', nameEn: 'Flip top board game box', family: 'flip_top', category: 'gift', defaults: { L: 30, W: 30, H: 8, lidH: 8 } },
  { id: 'flip-lotion', name: 'Flip top lotion box', nameEn: 'Flip top lotion box', family: 'flip_top', category: 'cosmetics', defaults: { L: 7, W: 7, H: 14, lidH: 7 } },
  { id: 'hinged-flip-lid', name: 'Hinged flip lid rigid box', nameEn: 'Hinged flip lid rigid box', family: 'flip_top', category: 'gift', defaults: { L: 20, W: 14, H: 6, lidH: 6 } },
  { id: 'surprise-gift', name: 'Surprise gift box', nameEn: 'Surprise gift box', family: 'flip_top', category: 'gift', defaults: { L: 16, W: 16, H: 10, lidH: 10 } },
  { id: 'surprise-gift-2', name: 'Surprise gift box (alt)', nameEn: 'Surprise gift box', family: 'flip_top', category: 'gift', defaults: { L: 18, W: 12, H: 9, lidH: 9 } },

  // —— Drawer / sleeve ——
  { id: 'drawer-gift', name: 'Drawer gift box', nameEn: 'Drawer gift box', family: 'drawer', category: 'gift', defaults: { L: 18, W: 12, H: 5 } },
  { id: 'square-drawer', name: 'Square drawer gift box', nameEn: 'Square drawer gift box', family: 'drawer', category: 'gift', defaults: { L: 14, W: 14, H: 5 } },
  { id: 'square-drawer-2', name: 'Square drawer gift box (alt)', nameEn: 'Square drawer gift box', family: 'drawer', category: 'gift', defaults: { L: 16, W: 16, H: 6 } },
  { id: 'sleeve-perfume', name: 'Sleeve drawer perfume box', nameEn: 'Sleeve drawer perfume box', family: 'sleeve_drawer', category: 'perfume', defaults: { L: 8, W: 8, H: 14 } },
  { id: 'sleeve-perfume-2', name: 'Sleeve drawer perfume 36201105', nameEn: 'Sleeve drawer perfume box', family: 'sleeve_drawer', category: 'perfume', defaults: { L: 9, W: 7, H: 15 } },
  { id: 'hotdog-tray', name: 'Hot dog tray box', nameEn: 'Hot dog tray box', family: 'sleeve_drawer', category: 'gift', defaults: { L: 22, W: 10, H: 6 } },

  // —— Double door ——
  { id: 'double-door-gift', name: 'Double door gift box', nameEn: 'Double door gift box', family: 'double_door', category: 'gift', defaults: { L: 24, W: 16, H: 8, lidH: 8 } },
  { id: 'double-door-rigid', name: 'Double door rigid gift box', nameEn: 'Double door rigid gift box', family: 'double_door', category: 'luxury', defaults: { L: 28, W: 18, H: 9, lidH: 9 } },
  { id: 'double-perfume', name: 'Square double opening perfume box', nameEn: 'Square double opening perfume box', family: 'double_door', category: 'perfume', defaults: { L: 12, W: 12, H: 12, lidH: 12 } },

  // —— Book ——
  { id: 'book-box', name: 'Book box with lid', nameEn: 'Book box with lid', family: 'book', category: 'luxury', defaults: { L: 22, W: 16, H: 5 } },
  { id: 'book-360100', name: 'Book box luxury 360100', nameEn: 'Custom book box luxury 360100', family: 'book', category: 'luxury', defaults: { L: 24, W: 18, H: 6 } },
  { id: 'book-360091', name: 'Book box luxury 360091', nameEn: 'Custom book box luxury 360091', family: 'book', category: 'luxury', defaults: { L: 20, W: 14, H: 4.5 } },
  { id: 'book-handle', name: 'Book box with handle 361030', nameEn: 'Book box with handle', family: 'book', category: 'luxury', defaults: { L: 26, W: 18, H: 7 } },
  { id: 'gifts-360150', name: 'Luxury gifts box 360150', nameEn: 'Custom luxury gifts box 360150', family: 'book', category: 'luxury', defaults: { L: 30, W: 22, H: 8 } },

  // —— Shoulder / tall ——
  { id: 'shoulder-360120', name: 'Shoulder / neck box 360120', nameEn: 'Shoulder box neck box 360120', family: 'shoulder', category: 'luxury', defaults: { L: 16, W: 12, H: 10, lidH: 3 } },
  { id: 'tall-bottle-362111', name: 'Tall bottle box 362111', nameEn: 'Tall box bottle box 362111', family: 'tall_bottle', category: 'perfume', defaults: { L: 8, W: 8, H: 22, lidH: 4 } },
  { id: 'tall-snap-362110', name: 'Tall bottle snap cover 362110', nameEn: 'Tall bottle box with snap cover', family: 'tall_bottle', category: 'perfume', defaults: { L: 7, W: 7, H: 20, lidH: 3.5 } },
];

export const RIGID_BOX_CATEGORIES = [
  { id: 'all', label: 'Tất cả' },
  { id: 'gift', label: 'Quà tặng' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'cosmetics', label: 'Mỹ phẩm' },
  { id: 'perfume', label: 'Nước hoa' },
  { id: 'jewelry', label: 'Trang sức' },
];

export function getTemplateById(id) {
  return RIGID_BOX_TEMPLATES.find((t) => t.id === id) || RIGID_BOX_TEMPLATES[0];
}

export function filterTemplates({ category = 'all', q = '', family = '' } = {}) {
  const query = String(q || '').trim().toLowerCase();
  return RIGID_BOX_TEMPLATES.filter((t) => {
    if (category && category !== 'all' && t.category !== category) return false;
    if (family && t.family !== family) return false;
    if (!query) return true;
    return (
      t.name.toLowerCase().includes(query) ||
      t.nameEn.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query)
    );
  });
}
