/**
 * Pacdora-style multi-part builders cho các họ rigid box còn lại.
 * Mỗi part: cut (trim), crease, bleed — đơn vị mm.
 */

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function blank(w, h) {
  return { w: r2(w / 10), h: r2(h / 10) };
}

function rectBleed(w, h, pad = 2) {
  return [
    [-pad, -pad],
    [w + pad, -pad],
    [w + pad, h + pad],
    [-pad, h + pad],
  ];
}

function expandBleed(cut, pad = 2.5) {
  if (!cut?.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of cut) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return cut.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * pad, y + (dy / len) * pad];
  });
}

/** Cross tray hardboard */
export function hardboardCross({ L, W, H, T, kind, label }) {
  const ox = H;
  const oy = H;
  const width = L + 2 * H;
  const height = W + 2 * H;
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
    { x1: ox, y1: oy, x2: ox + L, y2: oy },
    { x1: ox, y1: oy + W, x2: ox + L, y2: oy + W },
    { x1: ox, y1: oy, x2: ox, y2: oy + W },
    { x1: ox + L, y1: oy, x2: ox + L, y2: oy + W },
  ];
  return {
    kind,
    material: 'hardboard',
    label,
    L,
    W,
    H,
    T,
    width,
    height,
    panels: {
      bottom: { x: ox, y: oy, w: L, h: W, role: 'bottom' },
      left: { x: 0, y: oy, w: H, h: W, role: 'left' },
      right: { x: ox + L, y: oy, w: H, h: W, role: 'right' },
      back: { x: ox, y: 0, w: L, h: H, role: 'back' },
      front: { x: ox, y: oy + W, w: L, h: H, role: 'front' },
    },
    cut,
    creases,
    bleed: expandBleed(cut, 2),
    blankSizeCm: blank(width, height),
  };
}

export function wrappingCross(board, wrapIn = 16, label) {
  const { L, W, H, T } = board;
  const bL = L + 2 * T;
  const bW = W + 2 * T;
  const wall = H;
  const wi = wrapIn;
  const arm = wall + wi;
  const ox = arm;
  const oy = arm;
  const width = bL + 2 * arm;
  const height = bW + 2 * arm;
  const cut = [
    [ox, 0],
    [ox + bL, 0],
    [ox + bL, wi],
    [ox + bL + wi, wi],
    [ox + bL + wi, oy],
    [ox + bL + arm, oy],
    [ox + bL + arm, oy + bW],
    [ox + bL + wi, oy + bW],
    [ox + bL + wi, oy + bW + wi],
    [ox + bL, oy + bW + wi],
    [ox + bL, oy + bW + arm],
    [ox, oy + bW + arm],
    [ox, oy + bW + wi],
    [ox - wi, oy + bW + wi],
    [ox - wi, oy + bW],
    [0, oy + bW],
    [0, oy],
    [ox - wi, oy],
    [ox - wi, wi],
    [ox, wi],
  ];
  const creases = [
    { x1: ox, y1: oy, x2: ox + bL, y2: oy },
    { x1: ox, y1: oy + bW, x2: ox + bL, y2: oy + bW },
    { x1: ox, y1: oy, x2: ox, y2: oy + bW },
    { x1: ox + bL, y1: oy, x2: ox + bL, y2: oy + bW },
    { x1: ox, y1: wi, x2: ox + bL, y2: wi },
    { x1: ox, y1: oy + bW + wall, x2: ox + bL, y2: oy + bW + wall },
    { x1: wi, y1: oy, x2: wi, y2: oy + bW },
    { x1: ox + bL + wall, y1: oy, x2: ox + bL + wall, y2: oy + bW },
  ];
  return {
    kind: `${board.kind}_wrap`,
    material: 'wrapping',
    label: label || 'Wrapping paper',
    L: bL,
    W: bW,
    H: arm,
    T,
    width,
    height,
    panels: {
      bottom: { x: ox, y: oy, w: bL, h: bW, role: 'bottom' },
      left: { x: 0, y: oy, w: arm, h: bW, role: 'left+wrap' },
      right: { x: ox + bL, y: oy, w: arm, h: bW, role: 'right+wrap' },
      back: { x: ox, y: 0, w: bL, h: arm, role: 'back+wrap' },
      front: { x: ox, y: oy + bW, w: bL, h: arm, role: 'front+wrap' },
    },
    cut,
    creases,
    bleed: expandBleed(cut, 3),
    blankSizeCm: blank(width, height),
  };
}

function flatBoard({ L, W, T, kind, label, material = 'hardboard' }) {
  return {
    kind,
    material,
    label,
    L,
    W,
    H: 0,
    T,
    width: L,
    height: W,
    panels: { panel: { x: 0, y: 0, w: L, h: W, role: 'panel' } },
    cut: [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ],
    creases: [],
    bleed: rectBleed(L, W, 2),
    blankSizeCm: blank(L, W),
  };
}

function connectionStrip({ W, T, side, label }) {
  const sw = r2(16 + T * 2);
  const sh = r2(W + 8);
  return {
    kind: `connection_${side || 'c'}`,
    material: 'connection',
    label: label || `${side} - Connection paper`,
    side,
    L: sw,
    W: sh,
    H: 0,
    T,
    width: sw,
    height: sh,
    panels: { strip: { x: 0, y: 0, w: sw, h: sh, role: 'connection' } },
    cut: [
      [0, 0],
      [sw, 0],
      [sw, sh],
      [0, sh],
    ],
    creases: [{ x1: sw / 2, y1: 0, x2: sw / 2, y2: sh }],
    bleed: rectBleed(sw, sh, 2),
    blankSizeCm: blank(sw, sh),
  };
}

/** Lid & base / magnetic / tall bottle */
export function buildPacdoraLidBase(dims, opts = {}) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const T = r2(dims.T || 1.5);
  const lidH = r2(dims.lidH || Math.max(H * 0.45, 20));
  const fit = r2(opts.fit ?? T * 0.5 + 1);
  const magnetic = !!opts.magnetic;

  const baseBoard = hardboardCross({
    L,
    W,
    H,
    T,
    kind: 'base_hardboard',
    label: 'Hard board paper of base (interior)',
  });
  const baseWrap = wrappingCross(baseBoard, 16, 'Wrapping paper of base');

  const lidL = r2(L + 2 * T + fit);
  const lidW = r2(W + 2 * T + fit);
  const lidBoard = hardboardCross({
    L: lidL,
    W: lidW,
    H: lidH,
    T,
    kind: 'lid_hardboard',
    label: 'Hard board paper of lid (exterior)',
  });
  const lidWrap = wrappingCross(lidBoard, 15, 'Wrapping paper of lid');

  const parts = [baseBoard, baseWrap, lidBoard, lidWrap];
  if (magnetic) {
    parts.push(
      connectionStrip({ W, T, side: 'left', label: 'Left - Magnet / connection paper' }),
      connectionStrip({ W, T, side: 'right', label: 'Right - Magnet / connection paper' })
    );
  }

  return {
    kind: magnetic ? 'magnetic' : 'lid_and_base',
    family: magnetic ? 'magnetic' : 'lid_base',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    lidH,
    base: baseBoard,
    lid: lidBoard,
    parts,
  };
}

/** Flip-top hinged lid */
export function buildPacdoraFlipTop(dims) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const lidH = r2(dims.lidH || H);
  const T = r2(dims.T || 1.5);
  const flap = r2(Math.min(H * 0.35, 22));

  // Body hardboard: cross tray
  const bodyBoard = hardboardCross({
    L,
    W,
    H,
    T,
    kind: 'body_hardboard',
    label: 'Hard board paper of box body',
  });
  const bodyWrap = wrappingCross(bodyBoard, 15, 'Wrapping paper of box body');

  // Lid panel + dust flap (strip attached)
  const lidPanel = {
    kind: 'lid_panel_hardboard',
    material: 'hardboard',
    label: 'Hard board paper of flip lid',
    L,
    W: lidH,
    H: flap,
    T,
    width: L,
    height: lidH + flap,
    panels: {
      dust: { x: 0, y: 0, w: L, h: flap, role: 'dust' },
      lid: { x: 0, y: flap, w: L, h: lidH, role: 'lidTop' },
    },
    cut: [
      [0, 0],
      [L, 0],
      [L, lidH + flap],
      [0, lidH + flap],
    ],
    creases: [{ x1: 0, y1: flap, x2: L, y2: flap }],
    bleed: rectBleed(L, lidH + flap, 2),
    blankSizeCm: blank(L, lidH + flap),
  };

  const lidWrapW = L + 2 * 14;
  const lidWrapH = lidH + flap + 2 * 14;
  const lidWrap = {
    kind: 'lid_panel_wrap',
    material: 'wrapping',
    label: 'Wrapping paper of flip lid',
    L: lidWrapW,
    W: lidWrapH,
    H: 0,
    T,
    width: lidWrapW,
    height: lidWrapH,
    panels: { wrap: { x: 0, y: 0, w: lidWrapW, h: lidWrapH, role: 'wrap' } },
    cut: [
      [0, 0],
      [lidWrapW, 0],
      [lidWrapW, lidWrapH],
      [0, lidWrapH],
    ],
    creases: [
      { x1: 14, y1: 14 + flap, x2: lidWrapW - 14, y2: 14 + flap },
      { x1: 14, y1: 14, x2: 14, y2: lidWrapH - 14 },
      { x1: lidWrapW - 14, y1: 14, x2: lidWrapW - 14, y2: lidWrapH - 14 },
    ],
    bleed: rectBleed(lidWrapW, lidWrapH, 3),
    blankSizeCm: blank(lidWrapW, lidWrapH),
  };

  const hinge = connectionStrip({ W: L, T, side: 'hinge', label: 'Hinge - Connection paper' });

  // Combined body for 3D (legacy)
  const body3d = {
    ...bodyBoard,
    lidH,
    kind: 'flip_top',
    label: 'Thân + nắp lật',
  };

  return {
    kind: 'flip_top',
    family: 'flip_top',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    lidH,
    body: body3d,
    base: bodyBoard,
    parts: [bodyBoard, bodyWrap, lidPanel, lidWrap, hinge],
  };
}

/** Drawer + sleeve */
export function buildPacdoraDrawer(dims, withSleeveLabel = true) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const T = r2(dims.T || 1.5);
  const clearance = r2(T * 2 + 1);

  const trayH = r2(Math.max(H - 2 * T, H * 0.75));
  const innerBoard = hardboardCross({
    L,
    W,
    H: trayH,
    T,
    kind: 'drawer_tray_hardboard',
    label: 'Hard board paper of drawer tray',
  });
  const innerWrap = wrappingCross(innerBoard, 14, 'Wrapping paper of drawer tray');

  const sL = r2(L + clearance);
  const sW = r2(W + clearance);
  const sH = r2(H + clearance);
  const tab = 12;
  const sleeveWidth = sH + sL + sH + sL + tab;
  const sleeveHeight = sW;

  const sleeveBoard = {
    kind: 'sleeve_hardboard',
    material: 'hardboard',
    label: 'Hard board paper of sleeve',
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
      { x1: sH, y1: 0, x2: sH, y2: sW },
      { x1: sH + sL, y1: 0, x2: sH + sL, y2: sW },
      { x1: sH + sL + sH, y1: 0, x2: sH + sL + sH, y2: sW },
      { x1: sH + sL + sH + sL, y1: 0, x2: sH + sL + sH + sL, y2: sW },
    ],
    bleed: rectBleed(sleeveWidth, sleeveHeight, 2),
    blankSizeCm: blank(sleeveWidth, sleeveHeight),
  };

  const wrapPad = 14;
  const sleeveWrap = {
    kind: 'sleeve_wrap',
    material: 'wrapping',
    label: 'Wrapping paper of sleeve',
    L: sleeveWidth + 2 * wrapPad,
    W: sleeveHeight + 2 * wrapPad,
    H: 0,
    T,
    width: sleeveWidth + 2 * wrapPad,
    height: sleeveHeight + 2 * wrapPad,
    panels: {
      wrap: { x: 0, y: 0, w: sleeveWidth + 2 * wrapPad, h: sleeveHeight + 2 * wrapPad, role: 'wrap' },
    },
    cut: [
      [0, 0],
      [sleeveWidth + 2 * wrapPad, 0],
      [sleeveWidth + 2 * wrapPad, sleeveHeight + 2 * wrapPad],
      [0, sleeveHeight + 2 * wrapPad],
    ],
    creases: [
      { x1: wrapPad + sH, y1: wrapPad, x2: wrapPad + sH, y2: wrapPad + sW },
      { x1: wrapPad + sH + sL, y1: wrapPad, x2: wrapPad + sH + sL, y2: wrapPad + sW },
      { x1: wrapPad + sH + sL + sH, y1: wrapPad, x2: wrapPad + sH + sL + sH, y2: wrapPad + sW },
    ],
    bleed: rectBleed(sleeveWidth + 2 * wrapPad, sleeveHeight + 2 * wrapPad, 3),
    blankSizeCm: blank(sleeveWidth + 2 * wrapPad, sleeveHeight + 2 * wrapPad),
  };

  return {
    kind: withSleeveLabel ? 'sleeve_drawer' : 'drawer',
    family: withSleeveLabel ? 'sleeve_drawer' : 'drawer',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    inner: innerBoard,
    sleeve: sleeveBoard,
    base: innerBoard,
    parts: [innerBoard, innerWrap, sleeveBoard, sleeveWrap],
  };
}

/** Book-style */
export function buildPacdoraBook(dims) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const T = r2(dims.T || 1.5);
  const spine = r2(H + 2 * T);

  const trayBoard = hardboardCross({
    L,
    W,
    H,
    T,
    kind: 'book_tray_hardboard',
    label: 'Hard board paper of inner tray',
  });
  const trayWrap = wrappingCross(trayBoard, 14, 'Wrapping paper of inner tray');

  const coverW = L + spine + L;
  const coverH = W;
  const coverBoard = {
    kind: 'book_cover_hardboard',
    material: 'hardboard',
    label: 'Hard board paper of book cover',
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
      { x1: L, y1: 0, x2: L, y2: coverH },
      { x1: L + spine, y1: 0, x2: L + spine, y2: coverH },
    ],
    bleed: rectBleed(coverW, coverH, 2),
    blankSizeCm: blank(coverW, coverH),
  };

  const wrapPad = 16;
  const coverWrap = {
    kind: 'book_cover_wrap',
    material: 'wrapping',
    label: 'Wrapping paper of book cover',
    L: coverW + 2 * wrapPad,
    W: coverH + 2 * wrapPad,
    H: 0,
    T,
    width: coverW + 2 * wrapPad,
    height: coverH + 2 * wrapPad,
    panels: { wrap: { x: 0, y: 0, w: coverW + 2 * wrapPad, h: coverH + 2 * wrapPad, role: 'wrap' } },
    cut: [
      [0, 0],
      [coverW + 2 * wrapPad, 0],
      [coverW + 2 * wrapPad, coverH + 2 * wrapPad],
      [0, coverH + 2 * wrapPad],
    ],
    creases: [
      { x1: wrapPad + L, y1: wrapPad, x2: wrapPad + L, y2: wrapPad + coverH },
      { x1: wrapPad + L + spine, y1: wrapPad, x2: wrapPad + L + spine, y2: wrapPad + coverH },
    ],
    bleed: rectBleed(coverW + 2 * wrapPad, coverH + 2 * wrapPad, 3),
    blankSizeCm: blank(coverW + 2 * wrapPad, coverH + 2 * wrapPad),
  };

  return {
    kind: 'book',
    family: 'book',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    base: trayBoard,
    cover: coverBoard,
    parts: [trayBoard, trayWrap, coverBoard, coverWrap],
  };
}

/** Shoulder / neck */
export function buildPacdoraShoulder(dims) {
  const L = r2(dims.L);
  const W = r2(dims.W);
  const H = r2(dims.H);
  const T = r2(dims.T || 1.5);
  const lidH = r2(dims.lidH || Math.max(H * 0.3, 20));
  const shoulderH = r2(Math.min(H * 0.35, 28));

  const baseBoard = hardboardCross({
    L,
    W,
    H,
    T,
    kind: 'shoulder_base_hardboard',
    label: 'Hard board paper of base',
  });
  const baseWrap = wrappingCross(baseBoard, 15, 'Wrapping paper of base');

  const shL = r2(L + 2 * T + 1);
  const shW = r2(W + 2 * T + 1);
  const shoulderBoard = hardboardCross({
    L: shL,
    W: shW,
    H: shoulderH,
    T,
    kind: 'shoulder_collar_hardboard',
    label: 'Hard board paper of shoulder / neck',
  });
  const shoulderWrap = wrappingCross(shoulderBoard, 12, 'Wrapping paper of shoulder');

  const lidL = r2(L + 4 * T + 2);
  const lidW = r2(W + 4 * T + 2);
  const lidBoard = hardboardCross({
    L: lidL,
    W: lidW,
    H: lidH,
    T,
    kind: 'shoulder_lid_hardboard',
    label: 'Hard board paper of lid',
  });
  const lidWrap = wrappingCross(lidBoard, 14, 'Wrapping paper of lid');

  return {
    kind: 'shoulder',
    family: 'shoulder',
    style: 'pacdora',
    L,
    W,
    H,
    T,
    lidH,
    base: baseBoard,
    shoulder: shoulderBoard,
    lid: lidBoard,
    parts: [baseBoard, baseWrap, shoulderBoard, shoulderWrap, lidBoard, lidWrap],
  };
}
