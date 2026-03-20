import { useState, useRef } from 'react';
import { useTheme } from '../components/ThemeProvider';
import { Upload, Check, Palette, Image, SlidersHorizontal, Trash2 } from 'lucide-react';
import { TourButton } from '../components/WebTour';

export default function ThemeSettingsPage() {
  const { theme, changeTheme, setBackgroundImage, setOverlayOpacity, presets } = useTheme();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [customColors, setCustomColors] = useState({
    sidebar: theme.sidebar,
    pageBg: theme.pageBg,
    accent: theme.accent,
  });

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBackgroundImage(ev.target.result);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const removeBackground = () => {
    changeTheme({ ...theme, bgImage: null, bgOverlay: 'rgba(0,0,0,0)' });
  };

  const applyCustomColors = () => {
    changeTheme({
      ...theme,
      id: 'custom',
      sidebar: customColors.sidebar,
      sidebarHover: customColors.sidebar + '22',
      sidebarActive: customColors.sidebar + '44',
      sidebarText: '#94a3c6',
      pageBg: customColors.pageBg,
      accent: customColors.accent,
    });
  };

  const overlayVal = parseFloat((theme.bgOverlay || '').match(/[\d.]+(?=\))/)?.[0] || 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Palette className="h-6 w-6" /> Giao diện & Hình nền
        </h1>
        <p className="text-sm text-gray-500 mt-1">Tùy chỉnh giao diện, màu sắc, hình nền cho toàn bộ ứng dụng</p>
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
          {/* Preview */}
          <div className="w-64 h-40 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden relative flex items-center justify-center bg-gray-50"
            style={theme.bgImage ? { backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}>
            {!theme.bgImage && (
              <div className="text-center">
                <Image className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Chưa có hình nền</p>
              </div>
            )}
            {theme.bgImage && (
              <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />
            )}
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
                {/* Overlay slider */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    <SlidersHorizontal className="h-3 w-3 inline mr-1" />
                    Độ phủ tối: {Math.round(overlayVal * 100)}%
                  </label>
                  <input type="range" min="0" max="0.8" step="0.02" value={overlayVal}
                    onChange={e => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-full accent-blue-600" />
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sidebar</label>
            <div className="flex items-center gap-2">
              <input type="color" value={customColors.sidebar} onChange={e => setCustomColors(p => ({...p, sidebar: e.target.value}))}
                className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              <input type="text" value={customColors.sidebar} onChange={e => setCustomColors(p => ({...p, sidebar: e.target.value}))}
                className="flex-1 h-10 px-3 border rounded-lg text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nền trang</label>
            <div className="flex items-center gap-2">
              <input type="color" value={customColors.pageBg} onChange={e => setCustomColors(p => ({...p, pageBg: e.target.value}))}
                className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              <input type="text" value={customColors.pageBg} onChange={e => setCustomColors(p => ({...p, pageBg: e.target.value}))}
                className="flex-1 h-10 px-3 border rounded-lg text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Màu chính</label>
            <div className="flex items-center gap-2">
              <input type="color" value={customColors.accent} onChange={e => setCustomColors(p => ({...p, accent: e.target.value}))}
                className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              <input type="text" value={customColors.accent} onChange={e => setCustomColors(p => ({...p, accent: e.target.value}))}
                className="flex-1 h-10 px-3 border rounded-lg text-sm font-mono" />
            </div>
          </div>
        </div>
        <button onClick={applyCustomColors}
          className="mt-4 h-10 px-5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-2">
          <Check className="h-4 w-4" /> Áp dụng
        </button>
      </div>

      {/* Current preview */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">Xem trước</h2>
        <div className="flex rounded-xl overflow-hidden border h-48">
          {/* Mini sidebar preview */}
          <div className="w-16" style={{ backgroundColor: theme.sidebar }}>
            <div className="p-2 space-y-2 mt-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-2 rounded-full" style={{ backgroundColor: i === 1 ? theme.sidebarActive : theme.sidebarHover, opacity: i === 1 ? 1 : 0.5 }} />
              ))}
            </div>
          </div>
          {/* Mini content preview */}
          <div className="flex-1 relative" style={{ backgroundColor: theme.pageBg }}>
            {theme.bgImage && (
              <>
                <div className="absolute inset-0" style={{ backgroundImage: `url(${theme.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className="absolute inset-0" style={{ backgroundColor: theme.bgOverlay }} />
              </>
            )}
            <div className="relative p-3 space-y-2">
              <div className="h-3 w-24 rounded-full" style={{ backgroundColor: theme.accent }} />
              <div className="flex gap-2">
                <div className="h-16 w-24 rounded-lg bg-white/80 border" />
                <div className="h-16 w-24 rounded-lg bg-white/80 border" />
                <div className="h-16 w-24 rounded-lg bg-white/80 border" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
