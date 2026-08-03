/**
 * Tuck-end carton dieline (kiểu Square cosmetics jar trên Pacdora):
 * - Trim/cut: xanh dương
 * - Crease/nếp gấp: đỏ
 * - Dust flap = canh chống bụi (hai bên nắp/đáy)
 * - Tuck flap = tai gài (đầu nắp gài vào thân)
 *
 * Input dims mm: L (sâu), W (rộng mặt trước), H (cao).
 */

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function blank(w, h) {
  return { w: r2(w / 10), h: r2(h / 10) };
}

/**
 * @param {{ L:number, W:number, H:number, T?:number }} dims mm
 */
export function buildTuckEndCarton(dims) {
  const L = r2(dims.L); // depth
  const W = r2(dims.W); // width (front face)
  const H = r2(dims.H); // height
  const T = r2(dims.T || 0.5);

  const glue = Math.max(8, Math.min(18, W * 0.12));
  const tuck = Math.max(10, Math.min(L * 0.45, 22));
  const dust = Math.max(8, Math.min(L * 0.4, W * 0.35, 18));
  const ear = Math.max(2.5, Math.min(4, tuck * 0.22)); // friction lock ears on tuck

  // Layout (Y down):
  // row0: tuck above top
  // row1: dustL | top(W×L) | dustR
  // row2: glue | front(W×H) | right(L×H) | back(W×H) | left(L×H)
  // row3: dustL | bottom | dustR  (under back)
  // row4: tuck under bottom

  const ox = glue; // front starts after glue
  const topY = tuck;
  const bodyY = topY + L;
  const botY = bodyY + H;
  // bottom attached to BACK panel which starts at ox + W + L
  const backX = ox + W + L;

  const width = glue + W + L + W + L + 4;
  const height = tuck + L + H + L + tuck + 4;

  // Main cut outline for full net — build as union of panels with dust/tuck shapes
  const creases = [];
  const panels = {};

  // Helper rect cut pieces collected then we'll use compound path
  const cuts = []; // array of closed polygons

  // --- Top assembly (on FRONT) ---
  const frontX = ox;
  const topX = frontX;
  // Top panel
  panels.top = { x: topX, y: topY, w: W, h: L, role: 'top' };
  // Dust flaps left/right of top (trapezoid-ish)
  const dustTopL = dustPoly(topX - dust, topY, dust, L, 'left');
  const dustTopR = dustPoly(topX + W, topY, dust, L, 'right');
  cuts.push(dustTopL, dustTopR);
  panels.dust_top_l = { x: topX - dust, y: topY, w: dust, h: L, role: 'dust_flap' };
  panels.dust_top_r = { x: topX + W, y: topY, w: dust, h: L, role: 'dust_flap' };
  // Tuck flap above top (with ears)
  const tuckTop = tuckPoly(topX, topY - tuck, W, tuck, ear);
  cuts.push(tuckTop);
  panels.tuck_top = { x: topX, y: topY - tuck, w: W, h: tuck, role: 'tuck_flap' };

  // Top panel rectangle
  cuts.push([
    [topX, topY],
    [topX + W, topY],
    [topX + W, topY + L],
    [topX, topY + L],
  ]);

  // Creases for top
  creases.push(
    { x1: topX, y1: topY, x2: topX + W, y2: topY, edge: 'tuck-hinge' }, // top↔tuck
    { x1: topX, y1: topY + L, x2: topX + W, y2: topY + L, edge: 'top-front' },
    { x1: topX, y1: topY, x2: topX, y2: topY + L, edge: 'dustL' },
    { x1: topX + W, y1: topY, x2: topX + W, y2: topY + L, edge: 'dustR' },
    // lock slits on tuck (short crease marks)
    { x1: topX + ear, y1: topY - ear, x2: topX + W - ear, y2: topY - ear, edge: 'tuck-lock' }
  );

  // --- Body belt ---
  const rightX = frontX + W;
  const leftX = backX + W;
  panels.glue = { x: 0, y: bodyY, w: glue, h: H, role: 'glue' };
  panels.front = { x: frontX, y: bodyY, w: W, h: H, role: 'front' };
  panels.right = { x: rightX, y: bodyY, w: L, h: H, role: 'right' };
  panels.back = { x: backX, y: bodyY, w: W, h: H, role: 'back' };
  panels.left = { x: leftX, y: bodyY, w: L, h: H, role: 'left' };

  cuts.push(
    [
      [0, bodyY],
      [leftX + L, bodyY],
      [leftX + L, bodyY + H],
      [0, bodyY + H],
    ]
  );

  creases.push(
    { x1: glue, y1: bodyY, x2: glue, y2: bodyY + H },
    { x1: frontX + W, y1: bodyY, x2: frontX + W, y2: bodyY + H },
    { x1: rightX + L, y1: bodyY, x2: rightX + L, y2: bodyY + H },
    { x1: backX + W, y1: bodyY, x2: backX + W, y2: bodyY + H }
  );

  // --- Bottom under BACK ---
  const botX = backX;
  panels.bottom = { x: botX, y: botY, w: W, h: L, role: 'bottom' };
  cuts.push([
    [botX, botY],
    [botX + W, botY],
    [botX + W, botY + L],
    [botX, botY + L],
  ]);
  const dustBotL = dustPoly(botX - dust, botY, dust, L, 'left');
  const dustBotR = dustPoly(botX + W, botY, dust, L, 'right');
  cuts.push(dustBotL, dustBotR);
  panels.dust_bot_l = { x: botX - dust, y: botY, w: dust, h: L, role: 'dust_flap' };
  panels.dust_bot_r = { x: botX + W, y: botY, w: dust, h: L, role: 'dust_flap' };
  const tuckBot = tuckPoly(botX, botY + L, W, tuck, ear);
  cuts.push(tuckBot);
  panels.tuck_bot = { x: botX, y: botY + L, w: W, h: tuck, role: 'tuck_flap' };

  creases.push(
    { x1: botX, y1: botY, x2: botX + W, y2: botY, edge: 'back-bottom' },
    { x1: botX, y1: botY + L, x2: botX + W, y2: botY + L, edge: 'bottom-tuck' },
    { x1: botX, y1: botY, x2: botX, y2: botY + L },
    { x1: botX + W, y1: botY, x2: botX + W, y2: botY + L },
    { x1: botX + ear, y1: botY + L + ear, x2: botX + W - ear, y2: botY + L + ear, edge: 'tuck-lock' }
  );

  // Outer bleed approx
  const pad = 3;
  const bleed = [
    [-pad, -pad],
    [width + pad, -pad],
    [width + pad, height + pad],
    [-pad, height + pad],
  ];

  // Merge cut into one path by concatenating all polygons (SVG multi-subpath)
  // For trayToSvg we need single cut array OR we store cutPaths
  const part = {
    kind: 'tuck_end_carton',
    material: 'carton',
    label: 'Tuck-end carton (dust flap + tuck flap)',
    L,
    W,
    H,
    T,
    width,
    height,
    panels,
    cut: cuts[0], // primary — also store all
    cutPaths: cuts,
    creases,
    bleed,
    blankSizeCm: blank(width, height),
    annotations: {
      dust_flap: 'Canh chống bụi (Dust flap)',
      tuck_flap: 'Tai gài (Tuck flap)',
      crease: 'Nếp gấp (Crease) — đỏ',
      trim: 'Đường cắt (Trim) — xanh dương',
    },
  };

  return {
    kind: 'tuck_end',
    family: 'tuck_end',
    style: 'pacdora_tuck',
    L,
    W,
    H,
    T,
    parts: [part],
    annotations: part.annotations,
  };
}

/** Trapezoid dust flap */
function dustPoly(x, y, dw, dh, side) {
  const taper = Math.min(dw * 0.35, dh * 0.15);
  if (side === 'left') {
    return [
      [x + dw, y],
      [x + dw, y + dh],
      [x, y + dh - taper],
      [x, y + taper],
    ];
  }
  return [
    [x, y],
    [x, y + dh],
    [x + dw, y + dh - taper],
    [x + dw, y + taper],
  ];
}

/** Tuck flap with slight ear notches */
function tuckPoly(x, y, w, th, ear) {
  // Pointing away from panel: if y is above panel, tuck goes up; if below, goes down
  // Assume y is the outer edge start for bottom tuck (extends +y)
  // For top tuck, y is outer (smaller y), extends from y to y+th toward panel
  return [
    [x + ear, y],
    [x + w - ear, y],
    [x + w, y + ear],
    [x + w, y + th],
    [x, y + th],
    [x, y + ear],
  ];
}
