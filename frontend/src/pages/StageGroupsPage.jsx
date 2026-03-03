import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { FolderKanban, Plus, Edit, Save, X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

export default function StageGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [stages, setStages] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s, u] = await Promise.all([api.get('/ecosystem/stage-groups'), api.get('/stages'), api.get('/ecosystem/units').catch(() => ({ data: { units: [] } }))]);
      setGroups(g.data.groups || []); setStages(s.data.stages || []);
      setDivisions((u.data.units || []).filter(un => un.level?.depth === 1));
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><FolderKanban className="h-6 w-6 text-indigo-600" /> Nhóm Quy Trình</h1>
          <p className="text-xs text-gray-500 mt-0.5">Gộp các quy trình lại thành nhóm để gán cho đơn vị trong hệ sinh thái</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-700 cursor-pointer"><Plus className="h-4 w-4" /> Tạo nhóm</button>
      </div>

      {showCreate && <GroupForm stages={stages} divisions={divisions} onSaved={() => { load(); setShowCreate(false); }} onCancel={() => setShowCreate(false)} />}

      <div className="space-y-3">
        {groups.map(g => (
          <GroupCard key={g.id} group={g} stages={stages} divisions={divisions} isEditing={editId === g.id}
            onEdit={() => setEditId(g.id)} onSaved={() => { load(); setEditId(null); }} onCancel={() => setEditId(null)} />
        ))}
      </div>

      {groups.length === 0 && !showCreate && (
        <div className="text-center py-16 text-gray-400"><FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Chưa có nhóm quy trình</p></div>
      )}
    </div>
  );
}

function GroupCard({ group, stages, divisions, isEditing, onEdit, onSaved, onCancel }) {
  const [expanded, setExpanded] = useState(false);
  const div = divisions.find(d => d.id === group.division_unit_id);

  if (isEditing) return <GroupForm group={group} stages={stages} divisions={divisions} onSaved={onSaved} onCancel={onCancel} />;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-2 h-10 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <span className="text-lg shrink-0">{group.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">{group.name}</h3>
          <p className="text-[10px] text-gray-400">{group.slug} · {group.stages?.length || 0} quy trình{div ? ` · ${div.level?.icon} ${div.name}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(group.stages || []).map(s => (
            <span key={s.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: s.color + '20', color: s.color }}>{s.icon?.charCodeAt?.(0) > 127 ? s.icon : '📋'} {s.name}</span>
          ))}
        </div>
        <button onClick={e => { e.stopPropagation(); onEdit(); }} className="h-7 px-2 text-[10px] text-blue-600 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer shrink-0"><Edit className="h-3 w-3" /></button>
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </div>
      {expanded && group.description && <div className="px-4 pb-3 text-xs text-gray-500">{group.description}</div>}
    </div>
  );
}

function GroupForm({ group, stages, divisions = [], onSaved, onCancel }) {
  const [name, setName] = useState(group?.name || '');
  const [slug, setSlug] = useState(group?.slug || '');
  const [desc, setDesc] = useState(group?.description || '');
  const [color, setColor] = useState(group?.color || '#6366F1');
  const [icon, setIcon] = useState(group?.icon || '📋');
  const [divisionId, setDivisionId] = useState(group?.division_unit_id || '');
  const [selectedStages, setSelectedStages] = useState((group?.stages || []).map(s => s.id));
  const [saving, setSaving] = useState(false);

  const ICONS = ['💼','🏭','🚛','🔧','❤️','📋','📦','🔍','🛡️','⭐','📊','🏗️'];

  const toggleStage = (sid) => {
    setSelectedStages(prev => prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]);
  };

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên nhóm');
    const s = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setSaving(true);
    try {
      if (group?.id) {
        await api.put(`/ecosystem/stage-groups/${group.id}`, { name, slug: s, description: desc, color, icon, division_unit_id: divisionId || null });
        await api.post(`/ecosystem/stage-groups/${group.id}/stages`, { stage_ids: selectedStages });
      } else {
        const { data } = await api.post('/ecosystem/stage-groups', { name, slug: s, description: desc, color, icon, division_unit_id: divisionId || null });
        if (selectedStages.length && data.group?.id) {
          await api.post(`/ecosystem/stage-groups/${data.group.id}/stages`, { stage_ids: selectedStages });
        }
      }
      onSaved();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 space-y-3">
      <h3 className="text-sm font-bold text-indigo-900">{group ? 'Sửa nhóm' : 'Tạo nhóm quy trình mới'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên nhóm *</label><input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
        <div className="col-span-2 sm:col-span-1"><label className="text-[11px] font-medium text-gray-600 block mb-1">Slug</label><input value={slug} onChange={e => setSlug(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm font-mono" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Màu</label><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-9 border rounded-lg cursor-pointer" /></div>
        <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Icon</label><div className="flex flex-wrap gap-1">{ICONS.map(i => <button key={i} onClick={() => setIcon(i)} className={`w-7 h-7 rounded text-sm cursor-pointer ${icon === i ? 'bg-indigo-200 ring-2 ring-indigo-400' : 'bg-white border hover:bg-gray-50'}`}>{i}</button>)}</div></div>
        <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label><input value={desc} onChange={e => setDesc(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
        <div className="col-span-2">
          <label className="text-[11px] font-medium text-gray-600 block mb-1">🔗 Thuộc Khối <span className="text-gray-400 font-normal">(Cty trong Khối này sẽ dùng nhóm QT này)</span></label>
          <select value={divisionId} onChange={e => setDivisionId(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
            <option value="">— Chung (tất cả Khối) —</option>
            {divisions.map(d => <option key={d.id} value={d.id}>{d.level?.icon} {d.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-2">Chọn quy trình trong nhóm</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {stages.filter(s => s.is_active !== false).map(s => (
            <label key={s.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${selectedStages.includes(s.id) ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={selectedStages.includes(s.id)} onChange={() => toggleStage(s.id)} className="accent-indigo-600" />
              <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-gray-800">{s.icon?.charCodeAt?.(0) > 127 ? s.icon : ''} {s.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
        <button onClick={save} disabled={saving} className="h-8 px-4 bg-indigo-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
          {saving ? 'Đang lưu...' : <><Save className="h-3.5 w-3.5" /> Lưu</>}
        </button>
      </div>
    </div>
  );
}
