import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Modal from '../components/Modal';
import {
  Plus, ChevronRight, ChevronDown, Users, Trash2,
  Edit, Shield, FolderKanban, Network, Save, X, UserPlus, Crown, User
} from 'lucide-react';

const UNIT_ROLE_LABELS = { director: 'Giám đốc', manager: 'Quản lý', team_lead: 'Trưởng nhóm', member: 'Nhân viên' };
const UNIT_ROLE_COLORS = { director: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', team_lead: 'bg-amber-100 text-amber-700', member: 'bg-gray-100 text-gray-600' };
const UNIT_ROLE_ICONS = { director: Crown, manager: Shield, team_lead: Users, member: User };

export default function EcosystemPage() {
  const { user } = useAuth();
  const [tree, setTree] = useState([]);
  const [units, setUnits] = useState([]);
  const [levels, setLevels] = useState([]);
  const [stageGroups, setStageGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
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
      // Auto-expand first level
      const exp = {};
      (u.data.tree || []).forEach(n => { exp[n.id] = true; });
      setExpanded(prev => ({ ...prev, ...exp }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  if (loading) return <div className="flex items-center justify-center py-20"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><Network className="h-6 w-6 text-blue-600" /> Hệ Sinh Thái</h1>
          <p className="text-xs text-gray-500 mt-0.5">{units.length} đơn vị · {levels.length} cấp bậc · {stageGroups.length} nhóm quy trình</p>
        </div>
        {isAdmin && <button onClick={() => setShowCreate('root')} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm đơn vị gốc</button>}
      </div>

      <div className="flex flex-wrap gap-2 bg-gray-50 rounded-xl p-3">
        {levels.map(l => <div key={l.id} className="flex items-center gap-1.5 text-xs"><span>{l.icon||'📋'}</span><span className="font-medium" style={{color:l.color}}>{l.name}</span><span className="text-gray-400">Cấp {l.depth}</span></div>)}
      </div>

      <div className="space-y-2">
        {tree.length > 0 ? tree.map(n => <TreeNode key={n.id} node={n} depth={0} expanded={expanded} toggleExpand={toggleExpand} onSelect={setSelectedUnit} onAddChild={setShowCreate} isAdmin={isAdmin} />) : (
          <div className="text-center py-16 text-gray-400"><Network className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Chưa có đơn vị nào</p><p className="text-[10px] mt-1">Bấm "Thêm đơn vị gốc" để bắt đầu</p></div>
        )}
      </div>

      {showCreate && <CreateUnitModal parentId={showCreate==='root'?null:showCreate} levels={levels} units={units} onCreated={()=>{load();setShowCreate(null);}} onClose={()=>setShowCreate(null)} />}
      {selectedUnit && <UnitDetailModal unitId={selectedUnit} levels={levels} stageGroups={stageGroups} allUsers={allUsers} isAdmin={isAdmin} onUpdated={load} onClose={()=>setSelectedUnit(null)} />}
    </div>
  );
}

function TreeNode({ node, depth, expanded, toggleExpand, onSelect, onAddChild, isAdmin }) {
  const isOpen = expanded[node.id];
  const has = node.children?.length > 0;
  return (
    <div>
      <div className={`flex items-center gap-2 p-3 bg-white rounded-xl border hover:shadow-sm transition-all cursor-pointer ${depth===0?'border-blue-200':''}`} style={{marginLeft:depth*24}} onClick={()=>onSelect(node.id)}>
        <button onClick={e=>{e.stopPropagation();toggleExpand(node.id);}} className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${has?'hover:bg-gray-100 cursor-pointer':'invisible'}`}>
          {isOpen?<ChevronDown className="h-3.5 w-3.5 text-gray-400"/>:<ChevronRight className="h-3.5 w-3.5 text-gray-400"/>}
        </button>
        <span className="text-lg shrink-0">{node.level?.icon||'📋'}</span>
        <div className="w-1.5 h-8 rounded-full shrink-0" style={{backgroundColor:node.level?.color||'#6b7280'}}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900 truncate">{node.name}</h3>
            {node.short_name&&<span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{node.short_name}</span>}
            {node.code&&<span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{node.code}</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <span style={{color:node.level?.color}}>{node.level?.name}</span>
            {node.member_count>0&&<span className="flex items-center gap-0.5"><Users className="h-2.5 w-2.5"/>{node.member_count}</span>}
            {node.stage_groups?.length>0&&<span className="flex items-center gap-0.5"><FolderKanban className="h-2.5 w-2.5"/>{node.stage_groups.map(g=>g.name).join(', ')}</span>}
            {has&&<span>{node.children.length} con</span>}
          </div>
        </div>
        {isAdmin&&<button onClick={e=>{e.stopPropagation();onAddChild(node.id);}} className="h-7 px-2 text-[10px] text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1 shrink-0"><Plus className="h-3 w-3"/>Thêm con</button>}
      </div>
      {isOpen&&has&&<div className="mt-1 space-y-1">{node.children.map(c=><TreeNode key={c.id} node={c} depth={depth+1} expanded={expanded} toggleExpand={toggleExpand} onSelect={onSelect} onAddChild={onAddChild} isAdmin={isAdmin}/>)}</div>}
    </div>
  );
}

function CreateUnitModal({ parentId, levels, units, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [code, setCode] = useState('');
  const [levelId, setLevelId] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const parent = parentId ? units.find(u => u.id === parentId) : null;
  const parentDepth = parent?.level?.depth ?? -1;
  const avail = levels.filter(l => l.depth > parentDepth);
  useEffect(() => { if (avail.length && !levelId) setLevelId(avail[0].id); }, [avail.length]);
  const save = async () => {
    if (!name.trim()) return alert('Nhập tên');
    setSaving(true);
    try { await api.post('/ecosystem/units', { name, short_name:shortName||null, code:code||null, level_id:levelId, parent_id:parentId||null, description:desc||null }); onCreated(); }
    catch (e) { alert(e.response?.data?.error||'Lỗi'); }
    setSaving(false);
  };
  return (
    <Modal open onClose={onClose} title={parent?`Thêm con: ${parent.name}`:'Thêm đơn vị gốc'} size="md">
      <div className="space-y-4">
        {parent&&<div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">Cha: <strong>{parent.level?.icon} {parent.name}</strong> ({parent.level?.name})</div>}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên *</label><input value={name} onChange={e=>setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Khối Kinh Doanh"/></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Viết tắt</label><input value={shortName} onChange={e=>setShortName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm"/></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Mã</label><input value={code} onChange={e=>setCode(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm"/></div>
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Cấp bậc *</label><select value={levelId} onChange={e=>setLevelId(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm">{avail.map(l=><option key={l.id} value={l.id}>{l.icon} {l.name} (Cấp {l.depth})</option>)}</select></div>
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label><textarea value={desc} onChange={e=>setDesc(e.target.value)} className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none"/></div>
        </div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button><button onClick={save} disabled={saving} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5">{saving?'Đang tạo...':<><Plus className="h-3.5 w-3.5"/>Tạo</>}</button></div>
      </div>
    </Modal>
  );
}

function UnitDetailModal({ unitId, levels, stageGroups, allUsers, isAdmin, onUpdated, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [editMode, setEditMode] = useState(false);
  const [ed, setEd] = useState({});
  const [saving, setSaving] = useState(false);
  const ld = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/ecosystem/units/${unitId}`); setD(data); setEd({name:data.unit.name,short_name:data.unit.short_name,code:data.unit.code,description:data.unit.description}); } catch {}
    setLoading(false);
  }, [unitId]);
  useEffect(() => { ld(); }, [ld]);
  const saveEdit = async () => { setSaving(true); try { await api.put(`/ecosystem/units/${unitId}`, ed); setEditMode(false); ld(); onUpdated(); } catch(e){ alert(e.response?.data?.error||'Lỗi'); } setSaving(false); };
  const addMember = async (uid, role) => { try { await api.post(`/ecosystem/units/${unitId}/members`, { user_id:uid, unit_role:role, can_manage_children:['director','manager'].includes(role) }); ld(); onUpdated(); } catch(e){ alert(e.response?.data?.error||'Lỗi'); } };
  const removeMember = async mid => { if(!confirm('Xóa?')) return; try { await api.delete(`/ecosystem/units/${unitId}/members/${mid}`); ld(); onUpdated(); } catch{} };
  const updateRole = async (mid, role) => { try { await api.put(`/ecosystem/units/${unitId}/members/${mid}`, { unit_role:role, can_manage_children:['director','manager'].includes(role) }); ld(); } catch{} };
  const assignGroups = async gids => { try { await api.post(`/ecosystem/units/${unitId}/stage-groups`, { group_ids:gids }); ld(); onUpdated(); } catch{} };
  const del = async () => { if(!confirm('Xóa đơn vị?')) return; try { await api.delete(`/ecosystem/units/${unitId}`); onClose(); onUpdated(); } catch{} };

  if (loading||!d) return <Modal open onClose={onClose} title="..." size="lg"><div className="flex items-center justify-center py-10"><svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div></Modal>;

  const { unit, members, stage_groups, children, projects } = d;
  const existIds = members.map(m => m.user_id);

  return (
    <Modal open onClose={onClose} title={`${unit.level?.icon||'📋'} ${unit.name}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <div className="w-2 h-12 rounded-full" style={{backgroundColor:unit.level?.color}}/>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{unit.name}</span>
              {unit.short_name&&<span className="text-[10px] bg-white border px-1.5 py-0.5 rounded">{unit.short_name}</span>}
              {unit.code&&<span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{unit.code}</span>}
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{backgroundColor:unit.level?.color+'20',color:unit.level?.color}}>{unit.level?.name}</span>
            </div>
            {unit.description&&<p className="text-[10px] text-gray-500 mt-0.5">{unit.description}</p>}
          </div>
          {isAdmin&&<div className="flex gap-1 shrink-0"><button onClick={()=>setEditMode(!editMode)} className="h-7 px-2 text-[10px] text-blue-600 bg-blue-50 rounded hover:bg-blue-100 cursor-pointer"><Edit className="h-3 w-3"/></button><button onClick={del} className="h-7 px-2 text-[10px] text-red-600 bg-red-50 rounded hover:bg-red-100 cursor-pointer"><Trash2 className="h-3 w-3"/></button></div>}
        </div>

        {editMode&&<div className="bg-blue-50 rounded-xl p-3 space-y-2"><div className="grid grid-cols-3 gap-2"><input value={ed.name||''} onChange={e=>setEd(d=>({...d,name:e.target.value}))} className="col-span-3 h-8 px-3 border rounded text-sm" placeholder="Tên"/><input value={ed.short_name||''} onChange={e=>setEd(d=>({...d,short_name:e.target.value}))} className="h-8 px-3 border rounded text-sm" placeholder="Viết tắt"/><input value={ed.code||''} onChange={e=>setEd(d=>({...d,code:e.target.value}))} className="h-8 px-3 border rounded text-sm" placeholder="Mã"/><button onClick={saveEdit} disabled={saving} className="h-8 bg-blue-600 text-white rounded text-xs font-medium cursor-pointer disabled:opacity-50"><Save className="h-3 w-3 inline mr-1"/>{saving?'...':'Lưu'}</button></div></div>}

        <div className="flex gap-1 border-b">
          {[{id:'info',label:'Thông tin',c:children.length},{id:'members',label:'Thành viên',c:members.length},{id:'workflows',label:'Quy trình',c:stage_groups.length},{id:'projects',label:'Dự án',c:projects.length}].map(t=>
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-2 text-xs font-medium border-b-2 cursor-pointer ${tab===t.id?'border-blue-600 text-blue-600':'border-transparent text-gray-500'}`}>{t.label}{t.c>0&&<span className="text-[9px] bg-gray-100 px-1 rounded-full ml-0.5">{t.c}</span>}</button>
          )}
        </div>

        {tab==='info'&&<div className="space-y-2">{children.length>0?children.map(c=><div key={c.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border text-sm"><span>{c.level?.icon||'📋'}</span><div className="w-1 h-6 rounded-full" style={{backgroundColor:c.level?.color}}/><span className="font-medium text-gray-900">{c.name}</span>{c.short_name&&<span className="text-[10px] text-gray-400">{c.short_name}</span>}<span className="text-[10px] ml-auto" style={{color:c.level?.color}}>{c.level?.name}</span></div>):<p className="text-xs text-gray-400 text-center py-4">Chưa có đơn vị con</p>}</div>}

        {tab==='members'&&<div className="space-y-2">
          {members.map(m=>{const RI=UNIT_ROLE_ICONS[m.unit_role]||User;return(
            <div key={m.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border">
              <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[10px] font-bold shrink-0">{m.user?.full_name?.charAt(0)}</div>
              <div className="flex-1 min-w-0"><span className="text-sm font-medium text-gray-900 truncate block">{m.user?.full_name}</span><span className="text-[10px] text-gray-400">{m.user?.email}</span></div>
              <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${UNIT_ROLE_COLORS[m.unit_role]||''}`}><RI className="h-3 w-3"/>{UNIT_ROLE_LABELS[m.unit_role]}</div>
              {isAdmin&&<select value={m.unit_role} onChange={e=>updateRole(m.id,e.target.value)} className="h-6 px-1 border rounded text-[10px]"><option value="director">Giám đốc</option><option value="manager">Quản lý</option><option value="team_lead">Trưởng nhóm</option><option value="member">Nhân viên</option></select>}
              {isAdmin&&<button onClick={()=>removeMember(m.id)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="h-3.5 w-3.5"/></button>}
            </div>);})}
          {isAdmin&&<AddMemberForm allUsers={allUsers} existingIds={existIds} onAdd={addMember}/>}
        </div>}

        {tab==='workflows'&&<div className="space-y-2">
          <p className="text-[10px] text-gray-500">Nhóm quy trình gán cho đơn vị:</p>
          {stageGroups.map(g=>{const on=stage_groups.some(sg=>sg.id===g.id);return(
            <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${on?'border-blue-400 bg-blue-50/50':'border-gray-200'}`}>
              <input type="checkbox" checked={on} onChange={()=>{const cur=stage_groups.map(sg=>sg.id);assignGroups(on?cur.filter(id=>id!==g.id):[...cur,g.id]);}} className="accent-blue-600" disabled={!isAdmin}/>
              <span className="text-sm">{g.icon}</span>
              <div className="flex-1"><p className="text-sm font-medium text-gray-800">{g.name}</p><p className="text-[10px] text-gray-500">{g.stages?.map(s=>s.name).join(' → ')||g.description}</p></div>
              <div className="w-2 h-6 rounded-full" style={{backgroundColor:g.color}}/>
            </label>);})}
        </div>}

        {tab==='projects'&&<div className="space-y-1">{projects.length>0?projects.map(p=><a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 p-2 bg-white rounded-lg border hover:bg-gray-50 text-sm"><span className="text-xs font-bold text-blue-600">{p.code}</span><span className="text-gray-900 truncate flex-1">{p.name}</span><span className="text-[10px] text-gray-400">{p.role}</span></a>):<p className="text-xs text-gray-400 text-center py-4">Chưa gán dự án</p>}</div>}
      </div>
    </Modal>
  );
}

function AddMemberForm({ allUsers, existingIds, onAdd }) {
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('member');
  const avail = allUsers.filter(u => u.is_active && !existingIds.includes(u.id));
  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
      <UserPlus className="h-4 w-4 text-blue-500 shrink-0"/>
      <select value={uid} onChange={e=>setUid(e.target.value)} className="flex-1 h-7 px-2 border rounded text-xs"><option value="">Chọn NV...</option>{avail.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
      <select value={role} onChange={e=>setRole(e.target.value)} className="h-7 px-2 border rounded text-xs"><option value="director">GĐ</option><option value="manager">QL</option><option value="team_lead">TN</option><option value="member">NV</option></select>
      <button onClick={()=>{if(!uid)return;onAdd(uid,role);setUid('');}} className="h-7 px-2 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50" disabled={!uid}>Thêm</button>
    </div>
  );
}
