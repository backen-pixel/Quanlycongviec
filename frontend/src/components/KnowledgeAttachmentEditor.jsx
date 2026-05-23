import { Plus, Trash2, Image as ImageIcon, Video, Link as LinkIcon, FileText } from 'lucide-react';
import { detectMediaType } from './KnowledgeMediaGallery';

const TYPE_OPTIONS = [
  { value: 'auto', label: 'Tự nhận diện' },
  { value: 'image', label: '🖼️ Ảnh' },
  { value: 'youtube', label: '▶️ YouTube' },
  { value: 'vimeo', label: '🎬 Vimeo' },
  { value: 'video', label: '📹 Video MP4' },
  { value: 'file', label: '📄 Tệp' },
  { value: 'link', label: '🔗 Liên kết' },
];

const ICONS = {
  image: ImageIcon,
  youtube: Video,
  vimeo: Video,
  video: Video,
  file: FileText,
  link: LinkIcon,
};

export default function KnowledgeAttachmentEditor({ value, onChange, label = 'Đính kèm media' }) {
  const items = Array.isArray(value) ? value : [];

  const addItem = () => {
    onChange([...items, { type: 'auto', url: '', caption: '' }]);
  };

  const updateItem = (idx, patch) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const moveItem = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{label}</label>
        <button
          type="button"
          onClick={addItem}
          className="text-xs px-2 py-1 bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Thêm
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-gray-400 italic py-3 px-3 bg-gray-50 rounded-lg">
          Chưa có media nào. Bấm "Thêm" để chèn ảnh, video YouTube, hoặc tệp.
        </p>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => {
          const effectiveType = it.type === 'auto' || !it.type ? detectMediaType(it.url) : it.type;
          const Icon = ICONS[effectiveType] || LinkIcon;
          return (
            <div key={idx} className="flex items-start gap-2 p-2 bg-white border border-gray-200 rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex gap-1.5">
                  <select
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                    value={it.type || 'auto'}
                    onChange={(e) => updateItem(idx, { type: e.target.value })}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-gray-400 px-1 py-1">→ {effectiveType}</span>
                </div>
                <input
                  type="url"
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                  placeholder="https://..."
                  value={it.url || ''}
                  onChange={(e) => updateItem(idx, { url: e.target.value })}
                />
                <input
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                  placeholder={effectiveType === 'file' ? 'Tên tệp (vd: Checklist.pdf)' : 'Chú thích (tùy chọn)'}
                  value={it.caption || it.name || ''}
                  onChange={(e) => updateItem(idx, effectiveType === 'file' ? { name: e.target.value } : { caption: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" disabled={idx === 0} onClick={() => moveItem(idx, -1)} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">↑</button>
                <button type="button" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
