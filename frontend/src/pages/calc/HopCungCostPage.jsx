/**
 * Tính giá hộp cứng (NEXTGO) + mockup 3D + bản trải 2D.
 * Thư viện ~60 mẫu rigid (tên kiểu Pacdora) · 9 họ cấu trúc.
 */

import { useMemo, useState, lazy, Suspense, useCallback, useEffect } from 'react';
import { ExternalLink, Package, RotateCcw, ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  computeHopCungCost,
  DEFAULT_DIE_MOLDS,
  DEFAULT_PRICES,
  DEFAULT_SHEETS,
  formatVnd,
  resolveSheets,
} from '../../lib/hopCungCost';
import {
  getTemplateById,
  RIGID_BOX_FAMILIES,
} from '../../lib/rigidBoxCatalog';
import { buildDielineForTemplate, modelToPrimaryFlat } from '../../lib/rigidBoxDieline';
import RigidBoxTemplatePicker from '../../components/calc/RigidBoxTemplatePicker';
import DielineStudioCanvas from '../../components/calc/boxstudio/DielineStudioCanvas';
import HopCungCostSheet from '../../components/calc/HopCungCostSheet';
import HopCungSheetSetup from '../../components/calc/HopCungSheetSetup';
import { MATERIAL_PRESETS } from '../../components/calc/boxstudio/materialPresets';
import { openingForFamily } from '../../components/calc/boxstudio/familyOpening';
import { downloadSvg } from '../../lib/rigidBoxDieline';
import { HOP_CUNG_DESIGN_KEY } from '../../lib/hopCungDesignDraft';

const BoxStudioViewport = lazy(() => import('../../components/calc/boxstudio/BoxStudioViewport'));

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';

const NEEDS_LID_H = new Set(['lid_base', 'magnetic', 'tall_bottle', 'flip_top', 'double_door', 'shoulder']);

export default function HopCungCostPage() {
  const [searchParams] = useSearchParams();
  const fromDesign = searchParams.get('from') === 'thiet-ke';

  const initial = useMemo(() => {
    const fromQuery = {
      templateId: searchParams.get('templateId'),
      L: searchParams.get('L'),
      W: searchParams.get('W'),
      H: searchParams.get('H'),
      T: searchParams.get('T'),
      lidH: searchParams.get('lidH'),
      customer: searchParams.get('customer'),
    };
    if (fromQuery.templateId) return fromQuery;
    try {
      const raw = sessionStorage.getItem(HOP_CUNG_DESIGN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [searchParams]);

  const [templateId, setTemplateId] = useState(initial?.templateId || 'double-door-gift');
  const template = useMemo(() => getTemplateById(templateId), [templateId]);
  const fam = RIGID_BOX_FAMILIES[template.family];

  const [L, setL] = useState(Number(initial?.L) || template.defaults.L);
  const [W, setW] = useState(Number(initial?.W) || template.defaults.W);
  const [H, setH] = useState(Number(initial?.H) || template.defaults.H);
  const [lidH, setLidH] = useState(
    Number(initial?.lidH) || template.defaults.lidH || Math.max(template.defaults.H * 0.45, 2)
  );
  const [T, setT] = useState(Number(initial?.T) || 0.15);
  const [sizeMode, setSizeMode] = useState('manufacture');
  const [qty, setQty] = useState(1000);
  const [customer, setCustomer] = useState(initial?.customer || '');
  const [openT, setOpenT] = useState(0.55);
  const [showDims, setShowDims] = useState(false);
  const [colorByFace, setColorByFace] = useState(false);
  const [materialId, setMaterialId] = useState('white_card');
  const [options, setOptions] = useState({
    outerFilm: true,
    innerFilm: true,
    uv: true,
    magnet: true,
  });
  const [prices, setPrices] = useState({ ...DEFAULT_PRICES });
  const [sheetMode, setSheetMode] = useState(initial?.sheetMode === 'manual' ? 'manual' : 'auto');
  const [sheetSetup, setSheetSetup] = useState({
    ...DEFAULT_SHEETS,
    ...(initial?.sheetSetup || {}),
  });
  const [copiesMode, setCopiesMode] = useState(initial?.copiesMode === 'manual' ? 'manual' : 'auto');
  const [copiesPerSheet, setCopiesPerSheet] = useState(
    initial?.copiesPerSheet != null ? Number(initial.copiesPerSheet) : null
  );
  const [copiesByPart, setCopiesByPart] = useState(initial?.copiesByPart || null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCost, setShowCost] = useState(true);

  useEffect(() => {
    if (!fromDesign || !initial?.templateId) return;
    setTemplateId(initial.templateId);
    if (initial.L != null) setL(Number(initial.L));
    if (initial.W != null) setW(Number(initial.W));
    if (initial.H != null) setH(Number(initial.H));
    if (initial.T != null) setT(Number(initial.T));
    if (initial.lidH != null) setLidH(Number(initial.lidH));
    if (initial.customer) setCustomer(initial.customer);
    if (initial.sheetMode) setSheetMode(initial.sheetMode === 'manual' ? 'manual' : 'auto');
    if (initial.sheetSetup) setSheetSetup({ ...DEFAULT_SHEETS, ...initial.sheetSetup });
    if (initial.copiesMode) setCopiesMode(initial.copiesMode === 'manual' ? 'manual' : 'auto');
    if (initial.copiesPerSheet != null) setCopiesPerSheet(Number(initial.copiesPerSheet));
    if (initial.copiesByPart) setCopiesByPart(initial.copiesByPart);
  }, [fromDesign, initial]);

  const selectTemplate = useCallback((tpl) => {
    setTemplateId(tpl.id);
    setL(tpl.defaults.L);
    setW(tpl.defaults.W);
    setH(tpl.defaults.H);
    setLidH(tpl.defaults.lidH ?? Math.max(tpl.defaults.H * 0.45, 2));
    if (['drawer', 'sleeve_drawer'].includes(tpl.family)) setOpenT(0.45);
    else if (['double_door', 'lid_base', 'magnetic', 'book'].includes(tpl.family)) setOpenT(0.35);
    else setOpenT(0.4);
    if (tpl.family === 'magnetic') {
      setOptions((o) => ({ ...o, magnet: true }));
    }
  }, []);

  const sheets = useMemo(
    () => resolveSheets(sheetMode, sheetSetup, { L, W, H }),
    [sheetMode, sheetSetup, L, W, H]
  );

  const result = useMemo(
    () =>
      computeHopCungCost({
        L,
        W,
        H,
        qty,
        options,
        prices,
        sheets,
      }),
    [L, W, H, qty, options, prices, sheets]
  );

  const dieline = useMemo(
    () => buildDielineForTemplate(templateId, { L, W, H, T, lidH }),
    [templateId, L, W, H, T, lidH]
  );
  const primaryFlat = useMemo(
    () =>
      modelToPrimaryFlat(dieline, {
        sheetMode,
        sheetSetup: sheets,
        copiesPerSheet: copiesMode === 'manual' && !copiesByPart ? copiesPerSheet : null,
        copiesByPart: copiesMode === 'manual' ? copiesByPart : null,
      }),
    [dieline, sheetMode, sheets, copiesMode, copiesPerSheet, copiesByPart]
  );
  const svgParts = useMemo(() => (primaryFlat?.svg ? [primaryFlat] : []), [primaryFlat]);

  const sheetAutoLabel = useMemo(() => {
    const nestSheet = primaryFlat?.sheet;
    return [
      nestSheet ? `2D ${nestSheet.w}×${nestSheet.h}` : null,
      `CB ${sheets.chipboardW}×${sheets.chipboardH}`,
      `Giấy ${sheets.paperW}×${sheets.paperH} cm`,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [primaryFlat?.sheet, sheets]);

  const resetDefaults = () => {
    selectTemplate(getTemplateById(templateId));
    setT(0.15);
    setQty(1000);
    setCustomer('');
    setMaterialId('white_card');
    setShowDims(true);
    setOptions({
      outerFilm: true,
      innerFilm: true,
      uv: true,
      magnet: template.family === 'magnetic',
    });
    setPrices({ ...DEFAULT_PRICES });
    setSheetMode('auto');
    setSheetSetup({ ...DEFAULT_SHEETS });
  };

  const toggleOpt = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));
  const { nap, day, giaCong } = result.sections;
  const needsLidH = NEEDS_LID_H.has(template.family);
  const opening = openingForFamily(template.family);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500 flex items-center justify-center text-white shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dieline generator · Hộp cứng</h1>
            <p className="text-sm text-gray-500">
              Bố cục kiểu Pacdora: kích thước · 2D multi-part · 3D Open/Close · COST NextGo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/calc/hop-cung/thiet-ke"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-700 hover:text-indigo-900 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Thiết kế (wizard)
          </Link>
          <a
            href="https://www.pacdora.com/dielines/rigid-boxes"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
          >
            Pacdora
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 bg-white"
          >
            <RotateCcw className="h-4 w-4" />
            Đặt lại
          </button>
        </div>
      </div>

      <RigidBoxTemplatePicker selectedId={templateId} onSelect={selectTemplate} />

      {/* Pacdora-style: Left sizes | Center 2D | Right 3D */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
        {/* LEFT — Custom size */}
        <aside className="xl:col-span-2 bg-white border border-gray-200 rounded-xl p-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-800">Custom Size</p>
            <p className="text-[11px] text-gray-400 truncate">{template.nameEn || template.name}</p>
          </div>
          <NumField label="Length L (cm)" value={L} onChange={setL} />
          <NumField label="Width W (cm)" value={W} onChange={setW} />
          <NumField label="Height H (cm)" value={H} onChange={setH} />
          <NumField label="Thickness T (cm)" value={T} onChange={setT} step={0.01} />
          {needsLidH ? <NumField label="Lid H (cm)" value={lidH} onChange={setLidH} /> : null}

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Size Mode</p>
            <div className="flex flex-col gap-1">
              {[
                { id: 'manufacture', label: 'Manufacture dimensions' },
                { id: 'inner', label: 'Inner dimensions' },
                { id: 'outer', label: 'Outer dimensions' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSizeMode(m.id)}
                  className={`text-left text-[11px] px-2.5 py-1.5 rounded-md border ${
                    sizeMode === m.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-amber-700 mt-1.5">
              Hiện engine dùng kích thước như manufacture/inner (cm). Outer = cộng độ dày khi xuất CAD đầy đủ (chưa tách).
            </p>
          </div>

          <div className="border-t border-gray-100 pt-2 space-y-2">
            <p className="text-xs font-semibold text-gray-800">{fam?.name}</p>
            <label className="block">
              <span className="text-xs text-gray-500">Chất liệu 3D</span>
              <select className={inputClass} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                {MATERIAL_PRESETS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <CheckRow label="Thước trên 3D" checked={showDims} onChange={() => setShowDims((v) => !v)} />
            <CheckRow label="Tô màu mặt" checked={colorByFace} onChange={() => setColorByFace((v) => !v)} />
          </div>
        </aside>

        {/* CENTER — 2D dielines */}
        <div className="xl:col-span-7 min-h-[520px]">
          <DielineStudioCanvas
            parts={svgParts}
            templateName={template.nameEn || template.name}
            layout="studio"
            faces={primaryFlat?.faces || []}
            copiesMode={copiesMode}
            copiesPerSheet={copiesPerSheet}
            copiesByPart={copiesByPart}
            onCopiesModeChange={setCopiesMode}
            onCopiesPerSheetChange={setCopiesPerSheet}
            onCopiesByPartChange={setCopiesByPart}
          />
        </div>

        {/* RIGHT — 3D + export */}
        <aside className="xl:col-span-3 space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-800">3D Preview</p>
            </div>
            <Suspense
              fallback={
                <div className="h-56 bg-slate-50 flex items-center justify-center text-xs text-gray-400">
                  Đang tải 3D…
                </div>
              }
            >
              <BoxStudioViewport
                className="h-56 w-full"
                widthCm={W}
                heightCm={H}
                lengthCm={L}
                lidH={lidH}
                family={template.family}
                opening={opening}
                openT={openT}
                onOpenTChange={setOpenT}
                materialId={materialId}
                showDimensions={showDims}
                colorByFace={colorByFace}
                onColorByFaceChange={setColorByFace}
                thicknessCm={T}
                compactControls
              />
            </Suspense>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-800">File Formats</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="text-[11px] py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  svgParts.forEach((p, i) => setTimeout(() => downloadSvg(p.svg, p.filename), i * 120));
                }}
              >
                SVG dieline
              </button>
              <button
                type="button"
                className="text-[11px] py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 cursor-not-allowed"
                title="Chưa hỗ trợ — Pacdora commercial"
                disabled
              >
                AI / PDF / DXF
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              SVG từng tấm (hardboard, wrapping, connection). AI/PDF/DXF chưa có trong bản nội bộ.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3 text-[11px] text-gray-500 space-y-1">
            <p className="font-medium text-gray-700">Features</p>
            <p>Bleed xanh · Trim xanh dương · Crease đỏ · kích thước trên panel (cm).</p>
            <p>3D Open/Close cho double door, lid-base, flip, drawer…</p>
          </div>
        </aside>
      </div>

      {/* COST + sheet bóc tách Excel */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          onClick={() => setShowCost((v) => !v)}
        >
          <span>
            COST / Bóc tách (sheet Excel)
            <span className="ml-2 font-normal text-gray-400 text-xs">
              Nắp · Đáy · Gia công · giống T7-TRINH-HỘP CỨNG
            </span>
          </span>
          {showCost ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showCost ? (
          <div className="border-t border-gray-100 p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-gray-500">Khách hàng</span>
                <input className={inputClass} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Tên khách / mã đơn" />
              </label>
              <NumField label="Số lượng Q" value={qty} onChange={setQty} min={1} step={1} />
              <div className="space-y-1 pt-1">
                <CheckRow label="Màng ngoài" checked={options.outerFilm} onChange={() => toggleOpt('outerFilm')} />
                <CheckRow label="Màng trong" checked={options.innerFilm} onChange={() => toggleOpt('innerFilm')} />
                <CheckRow label="UV" checked={options.uv} onChange={() => toggleOpt('uv')} />
                <CheckRow label="Nam châm" checked={options.magnet} onChange={() => toggleOpt('magnet')} />
              </div>
            </div>

            <section className="bg-gradient-to-br from-rose-50 to-white border border-rose-200 rounded-xl p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-rose-600 font-medium">Giá COST / hộp</p>
                  <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatVnd(result.costPerBox)}</p>
                  {customer ? <p className="text-sm text-gray-500 mt-1">{customer}</p> : null}
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>Tổng COST ({qty.toLocaleString('vi-VN')} hộp)</div>
                  <div className="text-lg font-semibold text-gray-900 tabular-nums">{formatVnd(result.totals.cost)}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <SubtotalChip label="Nắp" value={nap.subtotal} tone="sky" />
                <SubtotalChip label="Đáy" value={day.subtotal} tone="amber" />
                <SubtotalChip label="Gia công" value={giaCong.subtotal} tone="violet" />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <PriceCard label="Bán 300" value={result.sell.qty300} margin={prices.margin300} />
                <PriceCard label="Bán 500" value={result.sell.qty500} margin={prices.margin500} />
                <PriceCard label="Bán 1000" value={result.sell.qty1000} margin={prices.margin1000} highlight />
              </div>
            </section>

            <HopCungCostSheet
              result={result}
              customer={customer}
              templateName={template.name || template.nameEn}
            />

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                Đơn giá & khổ giấy
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showAdvanced && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <NumField label="Chipboard đ/m²" value={prices.chipboardPerM2} onChange={(v) => setPrices((p) => ({ ...p, chipboardPerM2: v }))} />
                    <NumField label="Giấy bồi đ/m²" value={prices.paperPerM2} onChange={(v) => setPrices((p) => ({ ...p, paperPerM2: v }))} />
                    <NumField label="Màng đ/m²" value={prices.filmPerM2} onChange={(v) => setPrices((p) => ({ ...p, filmPerM2: v }))} />
                    <NumField label="Keo / hộp" value={prices.gluePerBox} onChange={(v) => setPrices((p) => ({ ...p, gluePerBox: v }))} />
                    <NumField label="UV / hộp" value={prices.uvPerBox} onChange={(v) => setPrices((p) => ({ ...p, uvPerBox: v }))} />
                    <NumField label="Nam châm / hộp" value={prices.magnetPerBox} onChange={(v) => setPrices((p) => ({ ...p, magnetPerBox: v }))} />
                    <NumField label="Giá in (job)" value={prices.printJob} onChange={(v) => setPrices((p) => ({ ...p, printJob: v }))} />
                    <NumField label="Khuôn ép kim" value={prices.foilDieJob} onChange={(v) => setPrices((p) => ({ ...p, foilDieJob: v }))} />
                    <NumField
                      label="Đơn giá 1 khuôn bế"
                      value={prices.dieUnitPrice}
                      onChange={(v) => setPrices((p) => ({ ...p, dieUnitPrice: v }))}
                    />
                  </div>
                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-700">Số khuôn bế từng dòng (Excel G)</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        ['napChipboard', 'CB Nắp'],
                        ['napPaperOuter', 'Giấy ngoài nắp'],
                        ['napPaperInner', 'Giấy trong nắp'],
                        ['dayChipboard', 'CB Đáy'],
                        ['dayPaperOuter', 'Giấy ngoài đáy'],
                        ['dayPaperInner', 'Giấy trong đáy'],
                      ].map(([key, label]) => (
                        <NumField
                          key={key}
                          label={label}
                          value={prices.dieMolds?.[key]?.count ?? DEFAULT_DIE_MOLDS[key]?.count ?? 0}
                          min={0}
                          step={1}
                          onChange={(v) =>
                            setPrices((p) => ({
                              ...p,
                              dieMolds: {
                                ...DEFAULT_DIE_MOLDS,
                                ...(p.dieMolds || {}),
                                [key]: {
                                  ...(DEFAULT_DIE_MOLDS[key] || {}),
                                  ...(p.dieMolds?.[key] || {}),
                                  count: v,
                                  unitPrice: p.dieUnitPrice || DEFAULT_DIE_MOLDS[key]?.unitPrice || 300000,
                                },
                              },
                            }))
                          }
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Tổng khuôn job:{' '}
                      <span className="font-semibold tabular-nums text-gray-800">
                        {formatVnd(result?.dieCutJob || result?.unitPriceRow?.dieCutJob)}
                      </span>
                      {' · '}/ hộp = tổng ÷ Q
                    </p>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <HopCungSheetSetup
                      mode={sheetMode}
                      onModeChange={(m) => {
                        if (m === 'manual') setSheetSetup(sheets);
                        setSheetMode(m);
                      }}
                      sheets={sheetMode === 'auto' ? sheets : sheetSetup}
                      onSheetsChange={setSheetSetup}
                      autoLabel={sheetAutoLabel}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SubtotalChip({ label, value, tone }) {
  const map = {
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
  };
  return (
    <div className={`rounded-lg border p-2.5 ${map[tone] || ''}`}>
      <p className="text-[11px] opacity-70">{label}</p>
      <p className="text-base font-bold tabular-nums">{formatVnd(value)}</p>
    </div>
  );
}

function NumField({ label, value, onChange, min = 0, step = 'any' }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input
        type="number"
        className={inputClass}
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  );
}

function CheckRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
      <input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function PriceCard({ label, value, margin, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-rose-300 bg-white shadow-sm' : 'border-gray-200 bg-white/80'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{formatVnd(value)}</p>
      <p className="text-[11px] text-gray-400">margin {Math.round((margin || 0) * 100)}%</p>
    </div>
  );
}
