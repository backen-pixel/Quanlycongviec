import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Layers, Plus, Edit, Save, X, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

const DEFAULT_ICONS = ['🏛️','🏢','🏭','👥','👷','📋','🏗️','🔧','⭐','🏠','🌐','💼','🛡️','📦','🚀','🎯'];
const DEFAULT_COLORS = ['#DC2626','#EA580C','#D97706','#65A30D','#059669','#0891B2','#2563EB','#7C3AED','#DB2777','#6B7280'];

export default function EcosystemLevelsPage() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/ecosystem/levels');
      setLevels(data.levels || []);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-orange-600" /> Cấp Bậc Hệ Sinh Thái
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quản lý các cấp bậc trong cây hệ sinh thái (Tập đoàn → Khối → Công ty con → Phòng ban → Đội nhóm)
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-orange-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-orange-700 cursor-pointer">
          <Plus className="h-4 w-4" /> Thêm cấp bậc
        </button>
      </div>

      {/* Visual hierarchy */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
        <p className="text-[10px] text-orange-600 font-semibold uppercase mb-2">Sơ đồ cấp bậc (từ cao → thấp)</p>
        <div className="flex items-center gap-1 flex-wrap">
          {levels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: l.color + '20', color: l.color, border: `1px solid ${l.color}40` }}>
                <span className="text-base">{l.icon || '📋'}</span>
                {l.name}
                <span className="text-[9px] opacity-60 ml-1">Cấp {l.depth}</span>
              </span>
              {i < levels.length - 1 && <span className="text-gray-300 text-lg">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <LevelForm
          nextDepth={levels.length > 0 ? Math.max(...levels.map(l => l.depth)) + 1 : 0}
          onSaved={() => { load(); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Levels list */}
      <div className="space-y-2">
        {levels.map((level) => (
          editId === level.id ? (
            <LevelForm key={level.id} level={level}
              onSaved={() => { load(); setEditId(null); }}
              onCancel={() => setEditId(null)} />
          ) : (
            <LevelCard key={level.id} level={level}
              onEdit={() => setEditId(level.id)}
              onDeleted={load} />
          )
        ))}
      </div>

      {levels.length === 0 && !showCreate && (
        <div className="text-center py-16 text-gray-400">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Chưa có cấp bậc nào</p>
          <p className="text-[10px] mt-1">Thêm cấp bậc để xây dựng cây hệ sinh thái</p>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-xs text-blue-800 space-y-1.5">
        <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Hướng dẫn</p>
        <ul className="list-disc ml-4 space-y-0.5 text-[11px]">
          <li><strong>Depth (Cấp)</strong>: số nhỏ = cấp cao hơn. Cấp 0 là gốc (Tập đoàn), Cấp 1 là Khối, v.v.</li>
          <li>Khi tạo đơn vị con, chỉ được chọn cấp bậc <strong>thấp hơn</strong> cấp bậc của đơn vị cha</li>
          <li>Không thể xóa cấp bậc đang có đơn vị sử dụng</li>
          <li>Mỗi cấp bậc nên có icon + màu riêng để dễ phân biệt trong cây</li>
        </ul>
      </div>
    </div>
  );
}

function LevelCard({ level, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Xóa cấp bậc "${level.name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/ecosystem/levels/${level.id}`);
      onDeleted();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi khi xóa');
    }
    setDeleting(false);
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:shadow-sm transition-all">
      {/* Depth badge */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ backgroundColor: level.color + '15', border: `2px solid ${level.color}30` }}>
        {level.icon || '📋'}
      </div>

      {/* Color bar */}
      <div className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: level.color }} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-900">{level.name}</h3>
          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{level.slug}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: level.color + '20', color: level.color }}>
            Cấp {level.depth}
          </span>
        </div>
        {level.description && <p className="text-[10px] text-gray-400 mt-0.5">{level.description}</p>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit}
          className="h-8 px-3 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1">
          <Edit className="h-3 w-3" /> Sửa
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="h-8 px-3 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer flex items-center gap-1 disabled:opacity-50">
          <Trash2 className="h-3 w-3" /> {deleting ? '...' : 'Xóa'}
        </button>
      </div>
    </div>
  );
}

function LevelForm({ level, nextDepth, onSaved, onCancel }) {
  const [name, setName] = useState(level?.name || '');
  const [slug, setSlug] = useState(level?.slug || '');
  const [depth, setDepth] = useState(level?.depth ?? nextDepth ?? 0);
  const [desc, setDesc] = useState(level?.description || '');
  const [icon, setIcon] = useState(level?.icon || '📋');
  const [color, setColor] = useState(level?.color || '#2563EB');
  const [saving, setSaving] = useState(false);

  const autoSlug = (n) => n.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên cấp bậc');
    const s = slug.trim() || autoSlug(name);
    setSaving(true);
    try {
      if (level?.id) {
        await api.put(`/ecosystem/levels/${level.id}`, { name: name.trim(), slug: s, depth, description: desc || null, icon, color });
      } else {
        await api.post('/ecosystem/levels', { name: name.trim(), slug: s, depth, description: desc || null, icon, color });
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 space-y-3">
      <h3 className="text-sm font-bold text-orange-900">{level ? `Sửa: ${level.name}` : 'Thêm cấp bậc mới'}</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Tên cấp bậc *</label>
          <input value={name} onChange={e => { setName(e.target.value); if (!level) setSlug(autoSlug(e.target.value)); }}
            className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Tập đoàn" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Slug</label>
          <input value={slug} onChange={e => setSlug(e.target.value)}
            className="w-full h-9 px-3 border rounded-lg text-sm font-mono" placeholder="tap-doan" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-gray-600 block mb-1">Cấp (Depth) *</label>
          <input type="number" min="0" max="10" value={depth} onChange={e => setDepth(parseInt(e.target.value) || 0)}
            className="w-full h-9 px-3 border rounded-lg text-sm" />
        </div>
      </div>

      {/* Icon picker */}
      <div>
        <label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_ICONS.map(i => (
            <button key={i} onClick={() => setIcon(i)}
              className={`w-8 h-8 rounded-lg text-base cursor-pointer flex items-center justify-center transition-all ${icon === i ? 'bg-orange-200 ring-2 ring-orange-400 scale-110' : 'bg-white border hover:bg-gray-50'}`}>
              {i}
            </button>
          ))}
          <input value={icon} onChange={e => setIcon(e.target.value)}
            className="w-12 h-8 px-1 border rounded-lg text-center text-base" maxLength={2} />
        </div>
      </div>

      {/* Color picker */}
      <div>
        <label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {DEFAULT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full cursor-pointer transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-8 h-7 border rounded cursor-pointer" />
          <span className="text-[10px] font-mono text-gray-400">{color}</span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label>
        <input value={desc} onChange={e => setDesc(e.target.value)}
          className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Cấp cao nhất - quản lý toàn bộ hệ thống" />
      </div>

      {/* Preview */}
      <div className="bg-white rounded-lg border p-3">
        <p className="text-[10px] text-gray-400 mb-1.5">Xem trước:</p>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: color + '15', border: `2px solid ${color}30` }}>
            {icon}
          </div>
          <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <span className="text-sm font-bold text-gray-900">{name || 'Tên cấp bậc'}</span>
            <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: color + '20', color }}>Cấp {depth}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer flex items-center gap-1">
          <X className="h-3.5 w-3.5" /> Hủy
        </button>
        <button onClick={save} disabled={saving}
          className="h-8 px-4 bg-orange-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5 hover:bg-orange-700">
          {saving ? 'Đang lưu...' : <><Save className="h-3.5 w-3.5" /> {level ? 'Cập nhật' : 'Tạo cấp bậc'}</>}
        </button>
      </div>
    </div>
  );
}
