import { useState, useRef, useMemo, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../lib/auth';
import {
  Upload, Check, Palette, Image as ImageIcon, SlidersHorizontal, Trash2, Eye,
  CloudUpload, CloudDownload, Loader2, Layers, Type, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  BACKGROUND_PRESETS, CATEGORY_LABELS, TEXT_PALETTES, findPreset,
} from '../lib/backgroundPresets';

const SIDEBAR_STYLE_OPTIONS = [
  { id: 'solid', label: 'Đặc', desc: 'Sidebar tô màu đầy đủ — rõ ràng, tương phản cao.', emoji: '🧱' },
  { id: 'transparent', label: 'Trong suốt', desc: 'Gần như xuyên thấu — thấy hình nền phía sau, có blur nhẹ giữ chữ dễ đọc.', emoji: '🌫️' },
  { id: 'frosted', label: 'Bóng mờ kính', desc: 'Hiệu ứng kính mờ (frosted glass) như Bitrix24 / iOS.', emoji: '✨' },
];

const CATEGORIES = ['aurora', 'minimal', 'pastel', 'landscape', 'animated'];

/** Số ô hiển thị khi lưới đang thu gọn (≈ 1 hàng desktop). */
const COLLAPSED_GRID_COUNT = 7;

export default function ThemeSettingsPage() {
  const { user } = useAuth();
  const {
    theme, changeTheme, setBackgroundImage, setOverlayOpacity, setSidebarStyle,
    setBgPreset, clearBackground, setTextColors, presets,
    pushThemeToServer, pullThemeFromServer,
  } = useTheme();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gridExpanded, setGridExpanded] = useState(false);

  const activePreset = useMemo(() => findPreset(theme.bgPreset), [theme.bgPreset]);
  const filteredPresets = useMemo(
    () => (activeTab === 'all' ? BACKGROUND_PRESETS : BACKGROUND_PRESETS.filter((p) => p.category === activeTab)),
    [activeTab],
  );

  const visiblePresets = useMemo(() => {
    if (gridExpanded || filteredPresets.length <= COLLAPSED_GRID_COUNT) {
      return filteredPresets;
    }
    const activeId = activePreset?.id;
    const inTab = activeId && filteredPresets.some((p) => p.id === activeId);
    if (!inTab) {
      return filteredPresets.slice(0, COLLAPSED_GRID_COUNT);
    }
    const head = filteredPresets.filter((p) => p.id !== activeId).slice(0, COLLAPSED_GRID_COUNT - 1);
    const active = filteredPresets.find((p) => p.id === activeId);
    return active ? [active, ...head] : filteredPresets.slice(0, COLLAPSED_GRID_COUNT);
  }, [filteredPresets, gridExpanded, activePreset?.id]);

  useEffect(() => { setGridExpanded(false); }, [activeTab]);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => { setBackgroundImage(ev.target.result); setUploading(false); };
    reader.readAsDataURL(file);
  };

  const overlayVal = parseFloat((theme.bgOverlay || '').match(/[\d.]+(?=\))/)?.[0] || 0);

  const restoreFactoryDefault = () => {
    const def = presets.find((p) => p.id === 'default') ?? presets[0];
    changeTheme({ ...def, bgPreset: null, bgImage: null });
  };

  // ── Màu chữ hiệu lực hiện tại (auto theo preset hoặc dark default) ──
  const currentTextPalette = useMemo(() => {
    if (activePreset?.textTheme) return TEXT_PALETTES[activePreset.textTheme] || TEXT_PALETTES.dark;
    return {
      textHeading: theme.textHeading || '#111827',
      textBody: theme.textBody || '#374151',
      textMuted: theme.textMuted || '#6b7280',
      textCard: theme.textCard || '#1f2937',
    };
  }, [activePreset, theme]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Palette className="h-6 w-6" /> Giao diện & Hình nền
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Chọn 1 trong 21 hình nền 4K / nền động — màu chữ tự động chỉnh để dễ đọc trên mọi nền.
        </p>

        <div className="flex flex-wrap gap-3 mt-4 items-center">
          <button
            type="button"
            disabled={!user?.userId || pushing}
            onClick={async () => {
              setPushing(true);
              try {
                await pushThemeToServer();
                alert('Đã đẩy giao diện hiện tại lên máy chủ cho tài khoản của bạn.');
              } catch (e) {
                alert(e.response?.data?.error || e.message || 'Không đẩy được lên máy chủ.');
              } finally {
                setPushing(false);
              }
            }}
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            Đẩy lên máy chủ
          </button>
          <button
            type="button"
            disabled={!user?.userId || pulling}
            onClick={async () => {
              if (!window.confirm('Tải giao diện đã lưu trên máy chủ sẽ thay thế giao diện đang chỉnh trên máy này. Tiếp tục?')) return;
              setPulling(true);
              try {
                await pullThemeFromServer();
                alert('Đã tải giao diện từ máy chủ và áp dụng.');
              } catch (e) {
                alert(e.response?.data?.error || e.message || 'Không tải được từ máy chủ.');
              } finally {
                setPulling(false);
              }
            }}
            className="h-10 px-4 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none text-gray-800 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            Tải từ máy chủ
          </button>
          {!user?.userId && (
            <span className="text-xs text-gray-500">Đăng nhập để đồng bộ giao diện với máy chủ.</span>
          )}
          {(theme.bgPreset || theme.bgImage) && (
            <button
              type="button"
              onClick={restoreFactoryDefault}
              className="h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer border border-gray-300"
            >
              🔄 Khôi phục mặc định
            </button>
          )}
        </div>
      </div>

      {/* GỘP: Background gallery + Upload */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <BackgroundPreviewThumb
            preset={activePreset}
            bgImage={theme.bgImage}
            bgOverlay={theme.bgOverlay}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 shrink-0" /> Chọn hình nền
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {activePreset
                ? `Đang dùng: ${activePreset.name}`
                : theme.bgImage
                  ? 'Đang dùng ảnh tự tải'
                  : 'Chưa chọn — đang dùng nền mặc định'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(activePreset || theme.bgImage) && (
              <button
                type="button"
                onClick={clearBackground}
                className="h-7 px-2.5 inline-flex items-center gap-1 text-[11px] font-medium border border-rose-200 text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" /> Xoá
              </button>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="h-8 px-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer"
            >
              {pickerOpen ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" /> Thu gọn
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" /> Chọn / đổi
                </>
              )}
            </button>
          </div>
        </div>

        {pickerOpen && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 mb-2">
              21 nền 4K / động — màu chữ tự chỉnh theo nền.
            </p>

            {/* Tabs — cuộn ngang gọn */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {[
                { id: 'all', label: `Tất cả (${BACKGROUND_PRESETS.length})` },
                ...CATEGORIES.map((c) => ({
                  id: c,
                  label: `${CATEGORY_LABELS[c]} (${BACKGROUND_PRESETS.filter((p) => p.category === c).length})`,
                })),
                { id: 'upload', label: 'Tải ảnh riêng' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === t.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'upload' ? (
              <div className="flex flex-wrap gap-4 items-start">
                <div
                  className="w-48 h-32 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden relative flex items-center justify-center bg-gray-50"
                  style={theme.bgImage ? { backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                >
                  {!theme.bgImage && (
                    <div className="text-center">
                      <ImageIcon className="h-7 w-7 text-gray-300 mx-auto mb-1" />
                      <p className="text-[11px] text-gray-400">Chưa có ảnh</p>
                    </div>
                  )}
                  {theme.bgImage && <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />}
                </div>
                <div className="flex-1 space-y-3 min-w-[200px]">
                  <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="h-4 w-4" /> {uploading ? 'Đang tải…' : 'Chọn hình từ máy'}
                  </button>
                  {theme.bgImage && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <SlidersHorizontal className="h-3 w-3 inline mr-1" />
                        Độ phủ tối: {Math.round(overlayVal * 100)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="0.8"
                        step="0.02"
                        value={overlayVal}
                        onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400">JPG / PNG / WebP · khuyến nghị ≥ 1920×1080</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
                  {visiblePresets.map((preset) => (
                    <PresetTile
                      key={preset.id}
                      preset={preset}
                      active={activePreset?.id === preset.id}
                      onClick={() => setBgPreset(preset.id)}
                    />
                  ))}
                </div>
                {filteredPresets.length > COLLAPSED_GRID_COUNT && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => setGridExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 h-7 px-3 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full cursor-pointer"
                    >
                      {gridExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" /> Thu gọn danh sách
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" /> Xem tất cả ({filteredPresets.length} hình)
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Màu chữ — tuỳ chỉnh thủ công (đè lên auto từ preset) */}
      <TextColorSection
        theme={theme}
        activePreset={activePreset}
        onApply={setTextColors}
      />

      {/* Sidebar style */}
      <div className="bg-white rounded-xl border p-5">
        <div className="mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-4 w-4" /> Hiệu ứng sidebar
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Chọn cách hiển thị thanh điều hướng bên trái. Bóng mờ kính đẹp nhất khi có hình nền / nền động.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SIDEBAR_STYLE_OPTIONS.map((opt) => {
            const active = (theme.sidebarStyle || 'solid') === opt.id;
            const bgPreview =
              activePreset?.thumb || activePreset?.gradient || activePreset?.baseGradient
              || (theme.bgImage ? `url(${theme.bgImage})` : 'linear-gradient(135deg, #c7d2fe 0%, #fbcfe8 50%, #fde68a 100%)');
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSidebarStyle(opt.id)}
                className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  active ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className="relative h-20 rounded-lg overflow-hidden mb-2 border border-gray-200"
                  style={
                    bgPreview.startsWith('url') || bgPreview.startsWith('http')
                      ? { backgroundImage: bgPreview.startsWith('url') ? bgPreview : `url(${bgPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : { background: bgPreview }
                  }
                >
                  <div
                    className="absolute inset-y-0 left-0 w-1/3 flex flex-col gap-1 p-1.5"
                    style={{
                      backgroundColor:
                        opt.id === 'solid'
                          ? (activePreset?.sidebar || theme.sidebar)
                          : opt.id === 'transparent'
                            ? `${activePreset?.sidebar || theme.sidebar}48`
                            : `${activePreset?.sidebar || theme.sidebar}80`,
                      backdropFilter:
                        opt.id === 'frosted'
                          ? 'blur(8px) saturate(180%)'
                          : opt.id === 'transparent'
                            ? 'blur(3px) saturate(130%)'
                            : 'none',
                      WebkitBackdropFilter:
                        opt.id === 'frosted'
                          ? 'blur(8px) saturate(180%)'
                          : opt.id === 'transparent'
                            ? 'blur(3px) saturate(130%)'
                            : 'none',
                    }}
                  >
                    <div className="h-1.5 rounded bg-white/85" />
                    <div className="h-1.5 rounded bg-white/55" />
                    <div className="h-1.5 rounded bg-white/35" />
                    <div className="h-1.5 rounded bg-white/55" />
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <span aria-hidden>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{opt.desc}</p>
                {active && (
                  <span className="absolute top-2 right-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-500 text-white shadow-sm">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live preview — auto color theo preset đang chọn */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Eye className="h-4 w-4" /> Xem trước thực tế
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          {activePreset
            ? `Đang dùng: ${activePreset.name} · màu chữ tự đổi sang ${activePreset.textTheme === 'light' ? 'bộ chữ sáng' : 'bộ chữ tối'}.`
            : 'Chưa chọn hình nền — đang dùng nền mặc định.'}
        </p>
        <div className="rounded-xl overflow-hidden border" style={{ minHeight: 240 }}>
          <div className="flex h-full">
            <div className="w-14 flex-shrink-0" style={{ backgroundColor: activePreset?.sidebar || theme.sidebar }}>
              <div className="p-2 space-y-2 mt-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: i === 1 ? (activePreset?.accent || theme.sidebarActive) : '#ffffff',
                      opacity: i === 1 ? 0.9 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              className="flex-1 relative"
              style={
                activePreset?.type === 'image'
                  ? { backgroundImage: `url(${activePreset.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : activePreset?.type === 'gradient'
                    ? { background: activePreset.gradient }
                    : activePreset?.type === 'animated'
                      ? { background: activePreset.baseGradient }
                      : theme.bgImage
                        ? { backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: theme.pageBg }
                        : { backgroundColor: theme.pageBg }
              }
            >
              {activePreset?.type === 'image' && (
                <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }} />
              )}
              {theme.bgImage && !activePreset && (
                <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />
              )}
              <div className="relative p-5 space-y-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: currentTextPalette.textHeading }}>
                    Mẫu tiêu đề
                  </h2>
                  <p className="text-sm mt-1" style={{ color: currentTextPalette.textMuted }}>
                    Chữ phụ mẫu — Dashboard tổng quan, 34 dự án đang hoạt động
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { title: 'Đang thực hiện', value: '12' },
                    { title: 'Hoàn thành', value: '18' },
                    { title: 'Quá hạn', value: '4' },
                  ].map((card) => (
                    <div key={card.title} className="bg-white/75 backdrop-blur-sm rounded-lg border border-white/40 p-3">
                      <p className="text-xs font-medium text-gray-600">{card.title}</p>
                      <p className="text-2xl font-bold mt-1 text-gray-900">{card.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/75 backdrop-blur-sm rounded-lg border border-white/40 p-3">
                  <p className="text-sm font-bold mb-1 text-gray-900">Nội dung mẫu</p>
                  <p className="text-xs text-gray-700">
                    Khi đổi nền, tiêu đề và chữ phụ tự đổi màu để luôn dễ đọc (sáng trên nền tối / xanh đậm trên nền pastel).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Section tuỳ chỉnh màu chữ — 4 màu (Tiêu đề / Nội dung / Chữ phụ / Chữ trong card).
 * Mặc định auto theo preset (textTheme=light/dark). Khi user chỉnh thì override.
 * Nút "Khôi phục auto" để xoá override, quay về palette của preset.
 */
function TextColorSection({ theme, activePreset, onApply }) {
  // Auto palette từ preset (đọc-only)
  const autoPalette = useMemo(() => {
    if (activePreset?.textTheme) return TEXT_PALETTES[activePreset.textTheme] || TEXT_PALETTES.dark;
    return {
      textHeading: '#111827',
      textBody: '#374151',
      textMuted: '#6b7280',
      textCard: '#1f2937',
    };
  }, [activePreset]);

  // Local state khởi tạo từ override (theme.*) nếu có, không thì auto
  const [colors, setColors] = useState(() => ({
    textHeading: theme.textHeading || autoPalette.textHeading,
    textBody: theme.textBody || autoPalette.textBody,
    textMuted: theme.textMuted || autoPalette.textMuted,
    textCard: theme.textCard || autoPalette.textCard,
  }));

  // Khi đổi preset → sync hiển thị về palette mới (chỉ khi user chưa override)
  useEffect(() => {
    const hasOverride = theme.textHeading || theme.textBody || theme.textMuted || theme.textCard;
    if (!hasOverride) {
      setColors({
        textHeading: autoPalette.textHeading,
        textBody: autoPalette.textBody,
        textMuted: autoPalette.textMuted,
        textCard: autoPalette.textCard,
      });
    }
  }, [autoPalette, theme.textHeading, theme.textBody, theme.textMuted, theme.textCard]);

  const isOverridden = !!(theme.textHeading || theme.textBody || theme.textMuted || theme.textCard);

  const fields = [
    { k: 'textHeading', label: 'Tiêu đề (H1, H2…)', sample: 'Mẫu tiêu đề', cls: 'text-sm font-bold' },
    { k: 'textBody', label: 'Nội dung chính', sample: 'Mẫu nội dung', cls: 'text-sm' },
    { k: 'textMuted', label: 'Chữ phụ / mờ', sample: 'Mẫu chữ phụ', cls: 'text-xs' },
    { k: 'textCard', label: 'Chữ trong card', sample: 'Mẫu card', cls: 'text-sm' },
  ];

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Type className="h-4 w-4" /> Màu chữ
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {isOverridden
              ? 'Bạn đã tự chỉnh màu chữ — đang đè lên màu auto từ nền.'
              : `Đang auto theo nền (${activePreset?.textTheme === 'light' ? 'bộ chữ sáng' : 'bộ chữ tối'}). Có thể tuỳ chỉnh thủ công bên dưới.`}
          </p>
        </div>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onApply({ textHeading: null, textBody: null, textMuted: null, textCard: null })}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Khôi phục auto
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fields.map(({ k, label, sample, cls }) => (
          <div key={k} className="rounded-lg border border-gray-200 p-2.5">
            <label className="block text-[11px] font-medium text-gray-600 mb-1.5">{label}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colors[k]}
                onChange={(e) => setColors((p) => ({ ...p, [k]: e.target.value }))}
                className="w-9 h-9 rounded-md cursor-pointer border-0 p-0"
              />
              <input
                type="text"
                value={colors[k]}
                onChange={(e) => setColors((p) => ({ ...p, [k]: e.target.value }))}
                className="flex-1 min-w-0 h-9 px-2 border border-gray-200 rounded-md text-xs font-mono"
              />
            </div>
            <p className={`mt-2 truncate ${cls}`} style={{ color: colors[k] }}>{sample}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply(colors)}
          className="h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
        >
          <Check className="h-4 w-4" /> Áp dụng màu chữ
        </button>
        <button
          type="button"
          onClick={() => setColors({
            textHeading: autoPalette.textHeading,
            textBody: autoPalette.textBody,
            textMuted: autoPalette.textMuted,
            textCard: autoPalette.textCard,
          })}
          className="h-10 px-4 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
        >
          ↺ Dùng màu gợi ý theo nền
        </button>
      </div>
    </div>
  );
}

/** Thumbnail nhỏ nền đang dùng (thu gọn). */
function BackgroundPreviewThumb({ preset, bgImage, bgOverlay }) {
  if (bgImage) {
    return (
      <div
        className="relative shrink-0 w-12 h-12 rounded-lg border border-gray-200 overflow-hidden"
        style={{ backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: bgOverlay }} />
      </div>
    );
  }

  const bg = preset?.thumb || preset?.gradient || preset?.baseGradient || preset?.image;
  const isUrl = typeof bg === 'string' && (bg.startsWith('http') || bg.startsWith('data:'));

  return (
    <div
      className="shrink-0 w-12 h-12 rounded-lg border border-gray-200 overflow-hidden"
      style={
        preset
          ? (isUrl
            ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: bg })
          : { background: 'linear-gradient(135deg, #e5e7eb, #f3f4f6)' }
      }
    />
  );
}

/** Ô preview của 1 background preset — vuông, đồng kích thước, tên overlay trên ảnh. */
function PresetTile({ preset, active, onClick }) {
  const isImage = preset.type === 'image';
  const isAnimated = preset.type === 'animated';
  const bg = preset.thumb || preset.gradient || preset.baseGradient || preset.image;
  const isUrl = typeof bg === 'string' && (bg.startsWith('http') || bg.startsWith('data:'));

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${preset.name} — ${CATEGORY_LABELS[preset.category]}`}
      className={`group relative aspect-square w-full rounded-lg border overflow-hidden transition-all cursor-pointer ${
        active
          ? 'border-blue-500 ring-2 ring-blue-300 ring-offset-1 shadow-sm'
          : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      <div
        className="absolute inset-0"
        style={
          isUrl
            ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: bg }
        }
      />

      {isAnimated && (
        <span className="absolute top-1 right-1 px-1 py-px bg-black/60 text-white text-[8px] font-bold rounded leading-none">
          {preset.scene === 'earth' ? '3D' : 'ĐỘNG'}
        </span>
      )}
      {isImage && (
        <span className="absolute top-1 right-1 px-1 py-px bg-black/60 text-white text-[8px] font-bold rounded leading-none">
          4K
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 px-1.5 pt-4 pb-1 bg-gradient-to-t from-black/75 via-black/35 to-transparent pointer-events-none">
        <p className="text-[10px] font-medium text-white leading-tight line-clamp-2 text-left">
          {preset.name}
        </p>
      </div>

      {active && (
        <span className="absolute top-1 left-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-500 text-white shadow">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
