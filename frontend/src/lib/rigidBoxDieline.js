/**
 * Rigid box dieline engine — nhiều family (lid_base, flip_top, drawer, …).
 * Đơn vị nội bộ: mm. Input L,W,H,T,lidH theo cm.
 */

import { getTemplateById, RIGID_BOX_FAMILIES } from './rigidBoxCatalog.js';
import { buildPacdoraStyleDoubleDoor } from './rigidBoxDoubleDoor.js';
import {
  buildPacdoraLidBase,
  buildPacdoraFlipTop,
  buildPacdoraDrawer,
  buildPacdoraBook,
  buildPacdoraShoulder,
} from './rigidBoxPacdoraFamilies.js';
import { buildTuckEndCarton } from './rigidBoxTuckEnd.js';

export function cmToMm(cm) {
  return Number(cm) * 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function blankOf(width, height) {
  return { w: round2(width / 10), h: round2(height / 10) };
}

/** Khay thập (cross tray). dims mm */
export function buildTrayDieline(dims) {
  const L = round2(Number(dims.L) || 0);
  const W = round2(Number(dims.W) || 0);
  const H = round2(Number(dims.H) || 0);
  const T = round2(Number(dims.T) || 0);
  const ox = H;
  const oy = H;

  const panels = {
    bottom: { x: ox, y: oy, w: L, h: W, role: 'bottom' },
    left: { x: ox - H, y: oy, w: H, h: W, role: 'left' },
    right: { x: ox + L, y: oy, w: H, h: W, role: 'right' },
    back: { x: ox, y: oy - H, w: L, h: H, role: 'back' },
    front: { x: ox, y: oy + W, w: L, h: H, role: 'front' },
  };

  const cut = [
    [ox, 0],
    [ox + L, 0],
    [ox + L, oy],
    [ox + L + H, oy],
    [ox + L + H, oy + W],
    [ox + L, oy + W],
    [ox + L, oy + W + H],
    [ox, oy + W + H],
    [ox, oy + W],
    [0, oy + W],
    [0, oy],
    [ox, oy],
  ];

  const creases = [
    { x1: ox, y1: oy, x2: ox + L, y2: oy, edge: 'back' },
    { x1: ox, y1: oy + W, x2: ox + L, y2: oy + W, edge: 'front' },
    { x1: ox, y1: oy, x2: ox, y2: oy + W, edge: 'left' },
    { x1: ox + L, y1: oy, x2: ox + L, y2: oy + W, edge: 'right' },
  ];

  const width = L + 2 * H;
  const height = W + 2 * H;

  return {
    kind: 'tray',
    L,
    W,
    H,
    T,
    width,
    height,
    panels,
    cut,
    creases,
    blankSizeCm: blankOf(width, height),
  };
}

/** Flip-top: thân khay + panel nắp gắn cạnh sau (mở lên). */
export function buildFlipTopDieline(dims) {
  const L = round2(Number(dims.L) || 0);
  const W = round2(Number(dims.W) || 0);
  const H = round2(Number(dims.H) || 0);
  const lidH = round2(Number(dims.lidH) || H);
  const T = round2(Number(dims.T) || 0);

  const lidPanelH = lidH;
  const flap = Math.min(H * 0.35, 25);
  const ox = H;
  // y: 0..flap (dust), flap..flap+lidH (lid top), then tray with back wall
  const y0 = flap + lidPanelH;
  const oy = y0 + H;
  const panels = {
    dust: { x: ox, y: 0, w: L, h: flap, role: 'dust' },
    lidTop: { x: ox, y: flap, w: L, h: lidPanelH, role: 'lidTop' },
    back: { x: ox, y: y0, w: L, h: H, role: 'back' },
    bottom: { x: ox, y: oy, w: L, h: W, role: 'bottom' },
    front: { x: ox, y: oy + W, w: L, h: H, role: 'front' },
    left: { x: 0, y: oy, w: H, h: W, role: 'left' },
    right: { x: ox + L, y: oy, w: H, h: W, role: 'right' },
  };

  const properCut = [
    [ox, 0],
    [ox + L, 0],
    [ox + L, oy],
    [ox + L + H, oy],
    [ox + L + H, oy + W],
    [ox + L, oy + W],
    [ox + L, oy + W + H],
    [ox, oy + W + H],
    [ox, oy + W],
    [0, oy + W],
    [0, oy],
    [ox, oy],
    [ox, y0],
    [ox, 0],
  ];

  const creases = [
    { x1: ox, y1: flap, x2: ox + L, y2: flap, edge: 'lid-dust' },
    { x1: ox, y1: flap + lidPanelH, x2: ox + L, y2: flap + lidPanelH, edge: 'lid-hinge' },
    { x1: ox, y1: oy, x2: ox + L, y2: oy, edge: 'back-bottom' },
    { x1: ox, y1: oy + W, x2: ox + L, y2: oy + W, edge: 'front' },
    { x1: ox, y1: oy, x2: ox, y2: oy + W, edge: 'left' },
    { x1: ox + L, y1: oy, x2: ox + L, y2: oy + W, edge: 'right' },
    { x1: ox, y1: y0, x2: ox + L, y2: y0, edge: 'back-top' },
  ];

  const width = L + 2 * H;
  const height = oy + W + H;

  return {
    kind: 'flip_top',
    L,
    W,
    H,
    lidH,
    T,
    width,
    height,
    panels,
    cut: properCut,
    creases,
    blankSizeCm: blankOf(width, height),
  };
}

/** Drawer: khay trong + sleeve (ống chữ nhật mở 2 đầu — flatten as 4 panels strip). */
export function buildDrawerDieline(dims) {
  const L = round2(Number(dims.L) || 0);
  const W = round2(Number(dims.W) || 0);
  const H = round2(Number(dims.H) || 0);
  const T = round2(Number(dims.T) || 0);
  const clearance = round2(T * 2 + 1);

  const inner = buildTrayDieline({ L, W, H: Math.max(H - 2, H * 0.7), T });
  inner.kind = 'drawer_tray';
  inner.label = 'Khay kéo (inner)';

  // Sleeve unfold: front H x W, bottom L x W, back H x W, top L x W + glue tab
  const sL = L + clearance;
  const sW = W + clearance;
  const sH = H + clearance;
  const tab = 12;
  const sleeveWidth = sH + sL + sH + sL + tab;
  const sleeveHeight = sW;
  const sleeve = {
    kind: 'sleeve',
    L: sL,
    W: sW,
    H: sH,
    T,
    width: sleeveWidth,
    height: sleeveHeight,
    panels: {
      front: { x: 0, y: 0, w: sH, h: sW, role: 'front' },
      bottom: { x: sH, y: 0, w: sL, h: sW, role: 'bottom' },
      back: { x: sH + sL, y: 0, w: sH, h: sW, role: 'back' },
      top: { x: sH + sL + sH, y: 0, w: sL, h: sW, role: 'top' },
      tab: { x: sH + sL + sH + sL, y: 0, w: tab, h: sW, role: 'glue' },
    },
    cut: [
      [0, 0],
      [sleeveWidth, 0],
      [sleeveWidth, sW],
      [0, sW],
    ],
    creases: [
      { x1: sH, y1: 0, x2: sH, y2: sW, edge: 'c1' },
      { x1: sH + sL, y1: 0, x2: sH + sL, y2: sW, edge: 'c2' },
      { x1: sH + sL + sH, y1: 0, x2: sH + sL + sH, y2: sW, edge: 'c3' },
      { x1: sH + sL + sH + sL, y1: 0, x2: sH + sL + sH + sL, y2: sW, edge: 'c4' },
    ],
    blankSizeCm: blankOf(sleeveWidth, sleeveHeight),
    label: 'Ống sleeve',
  };

  return { kind: 'drawer', inner, sleeve, T };
}

/** Double door: Pacdora-style multi-part (hardboard + wrap + connection). */
export function buildDoubleDoorDieline(dims) {
  return buildPacdoraStyleDoubleDoor(dims);
}

/** Book box: cover strip (front + spine + back) + tray base. */
export function buildBookDieline(dims) {
  const L = round2(Number(dims.L) || 0);
  const W = round2(Number(dims.W) || 0);
  const H = round2(Number(dims.H) || 0);
  const T = round2(Number(dims.T) || 0);
  const spine = H + 2 * T;

  const base = buildTrayDieline({ L, W, H, T });
  base.label = 'Khay trong';

  const coverW = L + spine + L;
  const coverH = W;
  const cover = {
    kind: 'book_cover',
    L,
    W,
    H: spine,
    T,
    width: coverW,
    height: coverH,
    panels: {
      front: { x: 0, y: 0, w: L, h: W, role: 'front' },
      spine: { x: L, y: 0, w: spine, h: W, role: 'spine' },
      back: { x: L + spine, y: 0, w: L, h: W, role: 'back' },
    },
    cut: [
      [0, 0],
      [coverW, 0],
      [coverW, coverH],
      [0, coverH],
    ],
    creases: [
      { x1: L, y1: 0, x2: L, y2: coverH, edge: 'spine-l' },
      { x1: L + spine, y1: 0, x2: L + spine, y2: coverH, edge: 'spine-r' },
    ],
    blankSizeCm: blankOf(coverW, coverH),
    label: 'Bìa sách',
  };

  return { kind: 'book', base, cover, T };
}

/** Shoulder: base tray + shoulder collar (shallow tray) + lid. */
export function buildShoulderDieline(dims) {
  const L = round2(Number(dims.L) || 0);
  const W = round2(Number(dims.W) || 0);
  const H = round2(Number(dims.H) || 0);
  const lidH = round2(Number(dims.lidH) || Math.max(H * 0.3, 20));
  const T = round2(Number(dims.T) || 0);
  const shoulderH = round2(Math.min(H * 0.35, 30));

  const base = buildTrayDieline({ L, W, H, T });
  base.label = 'Đáy';
  const shoulder = buildTrayDieline({
    L: L + 2 * T + 1,
    W: W + 2 * T + 1,
    H: shoulderH,
    T,
  });
  shoulder.kind = 'shoulder';
  shoulder.label = 'Vai (shoulder)';
  const lid = buildTrayDieline({
    L: L + 4 * T + 2,
    W: W + 4 * T + 2,
    H: lidH,
    T,
  });
  lid.kind = 'lid';
  lid.label = 'Nắp';

  return { kind: 'shoulder', base, shoulder, lid, T };
}

export function buildLidBaseDieline(input) {
  const Lmm = cmToMm(input.L);
  const Wmm = cmToMm(input.W);
  const Hmm = cmToMm(input.H);
  const Tmm = cmToMm(input.T ?? 0.15);
  const fitMm = cmToMm(input.fit ?? 0.1);
  const lidHmm = cmToMm(input.lidH ?? Math.max(Number(input.H) * 0.45, 2));

  const lidL = Lmm + 2 * Tmm + fitMm;
  const lidW = Wmm + 2 * Tmm + fitMm;

  const base = buildTrayDieline({ L: Lmm, W: Wmm, H: Hmm, T: Tmm });
  base.label = 'Đáy hộp';
  const lid = buildTrayDieline({ L: lidL, W: lidW, H: lidHmm, T: Tmm });
  lid.kind = 'lid';
  lid.label = 'Nắp hộp';

  return {
    type: 'lid_and_base',
    family: 'lid_base',
    unit: 'mm',
    inputCm: normalizeInput(input),
    base,
    lid,
    parts: [base, lid],
  };
}

function normalizeInput(input) {
  return {
    L: Number(input.L) || 0,
    W: Number(input.W) || 0,
    H: Number(input.H) || 0,
    T: Number(input.T ?? 0.15),
    lidH: Number(input.lidH ?? Math.max(Number(input.H) * 0.45, 2)),
    fit: Number(input.fit ?? 0.1),
  };
}

function mmDims(input) {
  return {
    L: cmToMm(input.L),
    W: cmToMm(input.W),
    H: cmToMm(input.H),
    T: cmToMm(input.T ?? 0.15),
    lidH: cmToMm(input.lidH ?? input.H ?? 0),
  };
}

/**
 * Build dieline theo template catalog.
 */
export function buildDielineForTemplate(templateId, inputCm) {
  const tpl = getTemplateById(templateId);
  const input = {
    ...tpl.defaults,
    ...inputCm,
    T: inputCm.T ?? 0.15,
  };
  const family = tpl.family;
  const dims = mmDims(input);
  const meta = {
    templateId: tpl.id,
    templateName: tpl.name,
    family,
    familyMeta: RIGID_BOX_FAMILIES[family],
    unit: 'mm',
    inputCm: normalizeInput(input),
  };

  if (family === 'tuck_end') {
    const d = buildTuckEndCarton(dims);
    return { ...meta, type: 'tuck_end', family: 'tuck_end', ...d, parts: d.parts };
  }

  if (family === 'lid_base' || family === 'tall_bottle') {
    const d = buildPacdoraLidBase(dims, { magnetic: false });
    return { ...meta, type: family, family, ...d, parts: d.parts };
  }

  if (family === 'magnetic') {
    const d = buildPacdoraLidBase(dims, { magnetic: true });
    return { ...meta, type: 'magnetic', family: 'magnetic', ...d, parts: d.parts };
  }

  if (family === 'flip_top') {
    const d = buildPacdoraFlipTop(dims);
    return { ...meta, type: 'flip_top', family: 'flip_top', ...d, parts: d.parts, lid: null };
  }

  if (family === 'drawer') {
    const d = buildPacdoraDrawer(dims, false);
    return { ...meta, type: 'drawer', family: 'drawer', ...d, parts: d.parts, lid: null };
  }

  if (family === 'sleeve_drawer') {
    const d = buildPacdoraDrawer(dims, true);
    return { ...meta, type: 'sleeve_drawer', family: 'sleeve_drawer', ...d, parts: d.parts, lid: null };
  }

  if (family === 'double_door') {
    const d = buildDoubleDoorDieline(dims);
    return {
      ...meta,
      type: 'double_door',
      family: 'double_door',
      ...d,
      parts: d.parts,
      lid: null,
    };
  }

  if (family === 'book') {
    const d = buildPacdoraBook(dims);
    return { ...meta, type: 'book', family: 'book', ...d, parts: d.parts, lid: null };
  }

  if (family === 'shoulder') {
    const d = buildPacdoraShoulder(dims);
    return { ...meta, type: 'shoulder', family: 'shoulder', ...d, parts: d.parts };
  }

  const fallback = buildPacdoraLidBase(dims);
  return { ...meta, type: 'lid_base', family: 'lid_base', ...fallback, parts: fallback.parts };
}

function pointsToPath(pts, close = true) {
  if (!pts?.length) return '';
  const [x0, y0] = pts[0];
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
  if (close) d += ' Z';
  return d;
}

/** Mũi tên kích thước ngang (Pacdora-style). */
function dimHArrow(x1, x2, y, label, color = '#2563eb') {
  const mid = (x1 + x2) / 2;
  const tick = 2.2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="0.45"/>
    <line x1="${x1}" y1="${y - tick}" x2="${x1}" y2="${y + tick}" stroke="${color}" stroke-width="0.45"/>
    <line x1="${x2}" y1="${y - tick}" x2="${x2}" y2="${y + tick}" stroke="${color}" stroke-width="0.45"/>
    <polygon points="${x1},${y} ${x1 + 2.2},${y - 1.1} ${x1 + 2.2},${y + 1.1}" fill="${color}"/>
    <polygon points="${x2},${y} ${x2 - 2.2},${y - 1.1} ${x2 - 2.2},${y + 1.1}" fill="${color}"/>
    <rect x="${mid - Math.max(8, String(label).length * 1.6)}" y="${y - 4.2}" width="${Math.max(16, String(label).length * 3.2)}" height="5.2" rx="0.8" fill="#fff" fill-opacity="0.92"/>
    <text x="${mid}" y="${y - 0.6}" text-anchor="middle" font-size="2.6" font-weight="600" fill="${color}" font-family="system-ui,sans-serif">${label}</text>
  `;
}

function dimVArrow(y1, y2, x, label, color = '#2563eb') {
  const mid = (y1 + y2) / 2;
  const tick = 2.2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="0.45"/>
    <line x1="${x - tick}" y1="${y1}" x2="${x + tick}" y2="${y1}" stroke="${color}" stroke-width="0.45"/>
    <line x1="${x - tick}" y1="${y2}" x2="${x + tick}" y2="${y2}" stroke="${color}" stroke-width="0.45"/>
    <polygon points="${x},${y1} ${x - 1.1},${y1 + 2.2} ${x + 1.1},${y1 + 2.2}" fill="${color}"/>
    <polygon points="${x},${y2} ${x - 1.1},${y2 - 2.2} ${x + 1.1},${y2 - 2.2}" fill="${color}"/>
    <rect x="${x - 4.2}" y="${mid - Math.max(6, String(label).length * 1.4)}" width="5.2" height="${Math.max(12, String(label).length * 2.8)}" rx="0.8" fill="#fff" fill-opacity="0.92"/>
    <text x="${x - 1.5}" y="${mid}" text-anchor="middle" dominant-baseline="middle" font-size="2.6" font-weight="600" fill="${color}" font-family="system-ui,sans-serif" transform="rotate(-90 ${x - 1.5} ${mid})">${label}</text>
  `;
}

/**
 * Vẽ hộp 3D đã trải phẳng (net) — 1 mặt phẳng.
 * layout 'net' = fit blank, đủ mặt + kích thước (studio Pacdora).
 * layout 'sheet' = net nằm trên khổ giấy + diện tích khuôn.
 */
export function trayToSvg(tray, opts = {}) {
  const layout = opts.layout || 'net';
  if (layout === 'sheet') return trayToSvgOnSheet(tray, opts);
  return trayToSvgNet(tray, opts);
}

function roleLabel(role) {
  if (role === 'bottom') return 'Đáy';
  if (role === 'top' || role === 'lidTop') return 'Nắp';
  if (role === 'front') return 'Trước';
  if (role === 'back') return 'Sau';
  if (role === 'left') return 'Trái';
  if (role === 'right') return 'Phải';
  if (role === 'dust_flap' || role === 'dust') return 'Dust';
  if (role === 'tuck_flap' || role === 'tuck') return 'Tuck';
  return role || '';
}

/** Net trải gọn — đủ mặt + mũi tên kích thước (không khung khổ lớn). */
function trayToSvgNet(tray, opts = {}) {
  const title = opts.title || tray.label || 'Tray';
  const colBleed = '#22c55e';
  const colTrim = '#2563eb';
  const colCrease = '#dc2626';
  const pad = opts.pad ?? 18;
  const ox = pad;
  const oy = pad + 6;
  const netW = Number(tray.width) || 0;
  const netH = Number(tray.height) || 0;
  const vw = netW + pad * 2 + 16;
  const vh = netH + pad * 2 + 22;

  const shiftPts = (pts) => (pts || []).map(([x, y]) => [x + ox, y + oy]);

  const creaseLines = (tray.creases || [])
    .map(
      (c) =>
        `<line x1="${c.x1 + ox}" y1="${c.y1 + oy}" x2="${c.x2 + ox}" y2="${c.y2 + oy}" stroke="${colCrease}" stroke-width="0.9" stroke-dasharray="3 1.8" />`
    )
    .join('\n');

  const bleedPath = tray.bleed?.length
    ? `<path d="${pointsToPath(shiftPts(tray.bleed))}" fill="none" stroke="${colBleed}" stroke-width="0.7" stroke-dasharray="2 1.2" />`
    : '';

  const mat = tray.material || '';
  const fill =
    mat === 'wrapping' ? '#dbeafe' : mat === 'connection' ? '#fef3c7' : mat === 'carton' ? '#ffedd5' : '#fff7ed';

  const cutPaths = tray.cutPaths?.length
    ? tray.cutPaths
        .map(
          (poly) =>
            `<path d="${pointsToPath(shiftPts(poly))}" fill="${fill}" fill-opacity="0.55" stroke="${colTrim}" stroke-width="1.1" stroke-linejoin="round"/>`
        )
        .join('\n')
    : tray.cut?.length
      ? `<path d="${pointsToPath(shiftPts(tray.cut))}" fill="${fill}" fill-opacity="0.5" stroke="${colTrim}" stroke-width="1.1" stroke-linejoin="round"/>`
      : '';

  const panels = tray.panels || {};
  const panelShapes = Object.values(panels)
    .map((p) => {
      const x = p.x + ox;
      const y = p.y + oy;
      const label = roleLabel(p.role);
      const fs = Math.min(4.2, Math.max(2.4, Math.min(p.w, p.h) * 0.14));
      const wCm = round2(p.w / 10);
      const hCm = round2(p.h / 10);
      return `
        <rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="#ffffff" fill-opacity="0.35" stroke="#94a3b8" stroke-width="0.25"/>
        <text x="${x + p.w / 2}" y="${y + p.h / 2 - fs * 0.35}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="700" fill="#0f172a" font-family="system-ui,sans-serif">${label}</text>
        <text x="${x + p.w / 2}" y="${y + p.h / 2 + fs * 0.75}" text-anchor="middle" dominant-baseline="middle" font-size="${fs * 0.72}" fill="#64748b" font-family="system-ui,sans-serif">${wCm}×${hCm}</text>
      `;
    })
    .join('\n');

  const dims = [];
  const bottom = panels.bottom || panels.lidTop || Object.values(panels).find((p) => p.role === 'bottom' || p.role === 'lidTop');
  const left = panels.left;
  const right = panels.right;
  const front = panels.front;
  const back = panels.back;
  if (bottom && bottom.w > 10) {
    dims.push(dimHArrow(bottom.x + ox, bottom.x + ox + bottom.w, bottom.y + oy - 6, `${round2(bottom.w / 10)} cm`));
    dims.push(
      dimVArrow(bottom.y + oy, bottom.y + oy + bottom.h, bottom.x + ox + bottom.w + 6, `${round2(bottom.h / 10)} cm`)
    );
  }
  if (left && left.w > 8) {
    dims.push(dimHArrow(left.x + ox, left.x + ox + left.w, left.y + oy + left.h / 2, `${round2(left.w / 10)}`));
  }
  if (right && right.w > 8) {
    dims.push(dimHArrow(right.x + ox, right.x + ox + right.w, right.y + oy + right.h / 2, `${round2(right.w / 10)}`));
  }
  if (back && back.h > 8) {
    dims.push(dimVArrow(back.y + oy, back.y + oy + back.h, back.x + ox - 6, `${round2(back.h / 10)}`));
  }
  if (front && front.h > 8) {
    dims.push(dimVArrow(front.y + oy, front.y + oy + front.h, front.x + ox + front.w + 6, `${round2(front.h / 10)}`));
  }

  const blank = tray.blankSizeCm || { w: netW / 10, h: netH / 10 };
  const area = round2(Number(blank.w) * Number(blank.h));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}mm" height="${vh}mm">
  <title>${title}</title>
  <rect width="${vw}" height="${vh}" fill="#ffffff"/>
  <text x="${vw / 2}" y="10" text-anchor="middle" font-size="4" font-weight="700" fill="#1e293b" font-family="system-ui,sans-serif">${title}</text>
  ${cutPaths}
  ${bleedPath}
  ${creaseLines}
  ${panelShapes}
  ${dims.join('\n')}
  <text x="${vw / 2}" y="${vh - 5}" text-anchor="middle" font-size="2.8" fill="#64748b" font-family="system-ui,sans-serif">
    Blank ${round2(blank.w)}×${round2(blank.h)} cm · ${area} cm² · ${(area / 10000).toFixed(4)} m²
  </text>
  <g font-family="system-ui,sans-serif" font-size="2.4">
    <line x1="8" y1="${vh - 12}" x2="16" y2="${vh - 12}" stroke="${colBleed}" stroke-width="0.8"/>
    <text x="18" y="${vh - 11}" fill="#64748b">Bleed</text>
    <line x1="40" y1="${vh - 12}" x2="48" y2="${vh - 12}" stroke="${colTrim}" stroke-width="0.8"/>
    <text x="50" y="${vh - 11}" fill="#64748b">Trim</text>
    <line x1="72" y1="${vh - 12}" x2="80" y2="${vh - 12}" stroke="${colCrease}" stroke-width="0.8" stroke-dasharray="2 1"/>
    <text x="82" y="${vh - 11}" fill="#64748b">Crease</text>
  </g>
</svg>`;
}

function trayToSvgOnSheet(tray, opts = {}) {
  const title = opts.title || tray.label || 'Tray';
  const colBleed = '#22c55e';
  const colTrim = '#2563eb';
  const colCrease = '#dc2626';
  const colSheet = '#64748b';

  const blankCm = tray.blankSizeCm || { w: (tray.width || 0) / 10, h: (tray.height || 0) / 10 };
  const blankWmm = Number(blankCm.w) * 10;
  const blankHmm = Number(blankCm.h) * 10;

  const sheetWcm = Number(opts.sheetWCm) || Number(blankCm.w) + 4;
  const sheetHcm = Number(opts.sheetHCm) || Number(blankCm.h) + 4;
  let sheetWmm = sheetWcm * 10;
  let sheetHmm = sheetHcm * 10;
  sheetWmm = Math.max(sheetWmm, blankWmm + 20);
  sheetHmm = Math.max(sheetHmm, blankHmm + 20);

  const marginX = Math.max(12, (sheetWmm - blankWmm) / 2);
  const marginY = Math.max(16, (sheetHmm - blankHmm) / 2);
  const ox = marginX;
  const oy = marginY;

  const viewPad = 8;
  const vw = sheetWmm + viewPad * 2;
  const vh = sheetHmm + viewPad * 2 + 14;
  const vx = -viewPad;
  const vy = -viewPad - 8;

  const creaseLines = (tray.creases || [])
    .map(
      (c) =>
        `<line x1="${c.x1 + ox}" y1="${c.y1 + oy}" x2="${c.x2 + ox}" y2="${c.y2 + oy}" stroke="${colCrease}" stroke-width="0.65" stroke-dasharray="2.8 1.6" />`
    )
    .join('\n');

  const shiftPts = (pts) => (pts || []).map(([x, y]) => [x + ox, y + oy]);

  const bleedPath = tray.bleed?.length
    ? `<path d="${pointsToPath(shiftPts(tray.bleed))}" fill="none" stroke="${colBleed}" stroke-width="0.5" stroke-dasharray="1.8 1.1" />`
    : '';

  const mat = tray.material || '';
  const fill =
    mat === 'wrapping' ? '#dbeafe' : mat === 'connection' ? '#fef3c7' : mat === 'carton' ? '#ffedd5' : '#fff7ed';

  const cutPaths = tray.cutPaths?.length
    ? tray.cutPaths
        .map(
          (poly) =>
            `<path d="${pointsToPath(shiftPts(poly))}" fill="${fill}" fill-opacity="0.55" stroke="${colTrim}" stroke-width="0.85" stroke-linejoin="round"/>`
        )
        .join('\n')
    : tray.cut?.length
      ? `<path d="${pointsToPath(shiftPts(tray.cut))}" fill="${fill}" fill-opacity="0.5" stroke="${colTrim}" stroke-width="0.85" stroke-linejoin="round"/>`
      : '';

  const panelShapes = Object.values(tray.panels || {})
    .map((p) => {
      const x = p.x + ox;
      const y = p.y + oy;
      const label = roleLabel(p.role);
      const fs = Math.min(3.2, Math.max(2, Math.min(p.w, p.h) * 0.12));
      return `
        <rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="none" stroke="#94a3b8" stroke-width="0.2" stroke-dasharray="1 1" opacity="0.5"/>
        <text x="${x + p.w / 2}" y="${y + p.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" fill="#475569" font-family="system-ui,sans-serif" font-weight="600">${label}</text>
      `;
    })
    .join('\n');

  const blankAreaCm2 = round2(Number(blankCm.w) * Number(blankCm.h));
  const sheetAreaCm2 = round2(sheetWcm * sheetHcm);
  const util = sheetAreaCm2 > 0 ? round2((blankAreaCm2 / sheetAreaCm2) * 100) : 0;

  const sheetRect = `
    <rect x="0" y="0" width="${sheetWmm}" height="${sheetHmm}" fill="#f1f5f9" stroke="${colSheet}" stroke-width="0.7" stroke-dasharray="4 2"/>
    <text x="${sheetWmm / 2}" y="-3.5" text-anchor="middle" font-size="3.2" font-weight="700" fill="#334155" font-family="system-ui,sans-serif">${title}</text>
    ${dimHArrow(0, sheetWmm, sheetHmm + 6, `Khổ ${round2(sheetWcm)} cm`, colSheet)}
    <text x="4" y="${sheetHmm - 4}" font-size="2.4" fill="#64748b" font-family="system-ui,sans-serif">Khổ ${round2(sheetWcm)}×${round2(sheetHcm)} cm · ${sheetAreaCm2} cm²</text>
    <text x="4" y="${sheetHmm - 8}" font-size="2.4" fill="#059669" font-family="system-ui,sans-serif" font-weight="600">Blank ${round2(blankCm.w)}×${round2(blankCm.h)} cm · ${blankAreaCm2} cm² · ${util}%</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw + 14} ${vh + 10}" width="${vw}mm" height="${vh}mm">
  <title>${title}</title>
  <rect x="${vx}" y="${vy}" width="${vw + 14}" height="${vh + 10}" fill="#ffffff"/>
  ${sheetRect}
  <rect x="${ox}" y="${oy}" width="${blankWmm}" height="${blankHmm}" fill="none" stroke="#0ea5e9" stroke-width="0.4" stroke-dasharray="2 1.5"/>
  ${cutPaths}
  ${bleedPath}
  ${creaseLines}
  ${panelShapes}
</svg>`;
}

/** Khổ giấy chuẩn NEXTGO / kho thường dùng (cm). */
export const STANDARD_SHEETS = [
  { id: 'CB_109x65', label: 'Chipboard 109×65', w: 109, h: 65, type: 'chipboard' },
  { id: 'CB_109x74.5', label: 'Chipboard 109×74.5', w: 109, h: 74.5, type: 'chipboard' },
  { id: 'CB_109x81.5', label: 'Chipboard 109×81.5', w: 109, h: 81.5, type: 'chipboard' },
  { id: 'CB_113x81.5', label: 'Chipboard 113×81.5', w: 113, h: 81.5, type: 'chipboard' },
  { id: 'CB_82x120', label: 'Chipboard 82×120', w: 82, h: 120, type: 'chipboard' },
  { id: 'GIAY_65x86', label: 'Giấy 65×86', w: 65, h: 86, type: 'paper' },
  { id: 'GIAY_79x109', label: 'Giấy 79×109', w: 79, h: 109, type: 'paper' },
];

/**
 * Catalog chuẩn + khổ tự setup (ưu tiên ứng viên đầu).
 * @param {{ chipboardW?: number, chipboardH?: number, paperW?: number, paperH?: number }} [setup]
 */
export function buildSheetCatalog(setup = {}) {
  const list = [];
  const cbW = Number(setup.chipboardW);
  const cbH = Number(setup.chipboardH);
  const pW = Number(setup.paperW);
  const pH = Number(setup.paperH);
  if (cbW > 0 && cbH > 0) {
    list.push({
      id: 'CB_SETUP',
      label: `Chipboard setup ${cbW}×${cbH}`,
      w: cbW,
      h: cbH,
      type: 'chipboard',
    });
  }
  if (pW > 0 && pH > 0) {
    list.push({
      id: 'GIAY_SETUP',
      label: `Giấy setup ${pW}×${pH}`,
      w: pW,
      h: pH,
      type: 'paper',
    });
  }
  for (const s of STANDARD_SHEETS) {
    if (list.some((x) => x.type === s.type && Math.abs(x.w - s.w) < 0.05 && Math.abs(x.h - s.h) < 0.05)) continue;
    list.push(s);
  }
  return list;
}

/**
 * Tìm khổ + cách xếp vừa blank — ưu tiên loại đúng + khổ nhỏ nhất (vừa đủ).
 * @returns {{ sheet, layout: 'row'|'stack'|'single', placements, util, gapCm }}
 */
export function findBestSheetForPieces(piecesCm, sheets = STANDARD_SHEETS, gapCm = 1, preferredType = '') {
  const pieces = (piecesCm || [])
    .map((p) => ({
      w: Number(p.w) || 0,
      h: Number(p.h) || 0,
      id: p.id,
      label: p.label,
    }))
    .filter((p) => p.w > 0 && p.h > 0);
  if (!pieces.length) return null;

  const pieceArea = pieces.reduce((s, p) => s + p.w * p.h, 0);
  let best = null;

  const typeRank = (cand) => (preferredType && cand.sheet.type === preferredType ? 1 : 0);

  const orients = (p) => [
    { w: p.w, h: p.h, rotated: false },
    { w: p.h, h: p.w, rotated: true },
  ];

  /** Vừa đủ: đúng loại → diện tích khổ nhỏ hơn → util cao hơn */
  const consider = (cand) => {
    if (!best) {
      best = cand;
      return;
    }
    const tr = typeRank(cand) - typeRank(best);
    if (tr !== 0) {
      if (tr > 0) best = cand;
      return;
    }
    if (cand.sheet.areaCm2 < best.sheet.areaCm2 - 0.05) {
      best = cand;
      return;
    }
    if (cand.sheet.areaCm2 > best.sheet.areaCm2 + 0.05) return;
    if (cand.util > best.util) best = cand;
  };

  for (const sheet of sheets) {
    for (const [sw, sh] of [
      [sheet.w, sheet.h],
      [sheet.h, sheet.w],
    ]) {
      if (pieces.length === 1) {
        for (const a of orients(pieces[0])) {
          if (a.w + gapCm * 2 <= sw && a.h + gapCm * 2 <= sh) {
            const util = (pieceArea / (sw * sh)) * 100;
            const cand = {
              sheet: { ...sheet, w: sw, h: sh, areaCm2: round2(sw * sh) },
              layout: 'single',
              util: round2(util),
              gapCm,
              placements: [{ ...pieces[0], ...a, x: gapCm, y: gapCm }],
            };
            consider(cand);
          }
        }
        continue;
      }

      // 2 pieces
      const [p0, p1] = pieces;
      for (const a of orients(p0)) {
        for (const b of orients(p1)) {
          // row
          if (a.w + b.w + gapCm * 3 <= sw && Math.max(a.h, b.h) + gapCm * 2 <= sh) {
            const util = (pieceArea / (sw * sh)) * 100;
            const cand = {
              sheet: { ...sheet, w: sw, h: sh, areaCm2: round2(sw * sh) },
              layout: 'row',
              util: round2(util),
              gapCm,
              placements: [
                { ...p0, ...a, x: gapCm, y: gapCm },
                { ...p1, ...b, x: gapCm * 2 + a.w, y: gapCm },
              ],
            };
            consider(cand);
          }
          // stack
          if (Math.max(a.w, b.w) + gapCm * 2 <= sw && a.h + b.h + gapCm * 3 <= sh) {
            const util = (pieceArea / (sw * sh)) * 100;
            const cand = {
              sheet: { ...sheet, w: sw, h: sh, areaCm2: round2(sw * sh) },
              layout: 'stack',
              util: round2(util),
              gapCm,
              placements: [
                { ...p0, ...a, x: gapCm, y: gapCm },
                { ...p1, ...b, x: gapCm, y: gapCm * 2 + a.h },
              ],
            };
            consider(cand);
          }
        }
      }
    }
  }

  // Fallback: custom sheet = bounding of row layout
  if (!best && pieces.length) {
    const sorted = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h);
    let x = gapCm;
    let maxH = 0;
    const placements = sorted.map((p) => {
      const pl = { ...p, w: p.w, h: p.h, rotated: false, x, y: gapCm };
      x += p.w + gapCm;
      maxH = Math.max(maxH, p.h);
      return pl;
    });
    const sw = round2(x);
    const sh = round2(maxH + gapCm * 2);
    best = {
      sheet: {
        id: 'CUSTOM',
        label: `Khổ vừa ${sw}×${sh}`,
        w: sw,
        h: sh,
        areaCm2: round2(sw * sh),
        type: 'custom',
      },
      layout: 'row',
      util: round2((pieceArea / (sw * sh)) * 100),
      gapCm,
      placements,
    };
  }

  return best;
}

/**
 * Xếp lưới 1 blank trên khổ — trả về tối đa bản/khổ (xoay 90° nếu lời hơn).
 * @param {number|null} [copiesWanted] — giới hạn tay; null = đầy khổ
 */
export function nestPieceGrid(piece, sheetW, sheetH, gapCm = 0.8, copiesWanted = null) {
  const pw = Number(piece.w) || 0;
  const ph = Number(piece.h) || 0;
  const sw = Number(sheetW) || 0;
  const sh = Number(sheetH) || 0;
  if (pw <= 0 || ph <= 0 || sw <= 0 || sh <= 0) {
    return { placements: [], copies: 0, maxCopies: 0, cols: 0, rows: 0, cellW: pw, cellH: ph, rotated: false };
  }

  let best = null;
  for (const o of [
    { w: pw, h: ph, rotated: false },
    { w: ph, h: pw, rotated: true },
  ]) {
    const cols = Math.max(0, Math.floor((sw - gapCm) / (o.w + gapCm)));
    const rows = Math.max(0, Math.floor((sh - gapCm) / (o.h + gapCm)));
    const max = cols * rows;
    if (!best || max > best.max || (max === best.max && !o.rotated)) {
      best = { ...o, cols, rows, max };
    }
  }

  if (!best || best.max <= 0) {
    // Vẫn đặt 1 bản góc nếu blank lớn hơn khổ (cảnh báo)
    const fit = pw <= sw && ph <= sh;
    const o = fit ? { w: pw, h: ph, rotated: false } : { w: ph, h: pw, rotated: pw <= sh && ph <= sw };
    if (!((o.rotated ? ph : pw) <= sw && (o.rotated ? pw : ph) <= sh)) {
      return { placements: [], copies: 0, maxCopies: 0, cols: 0, rows: 0, cellW: pw, cellH: ph, rotated: false };
    }
    best = { ...o, cols: 1, rows: 1, max: 1 };
  }

  const maxCopies = best.max;
  let copies =
    copiesWanted != null && Number(copiesWanted) > 0
      ? Math.min(Math.floor(Number(copiesWanted)), maxCopies)
      : maxCopies;
  if (copies < 1) copies = Math.min(1, maxCopies);

  const placements = [];
  let n = 0;
  for (let r = 0; r < best.rows && n < copies; r++) {
    for (let c = 0; c < best.cols && n < copies; c++) {
      placements.push({
        id: piece.id,
        label: piece.label,
        w: best.w,
        h: best.h,
        rotated: best.rotated,
        x: gapCm + c * (best.w + gapCm),
        y: gapCm + r * (best.h + gapCm),
        copyIndex: n,
      });
      n++;
    }
  }

  const usedArea = copies * pw * ph;
  const util = round2((usedArea / (sw * sh)) * 100);

  return {
    placements,
    copies,
    maxCopies,
    cols: best.cols,
    rows: best.rows,
    cellW: best.w,
    cellH: best.h,
    rotated: best.rotated,
    util,
  };
}

/**
 * Xếp nhiều bộ (unit = danh sách placement đã chuẩn hoá) trên khổ.
 */
export function tileUnitOnSheet(unitPlacements, sheetW, sheetH, gapCm = 1.2, copiesWanted = null) {
  const pls = unitPlacements || [];
  if (!pls.length) {
    return { placements: [], copies: 0, maxCopies: 0, cols: 0, rows: 0, util: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of pls) {
    minX = Math.min(minX, pl.x);
    minY = Math.min(minY, pl.y);
    maxX = Math.max(maxX, pl.x + pl.w);
    maxY = Math.max(maxY, pl.y + pl.h);
  }
  const unitW = maxX - minX;
  const unitH = maxY - minY;
  const unitArea = pls.reduce((s, p) => s + p.w * p.h, 0);
  const normalized = pls.map((pl) => ({
    ...pl,
    x: pl.x - minX,
    y: pl.y - minY,
  }));

  const tryOrient = (uw, uh) => {
    const cols = Math.max(0, Math.floor((sheetW - gapCm) / (uw + gapCm)));
    const rows = Math.max(0, Math.floor((sheetH - gapCm) / (uh + gapCm)));
    return { cols, rows, max: cols * rows, uw, uh };
  };

  let best = tryOrient(unitW, unitH);
  const alt = tryOrient(unitH, unitW);
  const rotateUnit = alt.max > best.max;
  if (rotateUnit) best = alt;

  const maxCopies = best.max || 1;
  let copies =
    copiesWanted != null && Number(copiesWanted) > 0
      ? Math.min(Math.floor(Number(copiesWanted)), maxCopies)
      : maxCopies;
  if (copies < 1) copies = 1;

  const tiled = [];
  let n = 0;
  for (let r = 0; r < best.rows && n < copies; r++) {
    for (let c = 0; c < best.cols && n < copies; c++) {
      const ox = gapCm + c * (best.uw + gapCm);
      const oy = gapCm + r * (best.uh + gapCm);
      for (const pl of normalized) {
        if (rotateUnit) {
          // Xoay unit 90° quanh gốc: (x,y,w,h) → (y, unitW-x-w, h, w) rồi scale vào ô uw×uh=unitH×unitW
          const nx = pl.y;
          const ny = unitW - pl.x - pl.w;
          tiled.push({
            ...pl,
            w: pl.h,
            h: pl.w,
            rotated: !pl.rotated,
            x: ox + nx,
            y: oy + ny,
            copyIndex: n,
          });
        } else {
          tiled.push({ ...pl, x: ox + pl.x, y: oy + pl.y, copyIndex: n });
        }
      }
      n++;
    }
  }

  return {
    placements: tiled,
    copies,
    maxCopies,
    cols: best.cols,
    rows: best.rows,
    util: round2(((unitArea * copies) / (sheetW * sheetH)) * 100),
  };
}

function renderTrayAt(tray, oxMm, oyMm, opts = {}) {
  const colTrim = '#2563eb';
  const colCrease = '#dc2626';
  const colBleed = '#22c55e';
  const tw = Number(tray.width) || 0;
  const th = Number(tray.height) || 0;
  // Nếu blank bị xoay so với net gốc: scale/swap — đơn giản: không rotate geometry SVG, chỉ đặt theo size gốc.
  // Placement.rotated nghĩa là blank đã đổi W/H; net vẽ theo tọa độ gốc tray (không rotate mesh).
  const shiftPts = (pts) => (pts || []).map(([x, y]) => [x + oxMm, y + oyMm]);
  const fill = '#fff7ed';

  const cut = tray.cutPaths?.length
    ? tray.cutPaths
        .map(
          (poly) =>
            `<path d="${pointsToPath(shiftPts(poly))}" fill="${fill}" fill-opacity="0.55" stroke="${colTrim}" stroke-width="1.15" stroke-linejoin="round"/>`
        )
        .join('\n')
    : tray.cut?.length
      ? `<path d="${pointsToPath(shiftPts(tray.cut))}" fill="${fill}" fill-opacity="0.55" stroke="${colTrim}" stroke-width="1.15" stroke-linejoin="round"/>`
      : '';

  const creases = (tray.creases || [])
    .map(
      (c) =>
        `<line x1="${c.x1 + oxMm}" y1="${c.y1 + oyMm}" x2="${c.x2 + oxMm}" y2="${c.y2 + oyMm}" stroke="${colCrease}" stroke-width="1" stroke-dasharray="3.2 1.8"/>`
    )
    .join('\n');

  const bleed = tray.bleed?.length
    ? `<path d="${pointsToPath(shiftPts(tray.bleed))}" fill="none" stroke="${colBleed}" stroke-width="0.75" stroke-dasharray="2.2 1.2"/>`
    : '';

  const isLid = /lid|nắp|nap/i.test(String(tray.kind || '') + String(tray.label || ''));
  const compact = !!opts.compact;
  const panels = Object.values(tray.panels || {})
    .map((p) => {
      const x = p.x + oxMm;
      const y = p.y + oyMm;
      let label = roleLabel(p.role);
      if (isLid && p.role === 'bottom') label = 'Nắp';
      const fs = Math.min(compact ? 3.6 : 5.2, Math.max(2.4, Math.min(p.w, p.h) * (compact ? 0.12 : 0.15)));
      const wCm = round2(p.w / 10);
      const hCm = round2(p.h / 10);
      if (compact) {
        return `
        <rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="#ffffff" fill-opacity="0.35" stroke="#94a3b8" stroke-width="0.3"/>
        <text x="${x + p.w / 2}" y="${y + p.h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="700" fill="#475569" font-family="system-ui,sans-serif">${label}</text>
      `;
      }
      return `
        <rect x="${x}" y="${y}" width="${p.w}" height="${p.h}" fill="#ffffff" fill-opacity="0.4" stroke="#64748b" stroke-width="0.35"/>
        <text x="${x + p.w / 2}" y="${y + p.h / 2 - fs * 0.35}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${label}</text>
        <text x="${x + p.w / 2}" y="${y + p.h / 2 + fs * 0.85}" text-anchor="middle" font-size="${fs * 0.78}" font-weight="600" fill="#1d4ed8" font-family="system-ui,sans-serif">${wCm} × ${hCm} cm</text>
      `;
    })
    .join('\n');

  const bottom = tray.panels?.bottom || tray.panels?.lidTop;
  const dims = [];
  if (!compact && bottom) {
    dims.push(
      dimHArrow(bottom.x + oxMm, bottom.x + oxMm + bottom.w, bottom.y + oyMm - 7, `${round2(bottom.w / 10)} cm`)
    );
    dims.push(
      dimVArrow(
        bottom.y + oyMm,
        bottom.y + oyMm + bottom.h,
        bottom.x + oxMm + bottom.w + 7,
        `${round2(bottom.h / 10)} cm`
      )
    );
  }

  const shortTitle =
    opts.caption ||
    (tray.label || tray.kind || '')
      .replace(/Hard board paper of /i, '')
      .replace(/\(.*?\)/g, '')
      .trim() ||
    tray.kind;

  const titleEl = compact
    ? `<text x="${oxMm + tw / 2}" y="${oyMm - 4}" text-anchor="middle" font-size="2.8" font-weight="700" fill="#64748b" font-family="system-ui,sans-serif">${shortTitle}</text>`
    : `<text x="${oxMm + tw / 2}" y="${oyMm - 10}" text-anchor="middle" font-size="4.2" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${shortTitle}</text>`;

  return `
    ${titleEl}
    ${cut}${bleed}${creases}${panels}${dims.join('\n')}
  `;
}

/**
 * Gộp đáy + nắp trên 1 khổ giấy vừa nhất.
 * @param {object} [opts]
 * @param {'auto'|'manual'} [opts.sheetMode]
 * @param {{ chipboardW?: number, chipboardH?: number, paperW?: number, paperH?: number }} [opts.sheetSetup]
 */
export function composeNetsToSvg(trays, opts = {}) {
  const list = (trays || []).filter(Boolean);
  if (!list.length) return { svg: '', nest: null };

  const pieces = list.map((t, i) => {
    const b = t.blankSizeCm || { w: (t.width || 0) / 10, h: (t.height || 0) / 10 };
    return {
      id: t.kind || `p${i}`,
      label: t.label || t.kind,
      w: Number(b.w),
      h: Number(b.h),
      tray: t,
    };
  });

  const preferredType = list.every((t) => t.material === 'wrapping') ? 'paper' : 'chipboard';
  const setup = opts.sheetSetup || {};
  const mode = opts.sheetMode === 'manual' ? 'manual' : 'auto';

  let sheets;
  if (mode === 'manual') {
    const w = preferredType === 'paper' ? Number(setup.paperW) : Number(setup.chipboardW);
    const h = preferredType === 'paper' ? Number(setup.paperH) : Number(setup.chipboardH);
    if (w > 0 && h > 0) {
      sheets = [
        {
          id: 'MANUAL',
          label: preferredType === 'paper' ? `Giấy ${w}×${h}` : `Chipboard ${w}×${h}`,
          w,
          h,
          type: preferredType,
        },
      ];
    } else {
      sheets = buildSheetCatalog(setup);
    }
  } else {
    sheets = buildSheetCatalog(setup);
  }

  const ordered =
    preferredType === 'paper'
      ? [...sheets.filter((s) => s.type === 'paper'), ...sheets.filter((s) => s.type !== 'paper')]
      : [...sheets.filter((s) => s.type === 'chipboard'), ...sheets.filter((s) => s.type !== 'chipboard')];

  const gapCm = 1.2;
  const copiesByPart =
    opts.copiesByPart && typeof opts.copiesByPart === 'object' ? opts.copiesByPart : null;
  const resolveCopiesWanted = (piece) => {
    if (copiesByPart) {
      const raw = copiesByPart[piece.id] ?? copiesByPart[piece.kind];
      if (raw != null && Number(raw) > 0) return Math.floor(Number(raw));
    }
    if (opts.copiesPerSheet != null && Number(opts.copiesPerSheet) > 0) {
      return Math.floor(Number(opts.copiesPerSheet));
    }
    return null;
  };

  // Chọn khổ: ưu tiên util khi xếp đầy lưới (nhiều bản/khổ), rồi đúng loại NVL.
  let sheet = null;
  let sheetScore = -1;
  for (const cand of ordered) {
    for (const [sw, sh] of [
      [cand.w, cand.h],
      [cand.h, cand.w],
    ]) {
      let totalUtil = 0;
      let totalMax = 0;
      let ok = true;
      for (const piece of pieces) {
        const g = nestPieceGrid(piece, sw, sh, gapCm, null);
        if (g.maxCopies <= 0) {
          ok = false;
          break;
        }
        totalUtil += g.util;
        totalMax += g.maxCopies;
      }
      if (!ok) continue;
      const typeBonus = cand.type === preferredType ? 20 : 0;
      const score = totalUtil / pieces.length + typeBonus + Math.min(totalMax, 40) * 0.05;
      if (score > sheetScore) {
        sheetScore = score;
        sheet = { ...cand, w: sw, h: sh, areaCm2: round2(sw * sh) };
      }
    }
  }

  if (!sheet) {
    const unit = findBestSheetForPieces(pieces, ordered, gapCm, preferredType);
    if (!unit) {
      return { svg: trayToSvgNet(list[0], { title: opts.title || 'Dieline' }), nest: null };
    }
    sheet = unit.sheet;
  }

  // Mỗi blank = 1 khuôn: xếp lưới N bản trên khổ (có thể tùy chỉnh từng mặt)
  const partNests = pieces.map((piece) => {
    const grid = nestPieceGrid(piece, sheet.w, sheet.h, gapCm, resolveCopiesWanted(piece));
    return { piece, ...grid };
  });

  const margin = 14;
  const header = 18;
  const bandGap = 16;
  const bandLabelH = 10;
  const footer = 24;
  const sheetWmm = sheet.w * 10;
  const sheetHmm = sheet.h * 10;
  const bandH = sheetHmm + bandLabelH + 14;
  const vw = sheetWmm + margin * 2 + 28;
  const vh = header + margin + partNests.length * bandH + (partNests.length - 1) * bandGap + footer;
  const colSheet = '#475569';
  const blocks = [];

  partNests.forEach((pn, bi) => {
    const oyBand = margin + header + bi * (bandH + bandGap);
    const ox0 = margin;
    const oy0 = oyBand + bandLabelH;
    const short =
      pn.piece.label?.replace(/Hard board paper of /i, '').replace(/\(.*?\)/g, '').trim() ||
      pn.piece.id;
    blocks.push(`
      <text x="${ox0}" y="${oyBand + 7}" font-size="4.2" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${short} · ${pn.copies}/${pn.maxCopies} bản/khổ · chiếm ${pn.util}%</text>
      <rect x="${ox0}" y="${oy0}" width="${sheetWmm}" height="${sheetHmm}" fill="#f1f5f9" stroke="${colSheet}" stroke-width="1.1" stroke-dasharray="5 3"/>
      ${dimHArrow(ox0, ox0 + sheetWmm, oy0 + sheetHmm + 7, `${sheet.w} cm`, colSheet)}
      ${dimVArrow(oy0, oy0 + sheetHmm, ox0 + sheetWmm + 7, `${sheet.h} cm`, colSheet)}
    `);

    const tray = pn.piece.tray;
    const detailLimit = 18; // vẽ đủ chi tiết; bản sau vẽ khung blank
    for (const pl of pn.placements) {
      const xMm = ox0 + pl.x * 10;
      const yMm = oy0 + pl.y * 10;
      const bw = pl.w * 10;
      const bh = pl.h * 10;
      const showDetail = pl.copyIndex < detailLimit;
      if (showDetail) {
        if (pl.rotated) {
          blocks.push(`
            <g transform="translate(${xMm + bw}, ${yMm}) rotate(90)" opacity="${pl.copyIndex === 0 ? 1 : 0.92}">
              ${renderTrayAt(tray, 0, 0, {
                caption: pl.copyIndex === 0 ? short : `#${pl.copyIndex + 1}`,
                compact: pl.copyIndex > 0,
              })}
            </g>
          `);
        } else {
          blocks.push(`
            <g opacity="${pl.copyIndex === 0 ? 1 : 0.92}">
              ${renderTrayAt(tray, xMm, yMm, {
                caption: pl.copyIndex === 0 ? short : `#${pl.copyIndex + 1}`,
                compact: pl.copyIndex > 0,
              })}
            </g>
          `);
        }
      } else {
        blocks.push(`
          <rect x="${xMm}" y="${yMm}" width="${bw}" height="${bh}" fill="#fff7ed" fill-opacity="0.7" stroke="#2563eb" stroke-width="0.9"/>
          <text x="${xMm + bw / 2}" y="${yMm + bh / 2}" text-anchor="middle" dominant-baseline="middle" font-size="3.2" font-weight="700" fill="#334155">#${pl.copyIndex + 1}</text>
        `);
      }
      blocks.push(
        `<rect x="${xMm}" y="${yMm}" width="${bw}" height="${bh}" fill="none" stroke="#0ea5e9" stroke-width="0.5" stroke-dasharray="3 2"/>`
      );
    }
  });

  const blankArea = pieces.reduce((s, p) => s + p.w * p.h, 0);
  const copiesSummary = partNests.map((p) => `${p.copies} bản`).join(' + ');
  const avgUtil = round2(partNests.reduce((s, p) => s + p.util, 0) / Math.max(partNests.length, 1));
  const title = opts.title || 'Xếp bản trên khổ / khuôn';
  const nest = {
    sheet,
    layout: 'grid',
    util: avgUtil,
    gapCm,
    copies: partNests[0]?.copies ?? 0,
    maxCopies: partNests[0]?.maxCopies ?? 0,
    partNests: partNests.map((p) => ({
      id: p.piece.id,
      label: p.piece.label,
      copies: p.copies,
      maxCopies: p.maxCopies,
      util: p.util,
      cols: p.cols,
      rows: p.rows,
      blank: { w: p.piece.w, h: p.piece.h },
    })),
    placements: partNests.flatMap((p) => p.placements),
  };

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}mm" height="${vh}mm">
  <title>${title}</title>
  <rect width="${vw}" height="${vh}" fill="#ffffff"/>
  <text x="${vw / 2}" y="12" text-anchor="middle" font-size="5" font-weight="800" fill="#0f172a" font-family="system-ui,sans-serif">${title}</text>
  ${blocks.join('\n')}
  <text x="${vw / 2}" y="${vh - 10}" text-anchor="middle" font-size="3.2" font-weight="700" fill="#059669" font-family="system-ui,sans-serif">
    ${sheet.label || sheet.id} · ${sheet.w}×${sheet.h} cm · ${copiesSummary} / khổ · blank ${round2(blankArea)} cm² · chiếm ~${avgUtil}%
  </text>
  <g font-family="system-ui,sans-serif" font-size="2.6">
    <line x1="${margin}" y1="${vh - 18}" x2="${margin + 10}" y2="${vh - 18}" stroke="#22c55e" stroke-width="1"/>
    <text x="${margin + 12}" y="${vh - 17}" fill="#64748b">Bleed</text>
    <line x1="${margin + 36}" y1="${vh - 18}" x2="${margin + 46}" y2="${vh - 18}" stroke="#2563eb" stroke-width="1"/>
    <text x="${margin + 48}" y="${vh - 17}" fill="#64748b">Trim</text>
    <line x1="${margin + 72}" y1="${vh - 18}" x2="${margin + 82}" y2="${vh - 18}" stroke="#dc2626" stroke-width="1" stroke-dasharray="2 1"/>
    <text x="${margin + 84}" y="${vh - 17}" fill="#64748b">Crease</text>
    <line x1="${margin + 110}" y1="${vh - 18}" x2="${margin + 120}" y2="${vh - 18}" stroke="${colSheet}" stroke-width="1" stroke-dasharray="3 2"/>
    <text x="${margin + 122}" y="${vh - 17}" fill="#64748b">Khổ / khuôn</text>
  </g>
</svg>`;

  return { svg, nest, blankAreaCm2: round2(blankArea) };
}

/**
 * Chọn 1–2 tấm hardboard → 1 SVG trên khổ giấy vừa nhất.
 * @param {object} [opts] — sheetMode / sheetSetup (xem composeNetsToSvg)
 */
export function modelToPrimaryFlat(model, opts = {}) {
  const parts = model?.parts || [];
  const withPanels = parts.filter((p) => p.panels && Object.keys(p.panels).length >= 3);
  const hardboards = withPanels.filter((p) => p.material === 'hardboard' || !p.material);
  const pick = hardboards.length ? hardboards.slice(0, 2) : withPanels.slice(0, 1);
  const trays = pick.length ? pick : parts.slice(0, 1);

  const name = model?.templateName || model?.name || model?.templateId || 'Hộp';
  const composed = composeNetsToSvg(trays, {
    title: `${name} · xếp bản trên khổ / khuôn`,
    sheetMode: opts.sheetMode,
    sheetSetup: opts.sheetSetup,
    copiesPerSheet: opts.copiesPerSheet,
    copiesByPart: opts.copiesByPart,
  });
  const svg = typeof composed === 'string' ? composed : composed.svg;
  const nest = typeof composed === 'object' ? composed.nest : null;
  const blankAreaCm2 =
    typeof composed === 'object' && composed.blankAreaCm2
      ? composed.blankAreaCm2
      : trays.reduce((s, t) => {
          const b = t.blankSizeCm || { w: 0, h: 0 };
          return s + Number(b.w) * Number(b.h);
        }, 0);

  const faceNames = [];
  for (const t of trays) {
    const isLid = /lid|nắp|nap/i.test(String(t.kind || '') + String(t.label || ''));
    for (const p of Object.values(t.panels || {})) {
      let lb = roleLabel(p.role);
      if (isLid && p.role === 'bottom') lb = 'Nắp';
      if (lb && !faceNames.includes(lb)) faceNames.push(lb);
    }
  }

  const sheet = nest?.sheet || null;

  return {
    id: 'primary-flat',
    title: `${name} · trải 2D trên khổ giấy`,
    svg,
    blank: trays[0]?.blankSizeCm || { w: 0, h: 0 },
    areaCm2: round2(blankAreaCm2),
    areaM2: round2(blankAreaCm2) / 10000,
    faces: faceNames,
    material: trays[0]?.material || 'hardboard',
    filename: `${model?.templateId || 'box'}-flat-sheet.svg`,
    partsUsed: trays.length,
    sheet,
    nest,
  };
}

export function modelToSvgParts(model, sheetOpts = {}) {
  const parts = model.parts || [];
  return parts.map((p, i) => {
    const blank = p.blankSizeCm || { w: (p.width || 0) / 10, h: (p.height || 0) / 10 };
    const areaCm2 = Number(blank.w || 0) * Number(blank.h || 0);
    const isPaper = p.material === 'wrapping' || p.material === 'carton';
    const sheetWCm = sheetOpts.sheetWCm ?? (isPaper ? 79 : 109);
    const sheetHCm = sheetOpts.sheetHCm ?? (isPaper ? 109 : 81.5);
    return {
      id: p.kind || `part-${i}`,
      title: p.label || p.kind || `Part ${i + 1}`,
      svg: trayToSvg(p, {
        title: p.label || p.kind,
        layout: sheetOpts.layout || 'net',
        sheetWCm,
        sheetHCm,
      }),
      blank,
      areaCm2,
      areaM2: areaCm2 / 10000,
      sheet: { w: sheetWCm, h: sheetHCm, areaCm2: sheetWCm * sheetHCm },
      material: p.material || 'hardboard',
      filename: `${model.templateId || 'box'}-${p.kind || i}.svg`,
    };
  });
}

/** @deprecated use modelToSvgParts */
export function lidBaseToSvgBundle(model) {
  const parts = modelToSvgParts(model);
  return {
    baseSvg: parts[0]?.svg || '',
    lidSvg: parts[1]?.svg || '',
    parts,
  };
}

export function downloadSvg(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'rigid-box.svg';
  a.click();
  URL.revokeObjectURL(url);
}
