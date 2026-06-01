/**
 * GroupCallMemberPickerModal — chọn những thành viên sẽ được mời vào cuộc gọi nhóm.
 *
 * Props:
 *   - open: boolean
 *   - kind: 'audio' | 'video'   → để hiển thị tiêu đề + icon đúng
 *   - groupName: string
 *   - members: Array<{ id, name, avatar }>  // chỉ bao gồm thành viên khác (đã loại trừ chính mình)
 *   - onCancel: () => void
 *   - onConfirm: (selectedMembers) => void
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Phone, Video, Search, Check, Users } from 'lucide-react';
import { publicFileUrl } from '../lib/publicFileUrl';

function MemberAvatar({ name, avatar, size = 36 }) {
  const src = avatar ? publicFileUrl(avatar) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const letter = (name || 'U')[0].toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letter}
    </div>
  );
}

export default function GroupCallMemberPickerModal({
  open, kind = 'audio', groupName = 'Nhóm chat', members = [],
  onCancel, onConfirm,
}) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set(members.map((m) => m.id)));

  // Khi mở lại modal → reset selection = toàn bộ thành viên
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(members.map((m) => m.id)));
      setQuery('');
    }
  }, [open, members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.name || '').toLowerCase().includes(q));
  }, [members, query]);

  const allSelected = members.length > 0 && selectedIds.size === members.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(members.map((m) => m.id)));
  };

  const toggleOne = (id) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const picked = members.filter((m) => selectedIds.has(m.id));
    if (picked.length === 0) return;
    onConfirm?.(picked);
  };

  if (!open) return null;

  const isVideo = kind === 'video';
  // Dùng class literal để Tailwind purge giữ lại
  const headerGradient = isVideo
    ? 'bg-gradient-to-br from-sky-500 to-indigo-600'
    : 'bg-gradient-to-br from-emerald-500 to-teal-600';
  const checkBoxActive = isVideo ? 'bg-sky-500 border-sky-500 text-white' : 'bg-emerald-500 border-emerald-500 text-white';
  const checkBoxPartial = isVideo ? 'bg-sky-100 border-sky-400' : 'bg-emerald-100 border-emerald-400';
  const rowSelected = isVideo ? 'bg-sky-50' : 'bg-emerald-50';
  const confirmBtn = isVideo
    ? 'bg-sky-600 hover:bg-sky-700 shadow-md'
    : 'bg-emerald-600 hover:bg-emerald-700 shadow-md';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`${headerGradient} px-5 py-4 text-white flex items-center gap-3`}>
          <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
            {isVideo ? <Video size={22} /> : <Phone size={22} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80">{isVideo ? 'Cuộc gọi video nhóm' : 'Cuộc gọi nhóm'}</p>
            <h3 className="text-base font-bold truncate">{groupName}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
            title="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search + select all */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm thành viên…"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-violet-700"
            >
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                allSelected ? checkBoxActive : someSelected ? checkBoxPartial : 'border-slate-300 bg-white'
              }`}>
                {allSelected && <Check size={14} />}
                {someSelected && <span className="w-2 h-2 bg-current rounded-sm" />}
              </span>
              Chọn tất cả ({members.length})
            </button>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users size={12} /> {selectedIds.size} đã chọn
            </span>
          </div>
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Không tìm thấy thành viên</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((m) => {
                const checked = selectedIds.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggleOne(m.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition text-left ${
                        checked ? rowSelected : 'hover:bg-slate-50'
                      }`}
                    >
                      <MemberAvatar name={m.name} avatar={m.avatar} />
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{m.name}</span>
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition shrink-0 ${
                        checked ? checkBoxActive : 'border-slate-300 bg-white'
                      }`}>
                        {checked && <Check size={14} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={selectedIds.size === 0}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition flex items-center justify-center gap-2 ${
              selectedIds.size === 0 ? 'bg-slate-300 cursor-not-allowed' : confirmBtn
            }`}
          >
            {isVideo ? <Video size={16} /> : <Phone size={16} />}
            {selectedIds.size > 0 ? `Gọi (${selectedIds.size})` : 'Chọn thành viên'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
