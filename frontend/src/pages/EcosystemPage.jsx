import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Modal from '../components/Modal';
import {
  Plus, ChevronRight, ChevronDown, Users, Trash2, Layers,
  Edit, Shield, FolderKanban, Network, Save, X, UserPlus, Crown, User,
  ArrowDownRight, Copy, FileText, ChevronUp
} from 'lucide-react';

const RL = { director: 'Giám đốc', manager: 'Quản lý', team_lead: 'Trưởng nhóm', member: 'Nhân viên' };
const RC = { director: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', team_lead: 'bg-amber-100 text-amber-700', member: 'bg-gray-100 text-gray-600' };
const RI = { director: Crown, manager: Shield, team_lead: Users, member: User };

export default function EcosystemPage() {
  const { user } = useAuth();
  const [tree, setTree] = useState([]);
  const [units, setUnits] = useState([]);
  const [levels, setLevels] = useState([]);
  const [stageGroups, setStageGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [showCreate, setShowCreate] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const isAdmin = ['admin', 'manager'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, l, g, us] = await Promise.all([
        api.get('/ecosystem/units'), api.get('/ecosystem/levels'),
        api.get('/ecosystem/stage-groups'), api.get('/users').catch(() => ({ data: { users: [] } })),
      ]);
      setTree(u.data.tree || []); setUnits(u.data.units || []);
      setLevels(l.data.levels || []); setStageGroups(g.data.groups || []);
      setAllUsers(us.data.users || []);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><Network className="h-6 w-6 text-blue-600" /> Cấu Trúc Tổ Chức</h1>
          <p className="text-xs text-gray-500 mt-0.5">{units.length} đơn vị · {levels.length} cấp bậc</p>
        </div>
        {isAdmin && <button onClick={() => setShowCreate('root')} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm gốc</button>}
      </div>

      {tree.length > 0 ? (
        <div className="overflow-x-auto pb-6">
          <div className="min-w-fit flex flex-col items-center">
            {tree.map(root => <OrgChart key={root.id} node={root} onSelect={setSelectedUnit} onAddChild={setShowCreate} isAdmin={isAdmin} />)}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border"><Network className="h-14 w-14 mx-auto mb-4 text-gray-200" /><p className="text-sm text-gray-500">Chưa có cấu trúc tổ chức</p></div>
      )}

      {showCreate && <CreateUnitModal parentId={showCreate === 'root' ? null : showCreate} levels={levels} units={units} onCreated={() => { load(); setShowCreate(null); }} onClose={() => setShowCreate(null)} />}
      {selectedUnit && <UnitDetailModal unitId={selectedUnit} levels={levels} stageGroups={stageGroups} allUsers={allUsers} units={units} isAdmin={isAdmin} onUpdated={load} onClose={() => setSelectedUnit(null)} />}
    </div>
  );
}

/* ═══ ORG CHART ═══ */
function OrgChart({ node, onSelect, onAddChild, isAdmin }) {
  const [collapsed, setCollapsed] = useState(false);
  const has = node.children?.length > 0;
  const c = node.level?.color || '#6b7280';
  return (
    <div className="flex flex-col items-center">
      <div onClick={() => onSelect(node.id)} className="relative bg-white rounded-xl border-2 shadow-sm hover:shadow-lg transition-all cursor-pointer group min-w-[170px] max-w-[220px]" style={{ borderColor: c + '60' }}>
        <div className="h-1.5 rounded-t-[10px]" style={{ backgroundColor: c }} />
        <div className="p-3 text-center">
          <div className="text-2xl mb-1">{node.level?.icon || '📋'}</div>
          <h3 className="text-xs font-bold text-gray-900 truncate">{node.name}</h3>
          <div className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full mt-1 font-medium" style={{ backgroundColor: c + '15', color: c }}>{node.level?.name}</div>
          {node.code && <div className="text-[9px] text-gray-400 font-mono mt-0.5">{node.code}</div>}
          {node.company && <div className="text-[8px] text-green-600 mt-0.5">🔗 {node.company.name}</div>}
          {node.member_count > 0 && <div className="flex items-center justify-center gap-1 mt-1 text-[10px] text-gray-500"><Users className="h-3 w-3" /> {node.member_count}</div>}
          {node.stage_groups?.length > 0 && <div className="flex flex-wrap justify-center gap-0.5 mt-1">{node.stage_groups.map(g => <span key={g.id} className="text-[8px] px-1 py-0.5 rounded-full" style={{ backgroundColor: g.color + '15', color: g.color }}>{g.icon}</span>)}</div>}
        </div>
        {isAdmin && <button onClick={e => { e.stopPropagation(); onAddChild(node.id); }} className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-blue-700 shadow-md z-10"><Plus className="h-3 w-3" /></button>}
        {has && <button onClick={e => { e.stopPropagation(); setCollapsed(!collapsed); }} className="absolute -bottom-3 right-2 w-5 h-5 bg-gray-100 border rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 z-10">{collapsed ? <ChevronDown className="h-2.5 w-2.5 text-gray-500" /> : <ChevronUp className="h-2.5 w-2.5 text-gray-500" />}</button>}
      </div>
      {has && !collapsed && <>
        <div className="w-px h-5 bg-gray-300" />
        {node.children.length > 1 && <div className="h-px bg-gray-300" style={{ width: Math.max(40, (node.children.length - 1) * 200) }} />}
        <div className="flex gap-3">{node.children.map(ch => <div key={ch.id} className="flex flex-col items-center"><div className="w-px h-5 bg-gray-300" /><OrgChart node={ch} onSelect={onSelect} onAddChild={onAddChild} isAdmin={isAdmin} /></div>)}</div>
      </>}
      {has && collapsed && <div className="mt-2 text-[9px] text-gray-400">{node.children.length} con ▼</div>}
    </div>
  );
}

/* ═══ CREATE UNIT ═══ */
function CreateUnitModal({ parentId, levels, units, onCreated, onClose }) {
  const [name, setName] = useState(''); const [sn, setSn] = useState(''); const [code, setCode] = useState('');
  const [levelId, setLevelId] = useState(''); const [desc, setDesc] = useState(''); const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState(''); const [deptId, setDeptId] = useState('');
  const [companies, setCompanies] = useState([]); const [departments, setDepartments] = useState([]);

  const parent = parentId ? units.find(u => u.id === parentId) : null;
  const avail = levels.filter(l => l.depth > (parent?.level?.depth ?? -1));
  const selectedLevel = levels.find(l => l.id === levelId);
  const isCompanyLevel = selectedLevel?.slug === 'subsidiary' || selectedLevel?.depth === 2;
  const isDeptLevel = selectedLevel?.slug === 'department' || selectedLevel?.depth === 3;

  useEffect(() => { if (avail.length && !levelId) setLevelId(avail[0].id); }, [avail.length]);

  // Load companies khi chọn cấp Công ty
  useEffect(() => {
    if (isCompanyLevel) {
      api.get('/ecosystem/available-companies').then(r => setCompanies(r.data.companies || [])).catch(() => {});
    }
  }, [isCompanyLevel]);

  // Load departments khi chọn cấp Phòng ban
  useEffect(() => {
    if (isDeptLevel) {
      const parentCompanyId = parent?.company_id;
      const url = parentCompanyId ? `/ecosystem/available-departments?company_id=${parentCompanyId}` : '/ecosystem/available-departments';
      api.get(url).then(r => setDepartments(r.data.departments || [])).catch(() => {});
    }
  }, [isDeptLevel, parent?.company_id]);

  // Auto-fill name khi chọn company/department
  const onSelectCompany = (cid) => {
    setCompanyId(cid);
    const c = companies.find(x => x.id === cid);
    if (c && !name) { setName(c.name); setSn(c.short_name || ''); setCode(c.code || ''); }
  };
  const onSelectDept = (did) => {
    setDeptId(did);
    const d = departments.find(x => x.id === did);
    if (d && !name) { setName(d.name); setSn(d.short_name || ''); }
  };

  const save = async () => {
    if (!name.trim() || !levelId) return alert('Nhập tên và chọn cấp bậc');
    setSaving(true);
    try {
      await api.post('/ecosystem/units', {
        name: name.trim(), short_name: sn || null, code: code || null,
        level_id: levelId, parent_id: parentId || null, description: desc || null,
        company_id: companyId || null, department_id: deptId || null,
      });
      onCreated();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={parent ? `Thêm con: ${parent.name}` : 'Thêm đơn vị gốc'} size="md">
      <div className="space-y-4">
        {parent && <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3"><span className="text-lg">{parent.level?.icon}</span><div className="w-1 h-8 rounded-full" style={{ backgroundColor: parent.level?.color }} /><div><p className="text-sm font-bold">{parent.name}</p><p className="text-[10px]" style={{ color: parent.level?.color }}>{parent.level?.name}</p></div><span className="text-gray-300 mx-2">→</span><span className="text-xs text-gray-500">Con</span></div>}
        <div className="grid grid-cols-2 gap-3">
          {/* Cấp bậc */}
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Cấp bậc *</label>
            {avail.length > 0 ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{avail.map(l => <button key={l.id} onClick={() => { setLevelId(l.id); setCompanyId(''); setDeptId(''); }} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-left ${levelId === l.id ? 'shadow-md' : 'border-gray-200'}`} style={levelId === l.id ? { borderColor: l.color, backgroundColor: l.color + '08' } : {}}><span className="text-lg">{l.icon}</span><div><p className="text-xs font-bold" style={levelId === l.id ? { color: l.color } : {}}>{l.name}</p><p className="text-[9px] text-gray-400">Cấp {l.depth}</p></div></button>)}</div> : <div className="bg-red-50 rounded-lg p-3 text-xs text-red-600">Không có cấp phù hợp</div>}
          </div>

          {/* Liên kết Công ty */}
          {isCompanyLevel && companies.length > 0 && (
            <div className="col-span-2">
              <label className="text-[11px] font-medium text-gray-600 block mb-1">🔗 Liên kết Công ty <span className="text-gray-400 font-normal">(chọn từ danh sách)</span></label>
              <select value={companyId} onChange={e => onSelectCompany(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
                <option value="">— Không liên kết / Tạo mới —</option>
                {companies.map(c => <option key={c.id} value={c.id} disabled={c.is_linked}>{c.name}{c.short_name ? ` (${c.short_name})` : ''}{c.is_linked ? ' ✓ đã liên kết' : ''}</option>)}
              </select>
              {companyId && <p className="text-[10px] text-green-600 mt-1">✓ Sẽ liên kết với công ty đã tạo — PB & NV sẽ được đồng bộ</p>}
            </div>
          )}

          {/* Liên kết Phòng ban */}
          {isDeptLevel && departments.length > 0 && (
            <div className="col-span-2">
              <label className="text-[11px] font-medium text-gray-600 block mb-1">🔗 Liên kết Phòng ban <span className="text-gray-400 font-normal">(chọn từ danh sách)</span></label>
              <select value={deptId} onChange={e => onSelectDept(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">
                <option value="">— Không liên kết / Tạo mới —</option>
                {departments.map(d => <option key={d.id} value={d.id} disabled={d.is_linked}>{d.name}{d.short_name ? ` (${d.short_name})` : ''}{d.is_linked ? ' ✓ đã liên kết' : ''}</option>)}
              </select>
            </div>
          )}

          {/* Tên, viết tắt, mã */}
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên *</label><input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Viết tắt</label><input value={sn} onChange={e => setSn(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Mã</label><input value={code} onChange={e => setCode(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm font-mono" /></div>
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label><textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full min-h-[50px] px-3 py-2 border rounded-lg text-sm resize-none" /></div>
        </div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-8 px-3 border rounded-lg text-xs cursor-pointer">Hủy</button><button onClick={save} disabled={saving || !levelId} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : 'Tạo'}</button></div>
      </div>
    </Modal>
  );
}

/* ═══ UNIT DETAIL ═══ */
function UnitDetailModal({ unitId, levels, stageGroups, allUsers, units, isAdmin, onUpdated, onClose }) {
  const [d, setD] = useState(null); const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info'); const [editMode, setEditMode] = useState(false);
  const [changingLevel, setChangingLevel] = useState(false); const [ed, setEd] = useState({}); const [saving, setSaving] = useState(false);
  const [tplSets, setTplSets] = useState([]);

  const ld = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/ecosystem/units/${unitId}`);
      setD(data); setEd({ name: data.unit.name, short_name: data.unit.short_name, code: data.unit.code, description: data.unit.description });
      if (data.unit.level?.depth >= 2) { const r = await api.get(`/company-templates/units/${unitId}/template-sets`).catch(() => ({ data: { sets: [] } })); setTplSets(r.data.sets || []); }
    } catch {} setLoading(false);
  }, [unitId]);
  useEffect(() => { ld(); }, [ld]);

  const saveEdit = async () => { setSaving(true); try { await api.put(`/ecosystem/units/${unitId}`, ed); setEditMode(false); ld(); onUpdated(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); } setSaving(false); };
  const changeLevel = async id => { try { await api.put(`/ecosystem/units/${unitId}`, { level_id: id }); setChangingLevel(false); ld(); onUpdated(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); } };
  const addMember = async (uid, role) => { try { await api.post(`/ecosystem/units/${unitId}/members`, { user_id: uid, unit_role: role, can_manage_children: ['director', 'manager'].includes(role) }); ld(); onUpdated(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); } };
  const removeMember = async mid => { if (!confirm('Xóa?')) return; try { await api.delete(`/ecosystem/units/${unitId}/members/${mid}`); ld(); onUpdated(); } catch {} };
  const updateRole = async (mid, role) => { try { await api.put(`/ecosystem/units/${unitId}/members/${mid}`, { unit_role: role, can_manage_children: ['director', 'manager'].includes(role) }); ld(); } catch {} };
  const assignGroups = async gids => { try { await api.post(`/ecosystem/units/${unitId}/stage-groups`, { group_ids: gids }); ld(); onUpdated(); } catch {} };
  const del = async () => { if (!confirm('Xóa?')) return; try { await api.delete(`/ecosystem/units/${unitId}`); onClose(); onUpdated(); } catch {} };

  if (loading || !d) return <Modal open onClose={onClose} title="..." size="lg"><div className="flex items-center justify-center py-10"><div className="animate-spin h-5 w-5 border-2 border-blue-200 border-t-blue-600 rounded-full" /></div></Modal>;

  const { unit, members, stage_groups, children, projects } = d;
  const c = unit.level?.color || '#6b7280';
  const childMin = children.length > 0 ? Math.min(...children.map(ch => ch.level?.depth ?? 99)) : 99;
  const isCo = unit.level?.depth >= 2;
  const tabs = [{ id: 'info', l: 'Đơn vị con', n: children.length }, { id: 'members', l: 'Quản lý & NV', n: members.length }, { id: 'workflows', l: 'Quy trình', n: stage_groups.length }];
  if (isCo) tabs.push({ id: 'templates', l: 'NV mẫu', n: tplSets.length });
  tabs.push({ id: 'projects', l: 'Dự án', n: projects.length });

  return (
    <Modal open onClose={onClose} title={`${unit.level?.icon || '📋'} ${unit.name}`} size="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${c}30` }}>
          <div className="p-3" style={{ backgroundColor: c + '08' }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: c + '15' }}>{unit.level?.icon || '📋'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-base font-bold text-gray-900">{unit.name}</span>{unit.short_name && <span className="text-[10px] bg-white border px-1.5 py-0.5 rounded">{unit.short_name}</span>}{unit.code && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{unit.code}</span>}</div>
                <button onClick={() => isAdmin && setChangingLevel(!changingLevel)} className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-medium mt-1 ${isAdmin ? 'cursor-pointer hover:shadow-md' : ''}`} style={{ backgroundColor: c + '20', color: c, border: `1px solid ${c}30` }}><Layers className="h-3 w-3" /> {unit.level?.name} · Cấp {unit.level?.depth ?? '?'}{isAdmin && <Edit className="h-2.5 w-2.5 ml-1 opacity-40" />}</button>
                {unit.company && <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-lg mt-1 ml-1">🔗 Công ty: <strong>{unit.company.name}</strong></span>}
              </div>
              {isAdmin && <div className="flex gap-1 shrink-0"><button onClick={() => setEditMode(!editMode)} className="h-8 px-3 text-[10px] text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1"><Edit className="h-3 w-3" /> Sửa</button><button onClick={del} className="h-8 px-3 text-[10px] text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer flex items-center gap-1"><Trash2 className="h-3 w-3" /> Xóa</button></div>}
            </div>
          </div>
          {changingLevel && <div className="border-t p-3 bg-amber-50"><p className="text-[11px] font-semibold text-amber-800 mb-2"><Layers className="h-3.5 w-3.5 inline mr-1" />Đổi cấp bậc</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{levels.filter(l => l.depth < childMin).map(l => <button key={l.id} onClick={() => changeLevel(l.id)} className={`flex items-center gap-2 p-2 rounded-xl border-2 cursor-pointer text-left ${unit.level_id === l.id ? 'ring-2' : 'border-gray-200'}`} style={unit.level_id === l.id ? { borderColor: l.color, backgroundColor: l.color + '15' } : {}}><span>{l.icon}</span><div><p className="text-xs font-bold" style={unit.level_id === l.id ? { color: l.color } : {}}>{l.name}</p><p className="text-[9px] text-gray-400">Cấp {l.depth}</p></div>{unit.level_id === l.id && <span className="text-[8px] ml-auto text-green-600">✓</span>}</button>)}</div><button onClick={() => setChangingLevel(false)} className="mt-2 text-[10px] text-gray-500 cursor-pointer">Đóng</button></div>}
        </div>

        {editMode && <div className="bg-blue-50 rounded-xl p-3"><div className="grid grid-cols-3 gap-2"><input value={ed.name || ''} onChange={e => setEd(d => ({ ...d, name: e.target.value }))} className="col-span-3 h-8 px-3 border rounded text-sm" placeholder="Tên" /><input value={ed.short_name || ''} onChange={e => setEd(d => ({ ...d, short_name: e.target.value }))} className="h-8 px-3 border rounded text-sm" placeholder="Viết tắt" /><input value={ed.code || ''} onChange={e => setEd(d => ({ ...d, code: e.target.value }))} className="h-8 px-3 border rounded text-sm" placeholder="Mã" /><button onClick={saveEdit} disabled={saving} className="h-8 bg-blue-600 text-white rounded text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"><Save className="h-3 w-3" />{saving ? '...' : 'Lưu'}</button></div></div>}

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">{tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-xs font-medium border-b-2 cursor-pointer whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>{t.l}{t.n > 0 && <span className="text-[9px] bg-gray-100 px-1 rounded-full ml-0.5">{t.n}</span>}</button>)}</div>

        {/* Children */}
        {tab === 'info' && (children.length > 0 ? <div className="space-y-2">{children.map(ch => <div key={ch.id} className="flex items-center gap-2 p-2.5 bg-white rounded-lg border"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: (ch.level?.color || '#6b7280') + '12' }}>{ch.level?.icon || '📋'}</div><div className="w-1 h-6 rounded-full" style={{ backgroundColor: ch.level?.color }} /><span className="text-sm font-medium text-gray-900 flex-1">{ch.name}</span><span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: (ch.level?.color || '#6b7280') + '15', color: ch.level?.color }}>{ch.level?.name}</span></div>)}</div> : <p className="text-xs text-gray-400 text-center py-6">Chưa có đơn vị con</p>)}

        {/* Members */}
        {tab === 'members' && <div className="space-y-2">
          {members.map(m => { const Icon = RI[m.unit_role] || User; return <div key={m.id} className="flex items-center gap-2 p-2.5 bg-white rounded-lg border"><div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">{m.user?.full_name?.charAt(0)}</div><div className="flex-1 min-w-0"><span className="text-sm font-medium text-gray-900 block truncate">{m.user?.full_name}</span><span className="text-[10px] text-gray-400">{m.user?.email}</span></div><div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${RC[m.unit_role] || ''}`}><Icon className="h-3 w-3" />{RL[m.unit_role]}</div>{isAdmin && <select value={m.unit_role} onChange={e => updateRole(m.id, e.target.value)} className="h-6 px-1 border rounded text-[10px]"><option value="director">GĐ</option><option value="manager">QL</option><option value="team_lead">TN</option><option value="member">NV</option></select>}{isAdmin && <button onClick={() => removeMember(m.id)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="h-3.5 w-3.5" /></button>}</div>; })}
          {isAdmin && <AddMemberForm allUsers={allUsers} existingIds={members.map(m => m.user_id)} onAdd={addMember} />}
        </div>}

        {/* Workflows */}
        {tab === 'workflows' && <div className="space-y-2"><p className="text-[10px] text-gray-500">Nhóm quy trình:</p>{stageGroups.map(g => { const on = stage_groups.some(s => s.id === g.id); return <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${on ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}><input type="checkbox" checked={on} onChange={() => { const cur = stage_groups.map(s => s.id); assignGroups(on ? cur.filter(id => id !== g.id) : [...cur, g.id]); }} className="accent-blue-600" disabled={!isAdmin} /><span>{g.icon}</span><div className="flex-1"><p className="text-sm font-medium">{g.name}</p><p className="text-[10px] text-gray-500">{g.stages?.map(s => s.name).join(' → ')}</p></div><div className="w-2 h-6 rounded-full" style={{ backgroundColor: g.color }} /></label>; })}</div>}

        {/* Templates */}
        {tab === 'templates' && isCo && <TemplatesTab unitId={unitId} sets={tplSets} onReload={ld} isAdmin={isAdmin} />}

        {/* Projects */}
        {tab === 'projects' && (projects.length > 0 ? <div className="space-y-1">{projects.map(p => <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 p-2 bg-white rounded-lg border hover:bg-gray-50 text-sm"><span className="text-xs font-bold text-blue-600">{p.code}</span><span className="text-gray-900 truncate flex-1">{p.name}</span></a>)}</div> : <p className="text-xs text-gray-400 text-center py-6">Chưa gán dự án</p>)}
      </div>
    </Modal>
  );
}

/* ═══ TEMPLATES TAB ═══ */
function TemplatesTab({ unitId, sets, onReload, isAdmin }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState(''); const [newType, setNewType] = useState(''); const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try { await api.post(`/company-templates/units/${unitId}/template-sets`, { name: newName.trim(), project_type: newType || null }); setShowCreate(false); setNewName(''); setNewType(''); onReload(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); } setSaving(false);
  };

  const setDefault = async (id) => { try { await api.put(`/company-templates/template-sets/${id}`, { is_default: true }); onReload(); } catch {} };
  const remove = async (id) => { if (!confirm('Xóa bộ mẫu?')) return; try { await api.delete(`/company-templates/template-sets/${id}`); onReload(); } catch {} };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-500">Bộ nhiệm vụ mẫu cho công ty:</p>
        {isAdmin && <button onClick={() => setShowCreate(true)} className="h-7 px-2 text-[10px] text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1"><Plus className="h-3 w-3" /> Thêm bộ</button>}
      </div>

      {showCreate && (
        <div className="bg-blue-50 rounded-lg p-3 space-y-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} className="w-full h-8 px-3 border rounded text-sm" placeholder="Tên bộ mẫu (VD: Dự án Biệt thự)" />
          <div className="flex gap-2">
            <input value={newType} onChange={e => setNewType(e.target.value)} className="flex-1 h-8 px-3 border rounded text-sm" placeholder="Loại dự án (optional)" />
            <button onClick={create} disabled={saving} className="h-8 px-3 bg-blue-600 text-white rounded text-xs font-medium cursor-pointer disabled:opacity-50">{saving ? '...' : 'Tạo'}</button>
            <button onClick={() => setShowCreate(false)} className="h-8 px-3 border rounded text-xs cursor-pointer">Hủy</button>
          </div>
        </div>
      )}

      {sets.map(s => (
        <div key={s.id} className={`flex items-center gap-3 p-3 bg-white rounded-lg border ${s.is_default ? 'border-green-400 bg-green-50/30' : ''}`}>
          <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{s.name}</span>
              {s.is_default && <span className="text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">MẶC ĐỊNH</span>}
              {s.project_type && <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{s.project_type}</span>}
            </div>
            <p className="text-[10px] text-gray-400">{s.task_count || 0} task mẫu</p>
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              {!s.is_default && <button onClick={() => setDefault(s.id)} className="h-6 px-2 text-[9px] text-green-600 bg-green-50 rounded hover:bg-green-100 cursor-pointer">Đặt MĐ</button>}
              <a href={`/template-sets/${s.id}`} className="h-6 px-2 text-[9px] text-blue-600 bg-blue-50 rounded hover:bg-blue-100 flex items-center gap-0.5"><Edit className="h-2.5 w-2.5" /> Sửa</a>
              <button onClick={() => remove(s.id)} className="h-6 px-2 text-[9px] text-red-600 bg-red-50 rounded hover:bg-red-100 cursor-pointer"><Trash2 className="h-2.5 w-2.5" /></button>
            </div>
          )}
        </div>
      ))}

      {sets.length === 0 && !showCreate && <p className="text-xs text-gray-400 text-center py-4">Chưa có bộ NV mẫu</p>}
    </div>
  );
}

/* ═══ ADD MEMBER ═══ */
function AddMemberForm({ allUsers, existingIds, onAdd }) {
  const [uid, setUid] = useState(''); const [role, setRole] = useState('member');
  const avail = allUsers.filter(u => u.is_active && !existingIds.includes(u.id));
  return (
    <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200">
      <UserPlus className="h-4 w-4 text-blue-500 shrink-0" />
      <select value={uid} onChange={e => setUid(e.target.value)} className="flex-1 h-7 px-2 border rounded text-xs"><option value="">Chọn NV...</option>{avail.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
      <select value={role} onChange={e => setRole(e.target.value)} className="h-7 px-2 border rounded text-xs"><option value="director">GĐ</option><option value="manager">QL</option><option value="team_lead">TN</option><option value="member">NV</option></select>
      <button onClick={() => { if (!uid) return; onAdd(uid, role); setUid(''); }} className="h-7 px-3 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50" disabled={!uid}>Thêm</button>
    </div>
  );
}