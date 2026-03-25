import { useState, useRef } from 'react';
import { useTheme } from '../components/ThemeProvider';
import { Upload, Check, Palette, Image, SlidersHorizontal, Trash2, Type, Eye } from 'lucide-react';

const TEXT_PRESETS = [
  { id: 'light', name: '☀️ Sáng (mặc định)', textHeading: '#111827', textBody: '#374151', textMuted: '#6b7280', textCard: '#1f2937' },
  { id: 'dark-bg', name: '🌙 Nền tối', textHeading: '#f9fafb', textBody: '#e5e7eb', textMuted: '#9ca3af', textCard: '#f3f4f6' },
  { id: 'white', name: '⬜ Trắng hoàn toàn', textHeading: '#ffffff', textBody: '#f0f0f0', textMuted: '#d1d5db', textCard: '#ffffff' },
  { id: 'warm', name: '🌅 Ấm áp', textHeading: '#92400e', textBody: '#78350f', textMuted: '#a16207', textCard: '#451a03' },
  { id: 'ocean', name: '🌊 Đại dương', textHeading: '#0c4a6e', textBody: '#075985', textMuted: '#0369a1', textCard: '#0e7490' },
  { id: 'forest', name: '🌲 Rừng xanh', textHeading: '#14532d', textBody: '#166534', textMuted: '#15803d', textCard: '#064e3b' },
  { id: 'cream', name: '🍦 Kem', textHeading: '#fef3c7', textBody: '#fde68a', textMuted: '#d97706', textCard: '#fffbeb' },
  { id: 'neon', name: '💚 Neon', textHeading: '#22d3ee', textBody: '#a3e635', textMuted: '#facc15', textCard: '#34d399' },
];

export default function ThemeSettingsPage() {
  const { theme, changeTheme, setBackgroundImage, setOverlayOpacity, setTextColors, presets } = useTheme();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [customColors, setCustomColors] = useState({
    sidebar: theme.sidebar, pageBg: theme.pageBg, accent: theme.accent,
  });
  const [textColorState, setTextColorState] = useState({
    textHeading: theme.textHeading || '#111827',
    textBody: theme.textBody || '#374151',
    textMuted: theme.textMuted || '#6b7280',
    textCard: theme.textCard || '#1f2937',
  });

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => { setBackgroundImage(ev.target.result); setUploading(false); };
    reader.readAsDataURL(file);
  };

  const removeBackground = () => changeTheme({ ...theme, bgImage: null, bgOverlay: 'rgba(0,0,0,0)' });

  const applyCustomColors = () => {
    changeTheme({
      ...theme, id: 'custom', sidebar: customColors.sidebar,
      sidebarHover: customColors.sidebar + '22', sidebarActive: customColors.sidebar + '44',
      sidebarText: '#94a3c6', pageBg: customColors.pageBg, accent: customColors.accent,
    });
  };

  const applyTextPreset = (preset) => {
    const { textHeading, textBody, textMuted, textCard } = preset;
    setTextColorState({ textHeading, textBody, textMuted, textCard });
    setTextColors({ textHeading, textBody, textMuted, textCard });
  };

  const overlayVal = parseFloat((theme.bgOverlay || '').match(/[\d.]+(?=\))/)?.[0] || 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Palette className="h-6 w-6" /> Giao diện & Hình nền
        </h1>
        <p className="text-sm text-gray-500 mt-1">Tùy chỉnh giao diện, màu sắc, hình nền cho toàn bộ ứng dụng</p>
        {theme.id !== 'default' && (
          <button onClick={() => { changeTheme('default'); setCustomColors({ sidebar: '#1b2a4a', pageBg: '#f0f2f5', accent: '#2563eb' }); const def = TEXT_PRESETS[0]; setTextColorState(def); setTextColors(def); }}
            className="mt-2 h-9 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer border border-gray-300">
            🔄 Khôi phục mặc định
          </button>
        )}
      </div>

      {/* Theme presets */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Palette className="h-4 w-4" /> Chọn giao diện
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {presets.map(preset => (
            <button key={preset.id} onClick={() => changeTheme(preset.id)}
              className={`p-3 rounded-xl border-2 transition-all cursor-pointer text-center ${
                theme.id === preset.id ? 'border-blue-500 ring-2 ring-blue-200 shadow-lg' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex gap-1 justify-center mb-2">
                <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: preset.sidebar }} />
                <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: preset.accent }} />
                <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: preset.pageBg }} />
              </div>
              <p className="text-xs font-medium text-gray-700">{preset.name}</p>
              {theme.id === preset.id && <Check className="h-4 w-4 text-blue-500 mx-auto mt-1" />}
            </button>
          ))}
        </div>
      </div>

      {/* Background image upload */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Image className="h-4 w-4" /> Hình nền
        </h2>
        <div className="flex flex-wrap gap-4 items-start">
          <div className="w-64 h-40 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden relative flex items-center justify-center bg-gray-50"
            style={theme.bgImage ? { backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
            {!theme.bgImage && (
              <div className="text-center">
                <Image className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Chưa có hình nền</p>
              </div>
            )}
            {theme.bgImage && <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />}
          </div>
          <div className="flex-1 space-y-3">
            <input type="file" ref={fileRef} accept="image/*" onChange={handleUpload} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
              <Upload className="h-4 w-4" /> {uploading ? 'Đang tải...' : 'Tải hình lên'}
            </button>
            {theme.bgImage && (
              <>
                <button onClick={removeBackground}
                  className="h-10 px-5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <Trash2 className="h-4 w-4" /> Xóa hình nền
                </button>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <SlidersHorizontal className="h-3 w-3 inline mr-1" />Độ phủ tối: {Math.round(overlayVal * 100)}%
                  </label>
                  <input type="range" min="0" max="0.8" step="0.02" value={overlayVal}
                    onChange={e => setOverlayOpacity(parseFloat(e.target.value))} className="w-full accent-blue-600" />
                </div>
              </>
            )}
            <p className="text-[11px] text-gray-400">Hỗ trợ JPG, PNG, WebP. Khuyến nghị ≥1920×1080.</p>
          </div>
        </div>
      </div>

      {/* Custom colors */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Tùy chỉnh màu sắc
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[{k:'sidebar',l:'Sidebar'},{k:'pageBg',l:'Nền trang'},{k:'accent',l:'Màu chính'}].map(({k,l}) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={customColors[k]} onChange={e => setCustomColors(p => ({...p, [k]: e.target.value}))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                <input type="text" value={customColors[k]} onChange={e => setCustomColors(p => ({...p, [k]: e.target.value}))} className="flex-1 h-10 px-3 border rounded-lg text-sm font-mono" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={applyCustomColors}
          className="mt-4 h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2">
          <Check className="h-4 w-4" /> Áp dụng
        </button>
      </div>

      {/* Text colors with PRESETS + LIVE PREVIEW */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Type className="h-4 w-4" /> Màu chữ
        </h2>
        <p className="text-xs text-gray-500 mb-4">Điều chỉnh màu chữ để dễ đọc khi dùng hình nền tối/sáng</p>

        {/* Text color presets */}
        <div className="mb-5">
          <h3 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Bộ màu có sẵn</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEXT_PRESETS.map(preset => {
              const isActive = textColorState.textHeading === preset.textHeading && textColorState.textBody === preset.textBody;
              return (
                <button key={preset.id} onClick={() => applyTextPreset(preset)}
                  className={`p-3 rounded-xl border-2 transition-all cursor-pointer text-left ${isActive ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                  style={{ backgroundColor: preset.id === 'dark-bg' || preset.id === 'white' || preset.id === 'cream' || preset.id === 'neon' ? '#1e293b' : theme.pageBg || '#f0f2f5' }}>
                  <p className="text-xs font-bold mb-0.5" style={{ color: preset.textHeading }}>{preset.name}</p>
                  <p className="text-[10px]" style={{ color: preset.textBody }}>Nội dung mẫu</p>
                  <p className="text-[9px]" style={{ color: preset.textMuted }}>Chữ phụ mẫu</p>
                  <div className="flex gap-1 mt-1.5">
                    {[preset.textHeading, preset.textBody, preset.textMuted, preset.textCard].map((c,i) => (
                      <div key={i} className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom text color pickers */}
        <h3 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Tùy chỉnh riêng</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {k:'textHeading', l:'Tiêu đề (H1, H2...)', sample:'Mẫu tiêu đề', cls:'text-sm font-bold'},
            {k:'textBody', l:'Nội dung chính', sample:'Mẫu nội dung', cls:'text-sm'},
            {k:'textMuted', l:'Chữ phụ / mờ', sample:'Mẫu chữ phụ', cls:'text-xs'},
            {k:'textCard', l:'Chữ trong card', sample:'Mẫu card', cls:'text-sm'},
          ].map(({k,l,sample,cls}) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={textColorState[k]} onChange={e => setTextColorState(p => ({...p, [k]: e.target.value}))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                <input type="text" value={textColorState[k]} onChange={e => setTextColorState(p => ({...p, [k]: e.target.value}))} className="flex-1 h-10 px-3 border rounded-lg text-sm font-mono" />
              </div>
              <p className={`mt-1 ${cls}`} style={{ color: textColorState[k] }}>{sample}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setTextColors(textColorState)}
          className="mt-4 h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2">
          <Check className="h-4 w-4" /> Áp dụng màu chữ
        </button>
      </div>

      {/* LIVE PREVIEW — shows actual text on current background */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Eye className="h-4 w-4" /> Xem trước thực tế
        </h2>
        <div className="rounded-xl overflow-hidden border" style={{ minHeight: 280 }}>
          <div className="flex h-full">
            {/* Mini sidebar */}
            <div className="w-14 flex-shrink-0" style={{ backgroundColor: theme.sidebar }}>
              <div className="p-2 space-y-2 mt-4">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="h-2 rounded-full" style={{ backgroundColor: i === 1 ? theme.sidebarActive : theme.sidebarHover, opacity: i === 1 ? 1 : 0.5 }} />
                ))}
              </div>
            </div>
            {/* Content area with background */}
            <div className="flex-1 relative" style={{ backgroundColor: theme.pageBg }}>
              {theme.bgImage && (
                <>
                  <div className="absolute inset-0" style={{ backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />
                </>
              )}
              <div className="relative p-5 space-y-4">
                {/* Simulated page content */}
                <div>
                  <h2 className="text-xl font-bold" style={{ color: textColorState.textHeading }}>Quản lý Dự Án</h2>
                  <p className="text-sm mt-1" style={{ color: textColorState.textMuted }}>Dashboard tổng quan — 34 dự án đang hoạt động</p>
                </div>

                {/* Cards row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { title: 'Đang thực hiện', value: '12', color: '#3b82f6' },
                    { title: 'Hoàn thành', value: '18', color: '#10b981' },
                    { title: 'Quá hạn', value: '4', color: '#ef4444' },
                  ].map((card, i) => (
                    <div key={i} className="bg-white/80 backdrop-blur-sm rounded-lg border p-3">
                      <p className="text-xs font-medium" style={{ color: textColorState.textMuted }}>{card.title}</p>
                      <p className="text-2xl font-bold mt-1" style={{ color: textColorState.textCard }}>{card.value}</p>
                      <div className="h-1 rounded-full mt-2" style={{ backgroundColor: card.color, width: `${30 + i * 25}%` }} />
                    </div>
                  ))}
                </div>

                {/* Table preview */}
                <div className="bg-white/80 backdrop-blur-sm rounded-lg border p-3">
                  <h3 className="text-sm font-bold mb-2" style={{ color: textColorState.textHeading }}>Dự án gần đây</h3>
                  <div className="space-y-2">
                    {['TB-2026-033 — Tủ bếp chữ L gia đình Nguyễn', 'TB-2026-032 — Tủ bếp thẳng căn hộ A2-1205', 'TB-2026-031 — Tủ bếp đảo biệt thự Phú Mỹ'].map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-200/50 last:border-0">
                        <span className="text-xs" style={{ color: textColorState.textBody }}>{item}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                          color: i === 0 ? '#1d4ed8' : i === 1 ? '#b45309' : '#047857',
                          backgroundColor: i === 0 ? '#dbeafe' : i === 1 ? '#fef3c7' : '#d1fae5',
                        }}>{i === 0 ? 'Đang SX' : i === 1 ? 'Thiết kế' : 'Hoàn thành'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">💡 Xem trước hiển thị đúng hình nền, độ phủ, và màu chữ đang chọn. Thay đổi ngay lập tức.</p>
      </div>
    </div>
  );
}
