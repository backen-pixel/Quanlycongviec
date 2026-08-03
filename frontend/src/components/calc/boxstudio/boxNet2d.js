/**
 * Bản trải 2D (carton net) — layout chữ thập chuẩn RSC / folding carton.
 * W = rộng (X), H = cao (Y), L = sâu (Z). Đơn vị cm.
 */

const CUT = '#1e3a5f';
const CREASE = '#c41e3a';
const FILL = '#f8fafc';
const LABEL = '#475569';
const GLUE_FILL = '#fef3c7';

/**
 * @param {{ width: number, height: number, length: number, opening?: string, tab?: number }} dims
 * @returns {{ viewBox: string, width: number, height: number, svg: string, panels: object[] }}
 */
export function buildBoxNet2d({ width: W, height: H, length: L, opening = 'lid_from_back', tab }) {
  const w = Math.max(0.1, Number(W) || 1);
  const h = Math.max(0.1, Number(H) || 1);
  const d = Math.max(0.1, Number(L) || 1); // depth
  const t = Math.max(0.3, Number(tab) || Math.min(1.5, Math.min(w, d) * 0.12));

  // Layout: cross net
  //        [Top w×d]
  // [Left] [Front] [Right] [Back] [Glue]
  //  d×h    w×h     d×h     w×h    t×h
  //        [Bot w×d]
  // Optional dust flaps / tuck depending on opening

  const ox = t + 0.5; // left margin for optional left tuck on top row
  const oy = t + 0.5;

  const leftX = ox;
  const frontX = leftX + d;
  const rightX = frontX + w;
  const backX = rightX + d;
  const glueX = backX + w;

  const topY = oy;
  const bodyY = topY + d;
  const botY = bodyY + h;

  const totalW = glueX + t + 1;
  const totalH = botY + d + t + 1;

  const panels = [];
  const paths = [];
  const creases = [];
  const labels = [];

  function addRect(id, x, y, pw, ph, label, opts = {}) {
    panels.push({ id, label, x, y, w: pw, h: ph });
    const fill = opts.glue ? GLUE_FILL : FILL;
    paths.push(
      `<rect x="${r(x)}" y="${r(y)}" width="${r(pw)}" height="${r(ph)}" fill="${fill}" stroke="${CUT}" stroke-width="0.08" />`
    );
    if (label) {
      labels.push(
        `<text x="${r(x + pw / 2)}" y="${r(y + ph / 2)}" text-anchor="middle" dominant-baseline="middle" fill="${LABEL}" font-size="${r(Math.min(1.1, Math.min(pw, ph) * 0.22))}" font-family="system-ui,sans-serif">${escapeXml(label)}</text>`
      );
      labels.push(
        `<text x="${r(x + pw / 2)}" y="${r(y + ph / 2 + Math.min(1.1, Math.min(pw, ph) * 0.22) * 1.15)}" text-anchor="middle" dominant-baseline="middle" fill="#94a3b8" font-size="${r(Math.min(0.7, Math.min(pw, ph) * 0.12))}" font-family="system-ui,sans-serif">${r(pw)}×${r(ph)}</text>`
      );
    }
  }

  function creaseV(x, y1, y2) {
    creases.push(
      `<line x1="${r(x)}" y1="${r(y1)}" x2="${r(x)}" y2="${r(y2)}" stroke="${CREASE}" stroke-width="0.06" stroke-dasharray="0.35 0.25" />`
    );
  }
  function creaseH(y, x1, x2) {
    creases.push(
      `<line x1="${r(x1)}" y1="${r(y)}" x2="${r(x2)}" y2="${r(y)}" stroke="${CREASE}" stroke-width="0.06" stroke-dasharray="0.35 0.25" />`
    );
  }

  // Main body belt
  addRect('left', leftX, bodyY, d, h, 'Trái');
  addRect('front', frontX, bodyY, w, h, 'Trước');
  addRect('right', rightX, bodyY, d, h, 'Phải');
  addRect('back', backX, bodyY, w, h, 'Sau');
  addRect('glue', glueX, bodyY, t, h, 'Keo', { glue: true });

  creaseV(frontX, bodyY, bodyY + h);
  creaseV(rightX, bodyY, bodyY + h);
  creaseV(backX, bodyY, bodyY + h);
  creaseV(glueX, bodyY, bodyY + h);

  // Top & bottom attached to front (standard cross)
  addRect('top', frontX, topY, w, d, topLabel(opening));
  addRect('bottom', frontX, botY, w, d, 'Đáy');
  creaseH(bodyY, frontX, frontX + w);
  creaseH(botY, frontX, frontX + w);

  // Dust flaps on left/right for top & bottom (classic RSC)
  const dust = Math.min(t * 1.2, d * 0.45, w * 0.35);
  if (dust > 0.2) {
    // Top dust on left & right of top panel
    addTrapezoidDust(paths, frontX - dust, topY, dust, d, 'left');
    addTrapezoidDust(paths, frontX + w, topY, dust, d, 'right');
    // Bottom dust
    addTrapezoidDust(paths, frontX - dust, botY, dust, d, 'left');
    addTrapezoidDust(paths, frontX + w, botY, dust, d, 'right');
    creaseV(frontX, topY, topY + d);
    creaseV(frontX + w, topY, topY + d);
    creaseV(frontX, botY, botY + d);
    creaseV(frontX + w, botY, botY + d);
  }

  // Opening-specific tuck / split hints on top edge
  if (opening === 'top_split_meet_center') {
    // Center crease on top panel (meet at center)
    creaseV(frontX + w / 2, topY, topY + d);
    labels.push(
      `<text x="${r(frontX + w / 4)}" y="${r(topY + 0.55)}" text-anchor="middle" fill="${CREASE}" font-size="0.55" font-family="system-ui,sans-serif">½ nắp</text>`
    );
    labels.push(
      `<text x="${r(frontX + (3 * w) / 4)}" y="${r(topY + 0.55)}" text-anchor="middle" fill="${CREASE}" font-size="0.55" font-family="system-ui,sans-serif">½ nắp</text>`
    );
  } else if (opening === 'lid_from_back') {
    // Tuck flap on free edge of top (away from front hinge → toward back when folded)
    // Top is hinged at bodyY (front). Free edge is topY. Add tuck tab along topY.
    addTuckTab(paths, frontX, topY - t, w, t);
    creaseH(topY, frontX, frontX + w);
  } else if (opening === 'lid_from_front') {
    // Same geometry visually; label already says nắp
    addTuckTab(paths, frontX, topY - t, w, t);
    creaseH(topY, frontX, frontX + w);
  } else if (opening === 'door_left' || opening === 'double_doors') {
    // Extra note — door is the left/right wall swinging; net same
  }

  // Outer cut outline for glue tab tip (rounded look simplified as rect already)

  const legend = `
    <g transform="translate(${r(0.3)}, ${r(totalH - 0.9)})">
      <line x1="0" y1="0.2" x2="1.2" y2="0.2" stroke="${CUT}" stroke-width="0.08"/>
      <text x="1.4" y="0.35" fill="${LABEL}" font-size="0.55" font-family="system-ui,sans-serif">Cắt</text>
      <line x1="3.2" y1="0.2" x2="4.4" y2="0.2" stroke="${CREASE}" stroke-width="0.06" stroke-dasharray="0.35 0.25"/>
      <text x="4.6" y="0.35" fill="${LABEL}" font-size="0.55" font-family="system-ui,sans-serif">Gấp</text>
      <rect x="6.8" y="0" width="0.7" height="0.45" fill="${GLUE_FILL}" stroke="${CUT}" stroke-width="0.05"/>
      <text x="7.7" y="0.35" fill="${LABEL}" font-size="0.55" font-family="system-ui,sans-serif">Tai keo</text>
    </g>`;

  const dimNote = `<text x="${r(totalW / 2)}" y="${r(0.35)}" text-anchor="middle" fill="#64748b" font-size="0.6" font-family="system-ui,sans-serif">Bản trải 2D · W ${r(w)} × H ${r(h)} × L ${r(d)} cm</text>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(totalW)} ${r(totalH)}" width="${r(totalW)}cm" height="${r(totalH)}cm">
  <rect width="100%" height="100%" fill="#fff"/>
  ${dimNote}
  ${paths.join('\n  ')}
  ${creases.join('\n  ')}
  ${labels.join('\n  ')}
  ${legend}
</svg>`;

  return {
    viewBox: `0 0 ${r(totalW)} ${r(totalH)}`,
    width: totalW,
    height: totalH,
    svg,
    panels,
  };
}

function topLabel(opening) {
  if (opening === 'top_split_meet_center') return 'Nắp (2 cánh)';
  if (opening === 'closed') return 'Nắp';
  if (String(opening).startsWith('lid_')) return 'Nắp';
  if (opening === 'double_doors' || opening === 'door_left' || opening === 'door_right') return 'Nắp';
  return 'Nắp';
}

function addTuckTab(paths, x, y, w, t) {
  // Trapezoid tuck: narrower free edge
  const inset = Math.min(t * 0.35, w * 0.08);
  const pts = [
    [x, y + t],
    [x + w, y + t],
    [x + w - inset, y],
    [x + inset, y],
  ]
    .map(([a, b]) => `${r(a)},${r(b)}`)
    .join(' ');
  paths.push(`<polygon points="${pts}" fill="${FILL}" stroke="${CUT}" stroke-width="0.08" />`);
}

function addTrapezoidDust(paths, x, y, dustW, panelD, side) {
  const taper = Math.min(dustW * 0.35, panelD * 0.12);
  let pts;
  if (side === 'left') {
    pts = [
      [x + dustW, y],
      [x + dustW, y + panelD],
      [x, y + panelD - taper],
      [x, y + taper],
    ];
  } else {
    pts = [
      [x, y],
      [x, y + panelD],
      [x + dustW, y + panelD - taper],
      [x + dustW, y + taper],
    ];
  }
  paths.push(
    `<polygon points="${pts.map(([a, b]) => `${r(a)},${r(b)}`).join(' ')}" fill="${FILL}" stroke="${CUT}" stroke-width="0.08" />`
  );
}

function r(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadBoxNetSvg(svg, filename = 'box-net-2d.svg') {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
