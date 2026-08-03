/**
 * Wizard thiết kế hộp cứng (trước bước tính COST):
 * 1. Quy trình → 2. Chọn mẫu → 3. Nhập thông số → 4. Xem bóc tách
 */
import { useMemo, useState, lazy, Suspense, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  ListOrdered,
  LayoutGrid,
  SlidersHorizontal,
  Layers,
  ChevronRight,
  ChevronLeft,
  Check,
  Calculator,
} from 'lucide-react';
import {
  getTemplateById,
  RIGID_BOX_FAMILIES,
} from '../../lib/rigidBoxCatalog';
import { buildDielineForTemplate, modelToPrimaryFlat, downloadSvg } from '../../lib/rigidBoxDieline';
import { DEFAULT_SHEETS, resolveSheets } from '../../lib/hopCungCost';
import RigidBoxTemplatePicker from '../../components/calc/RigidBoxTemplatePicker';
import DielineStudioCanvas from '../../components/calc/boxstudio/DielineStudioCanvas';
import HopCungSheetSetup from '../../components/calc/HopCungSheetSetup';
import { MATERIAL_PRESETS } from '../../components/calc/boxstudio/materialPresets';
import { openingForFamily } from '../../components/calc/boxstudio/familyOpening';
import { HOP_CUNG_DESIGN_KEY } from '../../lib/hopCungDesignDraft';

const BoxStudioViewport = lazy(() => import('../../components/calc/boxstudio/BoxStudioViewport'));

const STEPS = [
  {
    id: 'process',
    label: 'Quy trình',
    icon: ListOrdered,
    desc: 'Xem các bước thiết kế → báo giá',
  },
  {
    id: 'template',
    label: 'Chọn mẫu',
    icon: LayoutGrid,
    desc: 'Chọn kiểu hộp trong thư viện',
  },
  {
    id: 'params',
    label: 'Nhập thông số',
    icon: SlidersHorizontal,
    desc: 'L × W × H, độ dày, nắp',
  },
  {
    id: 'explode',
    label: 'Xem bóc tách',
    icon: Layers,
    desc: 'Dieline multi-part + 3D',
  },
];

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500';

const NEEDS_LID_H = new Set(['lid_base', 'magnetic', 'tall_bottle', 'flip_top', 'double_door', 'shoulder']);

const SIZE_MODES = [
  { id: 'manufacture', label: 'Manufacture dimensions' },
  { id: 'inner', label: 'Inner dimensions' },
  { id: 'outer', label: 'Outer dimensions' },
];

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(HOP_CUNG_DESIGN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(data) {
  try {
    sessionStorage.setItem(HOP_CUNG_DESIGN_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export default function HopCungDesignWizardPage() {
  const navigate = useNavigate();
  const draft = useMemo(() => loadDraft(), []);
  const [step, setStep] = useState(0);

  const [templateId, setTemplateId] = useState(draft?.templateId || 'double-door-gift');
  const template = useMemo(() => getTemplateById(templateId), [templateId]);
  const fam = RIGID_BOX_FAMILIES[template.family];

  const [L, setL] = useState(draft?.L ?? template.defaults.L);
  const [W, setW] = useState(draft?.W ?? template.defaults.W);
  const [H, setH] = useState(draft?.H ?? template.defaults.H);
  const [lidH, setLidH] = useState(
    draft?.lidH ?? template.defaults.lidH ?? Math.max(template.defaults.H * 0.45, 2)
  );
  const [T, setT] = useState(draft?.T ?? 0.15);
  const [customer, setCustomer] = useState(draft?.customer || '');
  const [openT, setOpenT] = useState(0.45);
  const [sizeMode, setSizeMode] = useState('manufacture');
  const [materialId, setMaterialId] = useState('white_card');
  const [unit, setUnit] = useState('cm');
  const [sheetMode, setSheetMode] = useState(draft?.sheetMode === 'manual' ? 'manual' : 'auto');
  const [sheetSetup, setSheetSetup] = useState({
    ...DEFAULT_SHEETS,
    ...(draft?.sheetSetup || {}),
  });
  const [copiesMode, setCopiesMode] = useState(draft?.copiesMode === 'manual' ? 'manual' : 'auto');
  const [copiesPerSheet, setCopiesPerSheet] = useState(
    draft?.copiesPerSheet != null ? Number(draft.copiesPerSheet) : null
  );
  const [copiesByPart, setCopiesByPart] = useState(draft?.copiesByPart || null);

  const selectTemplate = useCallback((tpl) => {
    setTemplateId(tpl.id);
    setL(tpl.defaults.L);
    setW(tpl.defaults.W);
    setH(tpl.defaults.H);
    setLidH(tpl.defaults.lidH ?? Math.max(tpl.defaults.H * 0.45, 2));
  }, []);

  const resolvedSheets = useMemo(
    () => resolveSheets(sheetMode, sheetSetup, { L, W, H }),
    [sheetMode, sheetSetup, L, W, H]
  );

  const dieline = useMemo(
    () => buildDielineForTemplate(templateId, { L, W, H, T, lidH }),
    [templateId, L, W, H, T, lidH]
  );
  const primaryFlat = useMemo(
    () =>
      modelToPrimaryFlat(dieline, {
        sheetMode,
        sheetSetup: resolvedSheets,
        copiesPerSheet: copiesMode === 'manual' && !copiesByPart ? copiesPerSheet : null,
        copiesByPart: copiesMode === 'manual' ? copiesByPart : null,
      }),
    [dieline, sheetMode, resolvedSheets, copiesMode, copiesPerSheet, copiesByPart]
  );
  const svgParts = useMemo(() => (primaryFlat?.svg ? [primaryFlat] : []), [primaryFlat]);
  const opening = openingForFamily(template.family);
  const needsLidH = NEEDS_LID_H.has(template.family);

  const sheetAutoLabel = useMemo(() => {
    const nestSheet = primaryFlat?.sheet;
    const nestPart = nestSheet
      ? `${nestSheet.label || nestSheet.id} · ${nestSheet.w}×${nestSheet.h} cm`
      : null;
    return [
      nestPart ? `2D: ${nestPart}` : null,
      `COST CB ${resolvedSheets.chipboardW}×${resolvedSheets.chipboardH}`,
      `Giấy ${resolvedSheets.paperW}×${resolvedSheets.paperH} cm`,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [primaryFlat?.sheet, resolvedSheets]);

  const persist = useCallback(() => {
    const data = {
      templateId,
      L,
      W,
      H,
      T,
      lidH,
      customer,
      family: template.family,
      sheetMode,
      sheetSetup: sheetMode === 'manual' ? sheetSetup : resolvedSheets,
      copiesMode,
      copiesPerSheet: copiesMode === 'manual' ? copiesPerSheet : null,
      copiesByPart: copiesMode === 'manual' ? copiesByPart : null,
    };
    saveDraft(data);
    return data;
  }, [
    templateId,
    L,
    W,
    H,
    T,
    lidH,
    customer,
    template.family,
    sheetMode,
    sheetSetup,
    resolvedSheets,
    copiesMode,
    copiesPerSheet,
    copiesByPart,
  ]);

  const goNext = () => {
    persist();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const goToCost = () => {
    const data = persist();
    const q = new URLSearchParams({
      templateId: data.templateId,
      L: String(data.L),
      W: String(data.W),
      H: String(data.H),
      T: String(data.T),
      lidH: String(data.lidH),
      from: 'thiet-ke',
    });
    if (data.customer) q.set('customer', data.customer);
    navigate(`/calc/hop-cung?${q.toString()}`);
  };

  return (
    <div className={`${step === 2 ? 'max-w-[1440px]' : 'max-w-[1200px]'} mx-auto space-y-4`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {step === 2 ? 'Dieline generator' : 'Thiết kế hộp cứng'}
            </h1>
            <p className="text-sm text-gray-500">
              {step === 2
                ? `${template.name} · ${fam?.name} · kích thước · 2D · 3D`
                : 'Quy trình → chọn mẫu → thông số → bóc tách · trước khi tính COST'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => svgParts.forEach((p, i) => setTimeout(() => downloadSvg(p.svg, p.filename), i * 100))}
              className="inline-flex items-center gap-1.5 text-sm text-white bg-sky-600 hover:bg-sky-700 px-3 py-1.5 rounded-lg"
            >
              Tải dieline SVG
            </button>
          ) : null}
          <Link
            to="/calc/hop-cung"
            className="inline-flex items-center gap-1.5 text-sm text-rose-700 hover:text-rose-900 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50"
          >
            <Calculator className="h-4 w-4" />
            Sang tính giá
          </Link>
        </div>
      </div>

      {/* Stepper */}
      <nav className="bg-white border border-gray-200 rounded-xl p-3 overflow-x-auto">
        <ol className="flex items-center gap-1 min-w-max">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <li key={s.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (i <= step || (i === step + 1 && step >= 1)) {
                      if (i > 0) persist();
                      setStep(i);
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    active
                      ? 'bg-indigo-50 ring-1 ring-indigo-200'
                      : done
                        ? 'hover:bg-gray-50'
                        : 'opacity-60'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${active ? 'text-indigo-900' : 'text-gray-800'}`}>
                      {s.label}
                    </span>
                    <span className="block text-[11px] text-gray-400">{s.desc}</span>
                  </span>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-500' : 'text-gray-300'}`} />
                </button>
                {i < STEPS.length - 1 ? <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5" /> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="bg-white border border-gray-200 rounded-xl min-h-[420px]">
        {step === 0 ? <StepProcess onStart={goNext} /> : null}
        {step === 1 ? (
          <div className="p-3 space-y-2">
            <p className="text-sm text-gray-600 px-1">
              Chọn mẫu như thư viện Pacdora — thẻ gồm <strong>dieline 2D</strong> + <strong>mockup 3D</strong>.
              Đã chọn: <strong className="text-indigo-700">{template.nameEn || template.name}</strong>
            </p>
            <RigidBoxTemplatePicker selectedId={templateId} onSelect={selectTemplate} />
          </div>
        ) : null}
        {step === 2 ? (
          <div className="p-0 overflow-hidden">
            {/* Pacdora layout: Size | 2D | 3D */}
            <div className="grid grid-cols-1 xl:grid-cols-12 min-h-[560px]">
              {/* LEFT — Custom size */}
              <aside className="xl:col-span-2 border-b xl:border-b-0 xl:border-r border-gray-200 bg-white p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-900">Custom Size</p>
                  <p className="text-[11px] text-gray-400 truncate">{template.name}</p>
                </div>

                <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
                  {['cm', 'mm'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`flex-1 py-1.5 ${
                        unit === u ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                <NumField
                  label={`Length (${unit})`}
                  value={unit === 'mm' ? Math.round(L * 10) : L}
                  onChange={(v) => setL(unit === 'mm' ? v / 10 : v)}
                />
                <NumField
                  label={`Width (${unit})`}
                  value={unit === 'mm' ? Math.round(W * 10) : W}
                  onChange={(v) => setW(unit === 'mm' ? v / 10 : v)}
                />
                <NumField
                  label={`Height (${unit})`}
                  value={unit === 'mm' ? Math.round(H * 10) : H}
                  onChange={(v) => setH(unit === 'mm' ? v / 10 : v)}
                />

                <label className="block">
                  <span className="text-xs text-gray-500">Choose material</span>
                  <select
                    className={inputClass}
                    value={materialId}
                    onChange={(e) => setMaterialId(e.target.value)}
                  >
                    {MATERIAL_PRESETS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <NumField
                      label={`Thickness (${unit})`}
                      value={unit === 'mm' ? Math.round(T * 10 * 10) / 10 : T}
                      onChange={(v) => setT(unit === 'mm' ? v / 10 : v)}
                      step={unit === 'mm' ? 0.1 : 0.01}
                    />
                  </div>
                  <div className="flex flex-col gap-1 pb-0.5">
                    <button
                      type="button"
                      className="w-8 h-8 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                      onClick={() => setT((t) => Math.round((t + 0.05) * 100) / 100)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="w-8 h-8 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm"
                      onClick={() => setT((t) => Math.max(0.05, Math.round((t - 0.05) * 100) / 100))}
                    >
                      −
                    </button>
                  </div>
                </div>

                {needsLidH ? (
                  <NumField
                    label={`Lid H (${unit})`}
                    value={unit === 'mm' ? Math.round(lidH * 10) : lidH}
                    onChange={(v) => setLidH(unit === 'mm' ? v / 10 : v)}
                  />
                ) : null}

                <div className="pt-1 border-t border-gray-100">
                  <HopCungSheetSetup
                    compact
                    mode={sheetMode}
                    onModeChange={(m) => {
                      if (m === 'manual') setSheetSetup(resolvedSheets);
                      setSheetMode(m);
                    }}
                    sheets={sheetMode === 'auto' ? resolvedSheets : sheetSetup}
                    onSheetsChange={setSheetSetup}
                    autoLabel={sheetAutoLabel}
                  />
                </div>

                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Size Mode</p>
                  <div className="flex flex-col gap-1">
                    {SIZE_MODES.map((m) => (
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
                </div>

                <label className="block pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Khách hàng</span>
                  <input
                    className={inputClass}
                    value={customer}
                    onChange={(e) => setCustomer(e.target.value)}
                    placeholder="Tên / mã đơn"
                  />
                </label>

                <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-[11px] text-gray-600 space-y-0.5">
                  <p className="font-medium text-gray-800">{fam?.name}</p>
                  <p className="tabular-nums">
                    {L} × {W} × {H} cm · T={T}
                    {needsLidH ? ` · lid ${lidH}` : ''}
                  </p>
                  <p className="text-gray-400">
                    Mặt: {(primaryFlat?.faces || []).join(' · ') || '—'} · {Math.round(primaryFlat?.areaCm2 || 0)} cm²
                  </p>
                </div>
              </aside>

              {/* CENTER — 2D workspace */}
              <div className="xl:col-span-7 min-h-[520px] border-b xl:border-b-0 xl:border-r border-gray-200">
                <DielineStudioCanvas
                  parts={svgParts}
                  templateName={template.name}
                  layout="studio"
                  embedded
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
              <aside className="xl:col-span-3 bg-slate-50/50 p-3 space-y-3">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden min-w-0">
                  <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-800">3D</p>
                    <span className="text-[10px] text-gray-400">kéo xoay</span>
                  </div>
                  <Suspense
                    fallback={
                      <div className="h-52 flex items-center justify-center text-xs text-gray-400">
                        Đang tải 3D…
                      </div>
                    }
                  >
                    <BoxStudioViewport
                      className="h-52 w-full min-w-0"
                      widthCm={W}
                      heightCm={H}
                      lengthCm={L}
                      lidH={lidH}
                      family={template.family}
                      opening={opening}
                      openT={openT}
                      onOpenTChange={setOpenT}
                      materialId={materialId}
                      showDimensions
                      colorByFace
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
                      className="text-[11px] py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
                      onClick={() =>
                        svgParts.forEach((p, i) =>
                          setTimeout(() => downloadSvg(p.svg, p.filename), i * 120)
                        )
                      }
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      disabled
                      className="text-[11px] py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 cursor-not-allowed"
                      title="Chưa hỗ trợ"
                    >
                      AI
                    </button>
                    <button
                      type="button"
                      disabled
                      className="text-[11px] py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 cursor-not-allowed"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      disabled
                      className="text-[11px] py-2 rounded-lg border border-dashed border-gray-300 text-gray-400 cursor-not-allowed"
                    >
                      DXF
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    SVG từng tấm blank (hardboard / wrapping). AI · PDF · DXF sắp có.
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-3 text-[11px] text-gray-600 space-y-1.5">
                  <p className="font-semibold text-gray-800">You will get</p>
                  <ul className="space-y-1 list-disc pl-4 text-gray-500">
                    <li>Dieline 2D Bleed / Trim / Crease</li>
                    <li>Kích thước blank + diện tích giấy (cm² / m²)</li>
                    <li>Mockup 3D mở–đóng nắp</li>
                    <li>Xuất SVG sẵn in / bế</li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Bóc tách cấu trúc</h2>
                <p className="text-xs text-gray-500">
                  {template.name} · {L}×{W}×{H} cm · {dieline.parts?.length || 0} tấm NVL · 1 bản trải 2D
                </p>
              </div>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                onClick={() => {
                  if (primaryFlat?.svg) downloadSvg(primaryFlat.svg, primaryFlat.filename);
                }}
              >
                Tải SVG trải 2D
              </button>
            </div>

            {/* BOM / bóc tách table */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Tên tấm</th>
                    <th className="px-3 py-2 font-medium">Loại</th>
                    <th className="px-3 py-2 font-medium text-right">Khổ blank (cm)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(dieline.parts || []).map((part, i) => {
                    const mat =
                      part?.material === 'wrapping'
                        ? 'Giấy bọc'
                        : part?.material === 'connection'
                          ? 'Connection'
                          : 'Hardboard';
                    const blank = part.blankSizeCm || {};
                    return (
                      <tr key={(part.kind || i) + (part.label || '')} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-800">{part.label || part.kind}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex text-[11px] px-2 py-0.5 rounded-full ${
                              mat === 'Giấy bọc'
                                ? 'bg-sky-50 text-sky-800'
                                : mat === 'Connection'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-orange-50 text-orange-800'
                            }`}
                          >
                            {mat}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {blank.w} × {blank.h}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-3 min-h-[360px]">
                <DielineStudioCanvas
                  parts={svgParts}
                  templateName={template.name}
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
              <div className="lg:col-span-2 bg-slate-50 border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 bg-white space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-800">3D Preview</p>
                    <span className="text-[10px] text-gray-400">kéo xoay · zoom</span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] font-medium">
                    <span className="rounded bg-rose-50 px-1 py-0.5 text-rose-700 border border-rose-200">W cm</span>
                    <span className="rounded bg-sky-50 px-1 py-0.5 text-sky-700 border border-sky-200">L cm</span>
                    <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-700 border border-emerald-200">H cm</span>
                    <span className="text-rose-500">● Nắp</span>
                    <span className="text-sky-500">● Đáy</span>
                  </div>
                </div>
                <Suspense
                  fallback={
                    <div className="h-72 flex items-center justify-center text-xs text-gray-400">Đang tải 3D…</div>
                  }
                >
                  <BoxStudioViewport
                    className="h-72 w-full"
                    widthCm={W}
                    heightCm={H}
                    lengthCm={L}
                    lidH={lidH}
                    family={template.family}
                    opening={opening}
                    openT={openT}
                    onOpenTChange={setOpenT}
                    materialId="white_card"
                    showDimensions
                    colorByFace
                    thicknessCm={T}
                    compactControls
                  />
                </Suspense>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại
        </button>
        <div className="flex items-center gap-2">
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={step === 1 && !templateId}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
            >
              Tiếp tục
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={goToCost}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"
            >
              <Calculator className="h-4 w-4" />
              Tiếp: Tính COST
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepProcess({ onStart }) {
  const items = [
    {
      n: 1,
      title: 'Chọn mẫu hộp',
      body: 'Chọn trong thư viện rigid (âm dương, double door, drawer, flip…). Cùng họ = cùng cấu trúc.',
    },
    {
      n: 2,
      title: 'Nhập thông số',
      body: 'Length, Width, Height, Thickness (và H nắp nếu có). Đơn vị cm.',
    },
    {
      n: 3,
      title: 'Xem bóc tách',
      body: 'Danh sách tấm hardboard / giấy bọc (canh rìa) / connection + dieline 2D + preview 3D Open/Close.',
    },
    {
      n: 4,
      title: 'Tính COST',
      body: 'Sang trang báo giá NextGo: Nắp / Đáy / Gia công → giá bán 300/500/1000.',
    },
  ];
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Quy trình thiết kế hộp cứng</h2>
        <p className="text-sm text-gray-500 mt-1">
          Làm lần lượt các bước dưới. Sau khi bóc tách xong mới chuyển sang tính giá.
        </p>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((it) => (
          <li key={it.n} className="rounded-xl border border-gray-200 p-4 flex gap-3">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
              {it.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{it.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{it.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
      >
        Bắt đầu chọn mẫu
        <ChevronRight className="h-4 w-4" />
      </button>
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
