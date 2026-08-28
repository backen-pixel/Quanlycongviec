import { useState, useRef, useMemo, useEffect } from 'react';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../lib/auth';
import {
  Upload, Check, Palette, Image as ImageIcon, SlidersHorizontal, Trash2, Eye,
  CloudUpload, CloudDownload, Loader2, Layers, Type, RotateCcw, ChevronDown, ChevronUp,
  Monitor, Smartphone, Sparkles, CloudRain, Star, Snowflake, Droplets, Earth,
} from 'lucide-react';
import {
  BACKGROUND_PRESETS, CATEGORY_LABELS, TEXT_PALETTES, findPreset,
} from '../lib/backgroundPresets';
import { useHorizontalDragScroll } from '../lib/useHorizontalDragScroll';

const SIDEBAR_STYLE_OPTIONS = [
  { id: 'solid', label: 'Đục', desc: 'Rõ nét, tương phản cao.', emoji: '🧱' },
  { id: 'transparent', label: 'Trong suốt', desc: 'Xuyên thấu nền.', emoji: '🌫️' },
  { id: 'frosted', label: 'Bóng mờ kính', desc: 'Kính mờ như iOS.', emoji: '✨' },
];

const CATEGORIES = ['aurora', 'minimal', 'pastel', 'landscape', 'animated'];

/** Số ô hiển thị khi lưới đang thu gọn (≈ 2 hàng). */
const COLLAPSED_GRID_COUNT = 11;

const stripEmoji = (s) => String(s || '').replace(/^[\p{Extended_Pictographic}️‍]+\s*/gu, '').trim();

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
  const [gridExpanded, setGridExpanded] = useState(false);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const { ref: tabsRef, onMouseDown: tabsOnMouseDown, onClickCapture: tabsOnClickCapture } = useHorizontalDragScroll({ allowFromButton: true });

  const activePreset = useMemo(() => findPreset(theme.bgPreset), [theme.bgPreset]);
  const filteredPresets = useMemo(
    () => (activeTab === 'all' || activeTab === 'upload'
      ? BACKGROUND_PRESETS
      : BACKGROUND_PRESETS.filter((p) => p.category === activeTab)),
    [activeTab],
  );

  const visiblePresets = useMemo(() => {
    if (activeTab === 'upload') return [];
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
  }, [activeTab, filteredPresets, gridExpanded, activePreset?.id]);

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

  const handlePush = async () => {
    setPushing(true);
    try {
      await pushThemeToServer();
      alert('Đã lưu giao diện lên máy chủ cho tài khoản của bạn.');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không lưu được lên máy chủ.');
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
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
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Palette className="h-6 w-6 text-violet-600" /> Giao diện & Hình nền
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Chọn 1 trong {BACKGROUND_PRESETS.length} hình nền 4K / động — màu chữ tự động chỉnh để luôn dễ đọc trên mọi nền.
          </p>
          {!user?.userId && (
            <p className="text-xs text-gray-400 mt-1">Đăng nhập để đồng bộ giao diện với máy chủ.</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!user?.userId || pulling}
            onClick={handlePull}
            className="h-10 px-4 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            Tải từ máy chủ
          </button>
          <button
            type="button"
            disabled={!user?.userId || pushing}
            onClick={handlePush}
            className="h-10 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-sm"
          >
            {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            Đẩy lên máy chủ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {/* Chọn hình nền */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-violet-600" /> Chọn hình nền
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Chọn 1 trong {BACKGROUND_PRESETS.length} hình nền 4K / động — màu chữ tự động chỉnh để luôn dễ đọc trên mọi nền.
                </p>
              </div>
              {activeTab !== 'upload' && filteredPresets.length > COLLAPSED_GRID_COUNT && (
                <button
                  type="button"
                  onClick={() => setGridExpanded((v) => !v)}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-800 cursor-pointer"
                >
                  {gridExpanded ? (
                    <>Thu gọn <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Xem thêm <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </button>
              )}
            </div>

            <div
              ref={tabsRef}
              onMouseDown={tabsOnMouseDown}
              onClickCapture={tabsOnClickCapture}
              title="Giữ chuột trái và kéo để xem thêm danh mục"
              className="flex gap-1.5 overflow-x-auto pb-1 mb-4 cursor-grab active:cursor-grabbing [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {[
                { id: 'all', label: `Tất cả (${BACKGROUND_PRESETS.length})` },
                ...CATEGORIES.map((c) => ({
                  id: c,
                  label: `${stripEmoji(CATEGORY_LABELS[c])} (${BACKGROUND_PRESETS.filter((p) => p.category === c).length})`,
                })),
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === t.id
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'upload'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Sparkles className="h-3 w-3" /> Tải ảnh riêng
              </button>
            </div>

            {activeTab === 'upload' ? (
              <UploadPanel
                theme={theme}
                uploading={uploading}
                fileRef={fileRef}
                onUpload={handleUpload}
                overlayVal={overlayVal}
                onOverlay={setOverlayOpacity}
              />
            ) : (
              <div className="flex flex-wrap gap-4">
                {visiblePresets.map((preset) => (
                  <PresetCircle
                    key={preset.id}
                    preset={preset}
                    active={activePreset?.id === preset.id}
                    onClick={() => setBgPreset(preset.id)}
                  />
                ))}
                {!gridExpanded && filteredPresets.length > COLLAPSED_GRID_COUNT && (
                  <button
                    type="button"
                    onClick={() => setGridExpanded(true)}
                    className="group flex flex-col items-center gap-1.5 w-[68px] cursor-pointer"
                  >
                    <div className="h-14 w-14 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 bg-gray-50 group-hover:border-violet-400 group-hover:text-violet-600 transition-colors">
                      <span className="text-xs font-bold">+{filteredPresets.length - COLLAPSED_GRID_COUNT}</span>
                    </div>
                    <span className="text-[11px] font-medium text-gray-500 group-hover:text-violet-600">Xem thêm</span>
                  </button>
                )}
              </div>
            )}

            {activeTab !== 'upload' && (activePreset || theme.bgImage) && (
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Đang dùng: <span className="font-medium text-gray-700">{activePreset ? stripEmoji(activePreset.name) : 'Ảnh tự tải'}</span>
                </p>
                <button
                  type="button"
                  onClick={clearBackground}
                  className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Xoá nền
                </button>
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
                <Layers className="h-4 w-4 text-violet-600" /> Hiệu ứng sidebar
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Xem trước giao diện thanh sidebar theo nền mới.
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
                      active ? 'border-violet-500 ring-2 ring-violet-200 shadow-md' : 'border-gray-200 hover:border-gray-300'
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
                      <span className="absolute top-2 right-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-500 text-white shadow-sm">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live preview — auto color theo preset đang chọn */}
        <div className="lg:sticky lg:top-4">
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Eye className="h-4 w-4 text-violet-600" /> Xem trước thực tế
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Trực tiếp
              </span>
            </div>

            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 mb-3">
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  previewDevice === 'desktop' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  previewDevice === 'mobile' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" /> Mobile
              </button>
            </div>

            <div
              className={`rounded-xl overflow-hidden border transition-all ${previewDevice === 'mobile' ? 'max-w-[220px] mx-auto' : 'w-full'}`}
              style={{ minHeight: previewDevice === 'mobile' ? 320 : 220 }}
            >
              <div className="flex h-full">
                {previewDevice === 'desktop' && (
                  <div className="w-12 flex-shrink-0" style={{ backgroundColor: activePreset?.sidebar || theme.sidebar }}>
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
                )}
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
                  <div className="relative p-4 space-y-3">
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: currentTextPalette.textHeading }}>
                        Mẫu tiêu đề
                      </h2>
                      <p className="text-xs mt-1" style={{ color: currentTextPalette.textMuted }}>
                        Dashboard tổng quan — 34 dự án đang hoạt động
                      </p>
                    </div>
                    <div className={previewDevice === 'mobile' ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-3 gap-2'}>
                      {[
                        { title: 'Đang thực hiện', value: '12' },
                        { title: 'Hoàn thành', value: '18' },
                        { title: 'Quá hạn', value: '4' },
                      ].map((card) => (
                        <div key={card.title} className="bg-white/75 backdrop-blur-sm rounded-lg border border-white/40 p-2.5">
                          <p className="text-[11px] font-medium text-gray-600">{card.title}</p>
                          <p className="text-xl font-bold mt-0.5 text-gray-900">{card.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Bảng phối màu hiện tại</p>
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <span
                  className="h-4 w-4 rounded-full ring-1 ring-gray-200 shadow-sm"
                  style={{ background: activePreset?.sidebar || theme.sidebar }}
                  title="Màu sidebar"
                />
                {[currentTextPalette.textHeading, currentTextPalette.textBody, currentTextPalette.textMuted, currentTextPalette.textCard].map((c, i) => (
                  <span key={i} className="h-4 w-4 rounded-full ring-1 ring-gray-200 shadow-sm" style={{ background: c }} />
                ))}
                <span className="text-[11px] text-gray-400 ml-1">Nền + 4 màu chữ</span>
              </div>

              <button
                type="button"
                disabled={!user?.userId || pushing}
                onClick={handlePush}
                className="w-full h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Lưu thay đổi
              </button>
              <button
                type="button"
                onClick={restoreFactoryDefault}
                className="w-full mt-2 text-center text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                Đặt lại mặc định
              </button>
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
  const autoPalette = useMemo(() => {
    if (activePreset?.textTheme) return TEXT_PALETTES[activePreset.textTheme] || TEXT_PALETTES.dark;
    return {
      textHeading: '#111827',
      textBody: '#374151',
      textMuted: '#6b7280',
      textCard: '#1f2937',
    };
  }, [activePreset]);

  const [colors, setColors] = useState(() => ({
    textHeading: theme.textHeading || autoPalette.textHeading,
    textBody: theme.textBody || autoPalette.textBody,
    textMuted: theme.textMuted || autoPalette.textMuted,
    textCard: theme.textCard || autoPalette.textCard,
  }));

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
    { k: 'textHeading', label: 'Tiêu đề', desc: 'Màu tiêu đề', sample: 'Mẫu tiêu đề', cls: 'text-sm font-bold' },
    { k: 'textBody', label: 'Nội dung chính', desc: 'Màu nội dung', sample: 'Mẫu nội dung', cls: 'text-sm' },
    { k: 'textMuted', label: 'Chữ phụ / mờ', desc: 'Màu chữ phụ', sample: 'Mẫu chữ phụ', cls: 'text-xs' },
    { k: 'textCard', label: 'Chữ trong card', desc: 'Màu chữ card', sample: 'Mẫu card', cls: 'text-sm' },
  ];

  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Type className="h-4 w-4 text-violet-600" /> Màu chữ
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {isOverridden
              ? 'Bạn đã tự chỉnh màu chữ — đang đè lên màu auto từ nền.'
              : 'Tự động theo nền — có thể tự chỉnh riêng.'}
          </p>
        </div>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onApply({ textHeading: null, textBody: null, textMuted: null, textCard: null })}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Khôi phục auto
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fields.map(({ k, label, desc, sample, cls }) => (
          <div key={k} className="rounded-lg border border-gray-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">{label}</p>
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="color"
                value={colors[k]}
                onChange={(e) => setColors((p) => ({ ...p, [k]: e.target.value }))}
                className="h-8 w-8 rounded-full cursor-pointer border-0 p-0 shrink-0"
              />
              <input
                type="text"
                value={colors[k]}
                onChange={(e) => setColors((p) => ({ ...p, [k]: e.target.value }))}
                className="flex-1 min-w-0 h-8 px-2 border border-gray-200 rounded-md text-xs font-mono"
              />
            </div>
            <p className="text-[11px] text-gray-400">{desc}</p>
            <p className={`mt-1.5 truncate ${cls}`} style={{ color: colors[k] }}>{sample}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApply(colors)}
          className="h-10 px-5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 cursor-pointer"
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
          Dùng màu gợi ý theo nền
        </button>
      </div>
    </div>
  );
}

/** Khối tải ảnh nền riêng — kéo-thả/chọn từ máy + chỉnh độ phủ tối. */
function UploadPanel({ theme, uploading, fileRef, onUpload, overlayVal, onOverlay }) {
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div
        className="w-48 h-32 rounded-lg border-2 border-dashed border-gray-300 overflow-hidden relative flex items-center justify-center bg-gray-50 shrink-0"
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
        <input type="file" ref={fileRef} accept="image/*" onChange={onUpload} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-9 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer"
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
              onChange={(e) => onOverlay(parseFloat(e.target.value))}
              className="w-full accent-violet-600"
            />
          </div>
        )}
        <p className="text-[11px] text-gray-400">JPG / PNG / WebP · khuyến nghị ≥ 1920×1080</p>
      </div>
    </div>
  );
}

/** Icon đại diện từng scene — nền động dùng gradient tối gần giống nhau, cần icon để phân biệt nhanh. */
const SCENE_ICONS = {
  rain: CloudRain,
  stars: Star,
  snow: Snowflake,
  raindrops: Droplets,
  earth: Earth,
};

/** Ô tròn preview của 1 background preset — tên hiển thị bên dưới, tick khi đang chọn. */
function PresetCircle({ preset, active, onClick }) {
  const isImage = preset.type === 'image';
  const isAnimated = preset.type === 'animated';
  const bg = preset.thumb || preset.gradient || preset.baseGradient || preset.image;
  const isUrl = typeof bg === 'string' && (bg.startsWith('http') || bg.startsWith('data:'));
  const SceneIcon = isAnimated ? SCENE_ICONS[preset.scene] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${preset.name} — ${CATEGORY_LABELS[preset.category]}`}
      className="group flex flex-col items-center gap-1.5 w-[68px] cursor-pointer"
    >
      <div
        className={`relative h-14 w-14 rounded-full overflow-hidden transition-all ${
          active
            ? 'ring-2 ring-violet-500 ring-offset-2 shadow-md'
            : 'ring-1 ring-gray-200 group-hover:ring-violet-300 group-hover:ring-2'
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
        {SceneIcon && (
          <span className="absolute inset-0 flex items-center justify-center">
            <SceneIcon className="h-5 w-5 text-white/85 drop-shadow" strokeWidth={1.75} />
          </span>
        )}
        {(isAnimated || isImage) && (
          <span className="absolute bottom-0.5 right-0.5 px-1 py-px bg-black/60 text-white text-[7px] font-bold rounded leading-none">
            {isAnimated ? (preset.scene === 'earth' ? '3D' : '●') : '4K'}
          </span>
        )}
        {active && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-600 text-white shadow">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          </span>
        )}
      </div>
      <span className={`text-[11px] font-medium text-center leading-tight line-clamp-2 ${active ? 'text-violet-700' : 'text-gray-600 group-hover:text-violet-700'}`}>
        {stripEmoji(preset.name)}
      </span>
    </button>
  );
}
