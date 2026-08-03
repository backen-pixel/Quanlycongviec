/**
 * Cost engine hộp cứng (NEXTGO) — tách 3 phần như file Excel:
 * Nắp Hộp | Đáy Hộp | Gia Công Bề Mặt
 */

import { buildSheetCatalog, findBestSheetForPieces } from './rigidBoxDieline';

/** Khuôn bế từng dòng NVL (Excel cột G×H → cộng vào C10). */
export const DEFAULT_DIE_MOLDS = {
  napChipboard: { count: 1, unitPrice: 300000 },
  napPaperOuter: { count: 1, unitPrice: 300000 },
  napPaperInner: { count: 0, unitPrice: 200000 },
  dayChipboard: { count: 1, unitPrice: 300000 },
  dayPaperOuter: { count: 1, unitPrice: 300000 },
  dayPaperInner: { count: 0, unitPrice: 200000 },
};

export const DEFAULT_PRICES = {
  chipboardPerM2: 15000,
  paperPerM2: 3225,
  filmPerM2: 1100,
  foilFilmPerBox: 0,
  uvPerBox: 900,
  magnetPerBox: 1100,
  gluePerBox: 300,
  foamPerBox: 0,
  printJob: 3400000,
  foilDieJob: 70000,
  /** @deprecated dùng dieMolds — giữ để tương thích UI cũ */
  dieCount: 4,
  dieUnitPrice: 300000,
  dieMolds: { ...DEFAULT_DIE_MOLDS },
  margin300: 0.45,
  margin500: 0.5,
  margin1000: 0.55,
};

/**
 * Blank COST NextGo (cm).
 * Đáy: tray (L+2H)×(W+2H)
 * Nắp: wrap Excel (L+W+2H)×(W+H) — khớp sheet mẫu 40×30×10 → 900×400 mm
 */
export function costFlatBlanks(L, W, H) {
  const dayCb = { w: L + 2 * H, h: W + 2 * H };
  const napCb = { w: L + W + 2 * H, h: W + H };
  const dayPaperOuter = { w: dayCb.w + 2, h: dayCb.h + 2 };
  const napPaperOuter = { w: napCb.w + 2, h: napCb.h + 2 };
  const dayPaperInner = { w: Math.max(L, 1), h: Math.max(W, 1) };
  const napPaperInner = { w: Math.max(L, 1), h: Math.max(W, 1) };
  return { dayCb, napCb, dayPaperOuter, napPaperOuter, dayPaperInner, napPaperInner };
}

export function resolveDieMolds(prices = {}) {
  const base = { ...DEFAULT_DIE_MOLDS, ...(prices.dieMolds || {}) };
  // Cho phép chỉnh đơn giá khuôn chung
  if (prices.dieUnitPrice != null && Number(prices.dieUnitPrice) > 0) {
    const u = Number(prices.dieUnitPrice);
    for (const k of Object.keys(base)) {
      if ((base[k].count || 0) > 0) base[k] = { ...base[k], unitPrice: u };
    }
  }
  return base;
}

export function sumDieMoldJob(molds) {
  return Object.values(molds || {}).reduce(
    (s, m) => s + (Number(m.count) || 0) * (Number(m.unitPrice) || 0),
    0
  );
}

export const DEFAULT_SHEETS = {
  chipboardW: 109,
  chipboardH: 81.5,
  paperW: 79,
  paperH: 109,
};

/** Nest: số miếng / khổ (cm). */
export function nestCount(pieceW, pieceH, sheetW, sheetH) {
  const pw = Number(pieceW);
  const ph = Number(pieceH);
  const sw = Number(sheetW);
  const sh = Number(sheetH);
  if (![pw, ph, sw, sh].every((n) => Number.isFinite(n) && n > 0)) return 0;
  const a = Math.floor(sw / pw) * Math.floor(sh / ph);
  const b = Math.floor(sw / ph) * Math.floor(sh / pw);
  return Math.max(a, b);
}

/**
 * Chọn khổ vừa đủ (nhỏ nhất còn nest ≥ 1) cho blank chipboard / giấy.
 * @returns {{ chipboardW, chipboardH, paperW, paperH, meta }}
 */
export function suggestBestSheets(dims, setup = {}) {
  const L = Number(dims.L) || 0;
  const W = Number(dims.W) || 0;
  const H = Number(dims.H) || 0;
  const flats = costFlatBlanks(L, W, H);
  const dayCb = { ...flats.dayCb, id: 'day' };
  const napCb = { ...flats.napCb, id: 'nap' };
  const dayPaper = { ...flats.dayPaperOuter, id: 'dayP' };
  const napPaper = { ...flats.napPaperOuter, id: 'napP' };

  const catalog = buildSheetCatalog(setup);

  const pickForType = (pieces, type, fallbackW, fallbackH) => {
    const typed = catalog.filter((s) => s.type === type);
    const pool = typed.length ? typed : catalog;
    // Ưu tiên khổ nhỏ nhất còn nest được blank lớn nhất
    const largest = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    let best = null;
    for (const sheet of pool) {
      for (const [sw, sh] of [
        [sheet.w, sheet.h],
        [sheet.h, sheet.w],
      ]) {
        const n = nestCount(largest.w, largest.h, sw, sh);
        if (n <= 0) continue;
        const area = sw * sh;
        const cand = {
          w: sw,
          h: sh,
          nest: n,
          area,
          label: sheet.label || sheet.id,
          type: sheet.type,
        };
        if (!best || cand.area < best.area - 0.05 || (Math.abs(cand.area - best.area) < 0.05 && cand.nest > best.nest)) {
          best = cand;
        }
      }
    }
    if (best) return best;
    const nest = findBestSheetForPieces([largest], pool, 0.5, type);
    if (nest?.sheet) {
      return {
        w: nest.sheet.w,
        h: nest.sheet.h,
        nest: 1,
        area: nest.sheet.areaCm2,
        label: nest.sheet.label,
        type,
      };
    }
    return { w: fallbackW, h: fallbackH, nest: 0, area: fallbackW * fallbackH, label: 'Mặc định', type };
  };

  const cb = pickForType([dayCb, napCb], 'chipboard', DEFAULT_SHEETS.chipboardW, DEFAULT_SHEETS.chipboardH);
  const paper = pickForType([dayPaper, napPaper], 'paper', DEFAULT_SHEETS.paperW, DEFAULT_SHEETS.paperH);

  return {
    chipboardW: cb.w,
    chipboardH: cb.h,
    paperW: paper.w,
    paperH: paper.h,
    meta: { chipboard: cb, paper },
  };
}

/**
 * Resolve sheets theo mode auto / manual.
 */
export function resolveSheets(sheetMode, sheetSetup, dims) {
  const setup = { ...DEFAULT_SHEETS, ...sheetSetup };
  if (sheetMode === 'manual') return setup;
  return suggestBestSheets(dims, setup);
}

function sheetAreaM2(wCm, hCm) {
  return (Number(wCm) / 100) * (Number(hCm) / 100);
}

function materialCost(sheetM2, pricePerM2, nest) {
  if (!nest || nest <= 0) return 0;
  return (sheetM2 * pricePerM2) / nest;
}

function filmCost(sheetM2, filmPerM2, nest) {
  if (!nest || nest <= 0) return 0;
  return (sheetM2 / nest) * filmPerM2;
}

function sumLines(lines) {
  return Object.values(lines).reduce((a, b) => a + (Number(b) || 0), 0);
}

/**
 * @param {object} input
 * @param {number} input.L - cm
 * @param {number} input.W - cm
 * @param {number} input.H - cm
 * @param {number} input.qty
 * @param {object} [input.options]
 * @param {object} [input.prices]
 * @param {object} [input.sheets]
 */
export function computeHopCungCost(input) {
  const L = Number(input.L) || 0;
  const W = Number(input.W) || 0;
  const H = Number(input.H) || 0;
  const qty = Math.max(1, Number(input.qty) || 1);
  const opt = {
    outerFilm: true,
    innerFilm: true,
    uv: true,
    magnet: true,
    ...input.options,
  };
  const p = {
    ...DEFAULT_PRICES,
    ...input.prices,
    dieMolds: {
      ...DEFAULT_DIE_MOLDS,
      ...(DEFAULT_PRICES.dieMolds || {}),
      ...(input.prices?.dieMolds || {}),
    },
  };
  const s = { ...DEFAULT_SHEETS, ...input.sheets };

  const { dayCb, napCb, dayPaperOuter, napPaperOuter, dayPaperInner, napPaperInner } = costFlatBlanks(
    L,
    W,
    H
  );

  const cbArea = sheetAreaM2(s.chipboardW, s.chipboardH);
  const paperArea = sheetAreaM2(s.paperW, s.paperH);

  const nest = {
    napCb: nestCount(napCb.w, napCb.h, s.chipboardW, s.chipboardH),
    napPaperOuter: nestCount(napPaperOuter.w, napPaperOuter.h, s.paperW, s.paperH),
    napPaperInner: nestCount(napPaperInner.w, napPaperInner.h, s.paperW, s.paperH),
    dayCb: nestCount(dayCb.w, dayCb.h, s.chipboardW, s.chipboardH),
    dayPaperOuter: nestCount(dayPaperOuter.w, dayPaperOuter.h, s.paperW, s.paperH),
    dayPaperInner: nestCount(dayPaperInner.w, dayPaperInner.h, s.paperW, s.paperH),
  };

  const dieMolds = resolveDieMolds(p);
  const dieCutJob = sumDieMoldJob(dieMolds);
  const dieOf = (key) => {
    const m = dieMolds[key] || { count: 0, unitPrice: 0 };
    const total = (Number(m.count) || 0) * (Number(m.unitPrice) || 0);
    return { dieCount: Number(m.count) || 0, dieUnit: Number(m.unitPrice) || 0, dieTotal: total };
  };

  // ——— Nắp Hộp ———
  const napLines = {
    chipboard: materialCost(cbArea, p.chipboardPerM2, nest.napCb),
    paperOuter: materialCost(paperArea, p.paperPerM2, nest.napPaperOuter),
    filmOuter: opt.outerFilm ? filmCost(paperArea, p.filmPerM2, nest.napPaperOuter) : 0,
    paperInner: materialCost(paperArea, p.paperPerM2, nest.napPaperInner),
    filmInner: opt.innerFilm ? filmCost(paperArea, p.filmPerM2, nest.napPaperInner) : 0,
  };

  // ——— Đáy Hộp ———
  const dayLines = {
    chipboard: materialCost(cbArea, p.chipboardPerM2, nest.dayCb),
    paperOuter: materialCost(paperArea, p.paperPerM2, nest.dayPaperOuter),
    filmOuter: opt.outerFilm ? filmCost(paperArea, p.filmPerM2, nest.dayPaperOuter) : 0,
    paperInner: materialCost(paperArea, p.paperPerM2, nest.dayPaperInner),
    filmInner: opt.innerFilm ? filmCost(paperArea, p.filmPerM2, nest.dayPaperInner) : 0,
  };

  // ——— Gia Công Bề Mặt ———
  // Excel: Giá khuôn bế = SUM(I13:I…) / Q  với I = số khuôn × đơn giá từng dòng
  const giaCongLines = {
    print: p.printJob / qty,
    dieCut: dieCutJob / qty,
    foilDie: p.foilDieJob / qty,
    foilFilm: p.foilFilmPerBox || 0,
    uv: opt.uv ? p.uvPerBox : 0,
    glue: p.gluePerBox || 0,
    magnet: opt.magnet ? p.magnetPerBox : 0,
    foam: p.foamPerBox || 0,
  };

  const sections = {
    nap: {
      key: 'nap',
      title: 'Nắp Hộp',
      flat: { chipboard: napCb, paperOuter: napPaperOuter, paperInner: napPaperInner },
      nest: {
        chipboard: nest.napCb,
        paperOuter: nest.napPaperOuter,
        paperInner: nest.napPaperInner,
      },
      lines: napLines,
      subtotal: sumLines(napLines),
    },
    day: {
      key: 'day',
      title: 'Đáy Hộp',
      flat: { chipboard: dayCb, paperOuter: dayPaperOuter, paperInner: dayPaperInner },
      nest: {
        chipboard: nest.dayCb,
        paperOuter: nest.dayPaperOuter,
        paperInner: nest.dayPaperInner,
      },
      lines: dayLines,
      subtotal: sumLines(dayLines),
    },
    giaCong: {
      key: 'giaCong',
      title: 'Gia Công Bề Mặt',
      lines: giaCongLines,
      subtotal: sumLines(giaCongLines),
    },
  };

  const costPerBox = sections.nap.subtotal + sections.day.subtotal + sections.giaCong.subtotal;
  const sell = {
    qty300: costPerBox / p.margin300,
    qty500: costPerBox / p.margin500,
    qty1000: costPerBox / p.margin1000,
  };

  // Giữ `lines` phẳng để tương thích cũ
  const lines = {
    chipboardLid: napLines.chipboard,
    paperLid: napLines.paperOuter,
    filmLidOuter: napLines.filmOuter,
    paperLidInner: napLines.paperInner,
    filmLidInner: napLines.filmInner,
    chipboardDay: dayLines.chipboard,
    paperDay: dayLines.paperOuter,
    filmDayOuter: dayLines.filmOuter,
    paperDayInner: dayLines.paperInner,
    filmDayInner: dayLines.filmInner,
    printPerBox: giaCongLines.print,
    diePerBox: giaCongLines.dieCut,
    foilDiePerBox: giaCongLines.foilDie,
    foilFilm: giaCongLines.foilFilm,
    uv: giaCongLines.uv,
    glue: giaCongLines.glue,
    magnet: giaCongLines.magnet,
    foam: giaCongLines.foam,
  };

  const cbSheetLabel = `${s.chipboardW}×${s.chipboardH}`;
  const paperSheetLabel = `${s.paperW}×${s.paperH}`;
  const flatMm = (flat) =>
    flat ? { w: Math.round(flat.w * 10), h: Math.round(flat.h * 10), label: `${Math.round(flat.w * 10)}×${Math.round(flat.h * 10)}` } : null;
  const m2PerPiece = (sheetM2, nestN) => (nestN > 0 ? sheetM2 / nestN : 0);

  /** Dòng sheet Excel: A hạng mục · B giá/hộp · C m² · D khổ · E mm · F nest · G số khuôn · H giá khuôn · I tổng khuôn */
  const excelRows = [
    { type: 'section', key: 'nap', label: 'Nắp Hộp' },
    {
      type: 'line',
      key: 'nap.chipboard',
      label: 'Chipboard Nắp',
      amount: napLines.chipboard,
      sheet: cbSheetLabel,
      sizeMm: flatMm(napCb),
      nest: nest.napCb,
      m2: m2PerPiece(cbArea, nest.napCb),
      ...dieOf('napChipboard'),
    },
    {
      type: 'line',
      key: 'nap.paperOuter',
      label: 'Giấy bồi ngoài nắp',
      amount: napLines.paperOuter,
      sheet: paperSheetLabel,
      sizeMm: flatMm(napPaperOuter),
      nest: nest.napPaperOuter,
      m2: m2PerPiece(paperArea, nest.napPaperOuter),
      ...dieOf('napPaperOuter'),
    },
    {
      type: 'line',
      key: 'nap.filmOuter',
      label: 'Giá màng ngoài nắp',
      amount: napLines.filmOuter,
      m2: opt.outerFilm ? m2PerPiece(paperArea, nest.napPaperOuter) : 0,
    },
    {
      type: 'line',
      key: 'nap.paperInner',
      label: 'Giấy bồi trong nắp',
      amount: napLines.paperInner,
      sheet: paperSheetLabel,
      sizeMm: flatMm(napPaperInner),
      nest: nest.napPaperInner,
      m2: m2PerPiece(paperArea, nest.napPaperInner),
      ...dieOf('napPaperInner'),
    },
    {
      type: 'line',
      key: 'nap.filmInner',
      label: 'Giá màng trong nắp',
      amount: napLines.filmInner,
      m2: opt.innerFilm ? m2PerPiece(paperArea, nest.napPaperInner) : 0,
    },
    { type: 'section', key: 'day', label: 'Đáy Hộp' },
    {
      type: 'line',
      key: 'day.chipboard',
      label: 'Chipboard Đáy',
      amount: dayLines.chipboard,
      sheet: cbSheetLabel,
      sizeMm: flatMm(dayCb),
      nest: nest.dayCb,
      m2: m2PerPiece(cbArea, nest.dayCb),
      ...dieOf('dayChipboard'),
    },
    {
      type: 'line',
      key: 'day.paperOuter',
      label: 'Giấy bồi ngoài đáy',
      amount: dayLines.paperOuter,
      sheet: paperSheetLabel,
      sizeMm: flatMm(dayPaperOuter),
      nest: nest.dayPaperOuter,
      m2: m2PerPiece(paperArea, nest.dayPaperOuter),
      ...dieOf('dayPaperOuter'),
    },
    {
      type: 'line',
      key: 'day.filmOuter',
      label: 'Giá màng ngoài đáy',
      amount: dayLines.filmOuter,
      m2: opt.outerFilm ? m2PerPiece(paperArea, nest.dayPaperOuter) : 0,
    },
    {
      type: 'line',
      key: 'day.paperInner',
      label: 'Giấy bồi trong đáy',
      amount: dayLines.paperInner,
      sheet: paperSheetLabel,
      sizeMm: flatMm(dayPaperInner),
      nest: nest.dayPaperInner,
      m2: m2PerPiece(paperArea, nest.dayPaperInner),
      ...dieOf('dayPaperInner'),
    },
    {
      type: 'line',
      key: 'day.filmInner',
      label: 'Giá màng trong đáy',
      amount: dayLines.filmInner,
      m2: opt.innerFilm ? m2PerPiece(paperArea, nest.dayPaperInner) : 0,
    },
    { type: 'section', key: 'giaCong', label: 'Gia Công Bề Mặt' },
    { type: 'line', key: 'gc.print', label: 'Giá in', amount: giaCongLines.print },
    {
      type: 'line',
      key: 'gc.dieCut',
      label: 'Giá khuôn bế',
      amount: giaCongLines.dieCut,
      note: `= Σ(số khuôn × đơn giá) / Q = ${Math.round(dieCutJob).toLocaleString('vi-VN')} ÷ ${qty}`,
    },
    { type: 'line', key: 'gc.foilDie', label: 'Giá khuôn ép kim', amount: giaCongLines.foilDie },
    { type: 'line', key: 'gc.foilFilm', label: 'Giá màng ép', amount: giaCongLines.foilFilm },
    { type: 'line', key: 'gc.uv', label: 'UV', amount: giaCongLines.uv },
    { type: 'line', key: 'gc.glue', label: 'Keo', amount: giaCongLines.glue },
    { type: 'line', key: 'gc.magnet', label: 'Nam châm', amount: giaCongLines.magnet },
    { type: 'line', key: 'gc.foam', label: 'Mút lót', amount: giaCongLines.foam },
    { type: 'total', key: 'cost', label: 'Giá COST', amount: costPerBox },
    {
      type: 'sell',
      key: 'sell300',
      label: 'Giá bán 300 hộp',
      amount: sell.qty300,
      margin: p.margin300,
    },
    {
      type: 'sell',
      key: 'sell500',
      label: 'Giá bán 500 hộp',
      amount: sell.qty500,
      margin: p.margin500,
    },
    {
      type: 'sell',
      key: 'sell1000',
      label: 'Giá bán 1000 hộp',
      amount: sell.qty1000,
      margin: p.margin1000,
    },
    { type: 'grand', key: 'totalCost', label: 'TỔNG GIÁ COST', amount: costPerBox * qty },
    { type: 'grand', key: 'totalSell', label: 'TỔNG GIÁ BÁN (mốc 1000)', amount: sell.qty1000 * qty },
  ];

  return {
    size: { L, W, H },
    qty,
    sections,
    nest,
    sheetAreas: { chipboard: cbArea, paper: paperArea },
    lines,
    excelRows,
    unitPriceRow: {
      film: p.filmPerM2,
      paper: p.paperPerM2,
      dieCutJob,
      printJob: p.printJob,
      foilDieJob: p.foilDieJob,
      foilFilm: p.foilFilmPerBox,
      glue: p.gluePerBox,
      transport: 0,
    },
    dieMolds,
    dieCutJob,
    flats: { dayCb, napCb, dayPaperOuter, napPaperOuter, dayPaperInner, napPaperInner },
    costPerBox,
    sell,
    totals: {
      cost: costPerBox * qty,
      sell1000: sell.qty1000 * qty,
      nap: sections.nap.subtotal,
      day: sections.day.subtotal,
      giaCong: sections.giaCong.subtotal,
    },
    prices: p,
    sheets: s,
    options: opt,
  };
}

export function formatVnd(n) {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('vi-VN');
}

export function formatSizeCm(flat) {
  if (!flat) return '—';
  return `${Number(flat.w).toFixed(1)}×${Number(flat.h).toFixed(1)} cm`;
}
