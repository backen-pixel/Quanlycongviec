import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import Modal from '../components/Modal';
import {
  Plus, ChevronRight, ChevronDown, Users, Trash2, Layers,
  Edit, Shield, FolderKanban, Network, Save, X, UserPlus, Crown, User, ArrowDownRight
} from 'lucide-react';

const ROLE_LABELS = { director: 'Giám đốc', manager: 'Quản lý', team_lead: 'Trưởng nhóm', member: 'Nhân viên' };
const ROLE_COLORS = { director: 'bg-purple-100 text-purple-700', manager: 'bg-blue-100 text-blue-700', team_lead: 'bg-amber-100 text-amber-700', member: 'bg-gray-100 text-gray-600' };
const ROLE_ICONS = { director: Crown, manager: Shield, team_lead: Users, member: User };

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
      const exp = {};
      const autoExpand = (nodes, depth) => { nodes.forEach(n => { if (depth < 2) exp[n.id] = true; if (n.children) autoExpand(n.children, depth + 1); }); };
      autoExpand(u.data.tree || [], 0);
      setExpanded(prev => ({ ...prev, ...exp }));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const expandAll = () => { const e = {}; units.forEach(u => { e[u.id] = true; }); setExpanded(e); };
  const collapseAll = () => setExpanded({});

  if (loading) return <div className="flex items-center justify-center py-20"><svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg></div>;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Network className="h-6 w-6 text-blue-600" /> Cấu Trúc Tổ Chức
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{units.length} đơn vị · {levels.length} cấp bậc · {stageGroups.length} nhóm quy trình</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="h-8 px-3 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">Mở hết</button>
          <button onClick={collapseAll} className="h-8 px-3 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer">Thu gọn</button>
          {isAdmin && <button onClick={() => setShowCreate('root')} className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 cursor-pointer"><Plus className="h-4 w-4" /> Thêm gốc</button>}
        </div>
      </div>

      {/* Level legend */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
        <p className="text-[10px] text-blue-600 font-semibold uppercase mb-2">Cấp bậc trong hệ thống</p>
        <div className="flex items-center gap-1 flex-wrap">
          {levels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: l.color + '18', color: l.color, border: `1px solid ${l.color}30` }}>
                <span className="text-sm">{l.icon || '📋'}</span> {l.name}
                <span className="text-[9px] opacity-50">({l.depth})</span>
              </span>
              {i < levels.length - 1 && <span className="text-gray-300">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Org chart */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {tree.length > 0 ? (
          <div className="p-4 space-y-0">
            {tree.map((node, i) => (
              <OrgNode key={node.id} node={node} depth={0} isLast={i === tree.length - 1}
                expanded={expanded} toggleExpand={toggleExpand}
                onSelect={setSelectedUnit} onAddChild={setShowCreate} isAdmin={isAdmin} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <Network className="h-14 w-14 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">Chưa có đơn vị nào</p>
            <p className="text-[11px] mt-1">Bấm "Thêm gốc" để bắt đầu xây dựng</p>
          </div>
        )}
      </div>

      {showCreate && <CreateUnitModal parentId={showCreate === 'root' ? null : showCreate} levels={levels} units={units} onCreated={() => { load(); setShowCreate(null); }} onClose={() => setShowCreate(null)} />}
      {selectedUnit && <UnitDetailModal unitId={selectedUnit} levels={levels} stageGroups={stageGroups} allUsers={allUsers} isAdmin={isAdmin} onUpdated={load} onClose={() => setSelectedUnit(null)} />}
    </div>
  );
}

/* ═══ ORG CHART NODE ═══ */
function OrgNode({ node, depth, isLast, expanded, toggleExpand, onSelect, onAddChild, isAdmin }) {
  const isOpen = expanded[node.id];
  const has = node.children?.length > 0;
  const color = node.level?.color || '#6b7280';

  return (
    <div className="relative">
      {/* Connector line */}
      {depth > 0 && (
        <div className="absolute" style={{ left: (depth - 1) * 36 + 17, top: 0, width: 20, height: 24 }}>
          <div className="absolute left-0 top-0 w-px bg-gray-200" style={{ height: isLast ? 24 : '100%' }} />
          <div className="absolute left-0 top-[24px] h-px bg-gray-200 w-5" />
        </div>
      )}

      <div className="flex items-stretch gap-0 py-0.5" style={{ paddingLeft: depth * 36 }}>
        {/* Expand btn */}
        <button onClick={e => { e.stopPropagation(); toggleExpand(node.id); }}
          className={`w-7 h-7 mt-2.5 rounded-md flex items-center justify-center shrink-0 ${has ? 'hover:bg-gray-100 cursor-pointer' : ''}`}>
          {has ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />)
            : <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color + '60' }} />}
        </button>

        {/* Card */}
        <div onClick={() => onSelect(node.id)}
          className="flex-1 flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md group"
          style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform"
            style={{ backgroundColor: color + '12' }}>
            {node.level?.icon || '📋'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-900 truncate">{node.name}</h3>
              {node.short_name && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{node.short_name}</span>}
              {node.code && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{node.code}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: color + '18', color }}>
                {node.level?.name} · Cấp {node.level?.depth ?? '?'}
              </span>
              {node.member_count > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> {node.member_count}</span>}
              {node.stage_groups?.length > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><FolderKanban className="h-2.5 w-2.5" /> {node.stage_groups.map(g => g.name).join(', ')}</span>}
              {has && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><ArrowDownRight className="h-2.5 w-2.5" /> {node.children.length} con</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); onAddChild(node.id); }}
              className="h-7 px-2 text-[10px] text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Plus className="h-3 w-3" /> Con
            </button>
          )}
        </div>
      </div>

      {isOpen && has && node.children.map((child, i) => (
        <OrgNode key={child.id} node={child} depth={depth + 1} isLast={i === node.children.length - 1}
          expanded={expanded} toggleExpand={toggleExpand} onSelect={onSelect} onAddChild={onAddChild} isAdmin={isAdmin} />
      ))}
    </div>
  );
}

/* ═══ CREATE UNIT ═══ */
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
  const selectedLevel = levels.find(l => l.id === levelId);

  useEffect(() => { if (avail.length && !levelId) setLevelId(avail[0].id); }, [avail.length]);

  const save = async () => {
    if (!name.trim()) return alert('Nhập tên');
    if (!levelId) return alert('Chọn cấp bậc');
    setSaving(true);
    try { await api.post('/ecosystem/units', { name: name.trim(), short_name: shortName || null, code: code || null, level_id: levelId, parent_id: parentId || null, description: desc || null }); onCreated(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={parent ? `Thêm con: ${parent.name}` : 'Thêm đơn vị gốc'} size="md">
      <div className="space-y-4">
        {parent && (
          <div className="flex items-center gap-2 bg-blue-50 rounded-xl p-3">
            <span className="text-lg">{parent.level?.icon}</span>
            <div className="w-1 h-8 rounded-full" style={{ backgroundColor: parent.level?.color }} />
            <div>
              <p className="text-sm font-bold text-gray-900">{parent.name}</p>
              <p className="text-[10px]" style={{ color: parent.level?.color }}>{parent.level?.name} · Cấp {parent.level?.depth}</p>
            </div>
            <span className="text-gray-300 mx-2">→</span>
            <span className="text-xs text-gray-500">Thêm con bên dưới</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Tên đơn vị *</label><input value={name} onChange={e => setName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" placeholder="VD: Khối Kinh Doanh" /></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Viết tắt</label><input value={shortName} onChange={e => setShortName(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm" /></div>
          <div><label className="text-[11px] font-medium text-gray-600 block mb-1">Mã</label><input value={code} onChange={e => setCode(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-sm font-mono" /></div>
          <div className="col-span-2">
            <label className="text-[11px] font-medium text-gray-600 block mb-1">Cấp bậc *</label>
            {avail.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {avail.map(l => (
                  <button key={l.id} onClick={() => setLevelId(l.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all text-left ${levelId === l.id ? 'shadow-md scale-[1.02]' : 'border-gray-200 hover:border-gray-300'}`}
                    style={levelId === l.id ? { borderColor: l.color, backgroundColor: l.color + '08' } : {}}>
                    <span className="text-lg">{l.icon || '📋'}</span>
                    <div><p className="text-xs font-bold" style={{ color: levelId === l.id ? l.color : '#374151' }}>{l.name}</p><p className="text-[9px] text-gray-400">Cấp {l.depth}</p></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="bg-red-50 rounded-lg p-3 text-xs text-red-600">Không có cấp bậc phù hợp. <a href="/ecosystem-levels" className="underline font-medium">Quản lý cấp bậc</a></div>
            )}
          </div>
          <div className="col-span-2"><label className="text-[11px] font-medium text-gray-600 block mb-1">Mô tả</label><textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none" /></div>
        </div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button><button onClick={save} disabled={saving || !levelId} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5 hover:bg-blue-700">{saving ? '...' : <><Plus className="h-3.5 w-3.5" /> Tạo</>}</button></div>
      </div>
    </Modal>
  );
}

/* ═══ UNIT DETAIL + CHANGE LEVEL ═══ */
function UnitDetailModal({ unitId, levels, stageGroups, allUsers, isAdmin, onUpdated, onClose }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [editMode, setEditMode] = useState(false);
  const [changingLevel, setChangingLevel] = useState(false);
  const [ed, setEd] = useState({});
  const [saving, setSaving] = useState(false);

  const ld = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/ecosystem/units/${unitId}`); setD(data); setEd({ name: data.unit.name, short_name: data.unit.short_name, code: data.unit.code, description: data.unit.description }); } catch {}
    setLoading(false);
  }, [unitId]);
  useEffect(() => { ld(); }, [ld]);

  const saveEdit = async () => { setSaving(true); try { await api.put(`/ecosystem/units/${unitId}`, ed); setEditMode(false); ld(); onUpdated(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); } setSaving(false); };

  const changeLevel = async (newLevelId) => {
    try { await api.put(`/ecosystem/units/${unitId}`, { level_id: newLevelId }); setChangingLevel(false); ld(); onUpdated(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const addMember = async (uid, role) => { try { await api.post(`/ecosystem/units/${unitId}/members`, { user_id: uid, unit_role: role, can_manage_children: ['director', 'manager'].includes(role) }); ld(); onUpdated(); } catch (e) { alert(e.response?.data?.error || 'Lỗi'); } };
  const removeMember = async mid => { if (!confirm('Xóa?')) return; try { await api.delete(`/ecosystem/units/${unitId}/members/${mid}`); ld(); onUpdated(); } catch {} };
  const updateRole = async (mid, role) => { try { await api.put(`/ecosystem/units/${unitId}/members/${mid}`, { unit_role: role, can_manage_children: ['director', 'manager'].includes(role) }); ld(); } catch {} };
  const assignGroups = async gids => { try { await api.post(`/ecosystem/units/${unitId}/stage-groups`, { group_ids: gids }); ld(); onUpdated(); } catch {} };
  const del = async () => { if (!confirm('Xóa đơn vị?')) return; try { await api.delete(`/ecosystem/units/${unitId}`); onClose(); onUpdated(); } catch {} };

  if (loading || !d) return <Modal open onClose={onClose} title="..." size="lg"><div className="flex items-center justify-center py-10"><svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg></div></Modal>;

  const { unit, members, stage_groups, children, projects } = d;
  const existIds = members.map(m => m.user_id);
  const lvl = unit.level;
  const color = lvl?.color || '#6b7280';

  // Available levels for change: must be above children's depth
  const childMinDepth = children.length > 0 ? Math.min(...children.map(c => c.level?.depth ?? 99)) : 99;
  const availLevels = levels.filter(l => l.depth < childMinDepth);

  return (
    <Modal open onClose={onClose} title={`${lvl?.icon || '📋'} ${unit.name}`} size="lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${color}30` }}>
          <div className="p-3" style={{ backgroundColor: color + '08' }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: color + '15' }}>{lvl?.icon || '📋'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-gray-900">{unit.name}</span>
                  {unit.short_name && <span className="text-[10px] bg-white border px-1.5 py-0.5 rounded">{unit.short_name}</span>}
                  {unit.code && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">{unit.code}</span>}
                </div>
                {/* Level badge — click to change */}
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => isAdmin && setChangingLevel(!changingLevel)}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${isAdmin ? 'cursor-pointer hover:shadow-md' : ''}`}
                    style={{ backgroundColor: color + '20', color, border: `1px solid ${color}30` }}>
                    <Layers className="h-3 w-3" /> {lvl?.icon} {lvl?.name || 'Chưa gán'} · Cấp {lvl?.depth ?? '?'}
                    {isAdmin && <Edit className="h-2.5 w-2.5 ml-1 opacity-40" />}
                  </button>
                  {unit.description && <span className="text-[10px] text-gray-400 truncate">— {unit.description}</span>}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditMode(!editMode)} className="h-8 px-3 text-[10px] text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1"><Edit className="h-3 w-3" /> Sửa</button>
                  <button onClick={del} className="h-8 px-3 text-[10px] text-red-600 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer flex items-center gap-1"><Trash2 className="h-3 w-3" /> Xóa</button>
                </div>
              )}
            </div>
          </div>

          {/* Change level panel */}
          {changingLevel && (
            <div className="border-t p-3 bg-amber-50">
              <p className="text-[11px] font-semibold text-amber-800 mb-2 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Đổi cấp bậc</p>
              {children.length > 0 && <p className="text-[10px] text-amber-600 mb-2">⚠️ Có {children.length} đơn vị con — chỉ chọn cấp cao hơn con (depth &lt; {childMinDepth})</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availLevels.map(l => (
                  <button key={l.id} onClick={() => changeLevel(l.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all text-left ${unit.level_id === l.id ? 'ring-2 ring-offset-1' : 'border-gray-200 hover:border-gray-300'}`}
                    style={unit.level_id === l.id ? { borderColor: l.color, backgroundColor: l.color + '15', ringColor: l.color } : {}}>
                    <span className="text-lg">{l.icon || '📋'}</span>
                    <div>
                      <p className="text-xs font-bold" style={unit.level_id === l.id ? { color: l.color } : {}}>{l.name}</p>
                      <p className="text-[9px] text-gray-400">Cấp {l.depth}</p>
                    </div>
                    {unit.level_id === l.id && <span className="text-[9px] ml-auto text-green-600 font-bold">✓ Hiện tại</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setChangingLevel(false)} className="mt-2 text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer">Đóng</button>
            </div>
          )}
        </div>

        {/* Edit form */}
        {editMode && (
          <div className="bg-blue-50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input value={ed.name || ''} onChange={e => setEd(d => ({ ...d, name: e.target.value }))} className="col-span-3 h-8 px-3 border rounded text-sm" placeholder="Tên" />
              <input value={ed.short_name || ''} onChange={e => setEd(d => ({ ...d, short_name: e.target.value }))} className="h-8 px-3 border rounded text-sm" placeholder="Viết tắt" />
              <input value={ed.code || ''} onChange={e => setEd(d => ({ ...d, code: e.target.value }))} className="h-8 px-3 border rounded text-sm" placeholder="Mã" />
              <button onClick={saveEdit} disabled={saving} className="h-8 bg-blue-600 text-white rounded text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"><Save className="h-3 w-3" />{saving ? '...' : 'Lưu'}</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {[{ id: 'info', label: 'Đơn vị con', c: children.length }, { id: 'members', label: 'Thành viên', c: members.length }, { id: 'workflows', label: 'Quy trình', c: stage_groups.length }, { id: 'projects', label: 'Dự án', c: projects.length }].map(t =>
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-xs font-medium border-b-2 cursor-pointer ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>{t.label}{t.c > 0 && <span className="text-[9px] bg-gray-100 px-1 rounded-full ml-0.5">{t.c}</span>}</button>
          )}
        </div>

        {/* Tab: Children */}
        {tab === 'info' && (
          <div className="space-y-2">
            {children.length > 0 ? children.map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2.5 bg-white rounded-lg border text-sm hover:bg-gray-50">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: (c.level?.color || '#6b7280') + '12' }}>{c.level?.icon || '📋'}</div>
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: c.level?.color }} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  {c.short_name && <span className="text-[10px] text-gray-400 ml-1.5">{c.short_name}</span>}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: (c.level?.color || '#6b7280') + '15', color: c.level?.color }}>{c.level?.name}</span>
              </div>
            )) : <p className="text-xs text-gray-400 text-center py-6">Chưa có đơn vị con</p>}
          </div>
        )}

        {/* Tab: Members */}
        {tab === 'members' && (
          <div className="space-y-2">
            {members.map(m => { const RI = ROLE_ICONS[m.unit_role] || User; return (
              <div key={m.id} className="flex items-center gap-2 p-2.5 bg-white rounded-lg border">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">{m.user?.full_name?.charAt(0)}</div>
                <div className="flex-1 min-w-0"><span className="text-sm font-medium text-gray-900 truncate block">{m.user?.full_name}</span><span className="text-[10px] text-gray-400">{m.user?.email}</span></div>
                <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.unit_role] || ''}`}><RI className="h-3 w-3" />{ROLE_LABELS[m.unit_role]}</div>
                {isAdmin && <select value={m.unit_role} onChange={e => updateRole(m.id, e.target.value)} className="h-6 px-1 border rounded text-[10px]"><option value="director">Giám đốc</option><option value="manager">Quản lý</option><option value="team_lead">Trưởng nhóm</option><option value="member">Nhân viên</option></select>}
                {isAdmin && <button onClick={() => removeMember(m.id)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ); })}
            {isAdmin && <AddMemberForm allUsers={allUsers} existingIds={existIds} onAdd={addMember} />}
          </div>
        )}

        {/* Tab: Workflows */}
        {tab === 'workflows' && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-500">Nhóm quy trình gán cho đơn vị:</p>
            {stageGroups.map(g => { const on = stage_groups.some(sg => sg.id === g.id); return (
              <label key={g.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${on ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={on} onChange={() => { const cur = stage_groups.map(sg => sg.id); assignGroups(on ? cur.filter(id => id !== g.id) : [...cur, g.id]); }} className="accent-blue-600" disabled={!isAdmin} />
                <span className="text-sm">{g.icon}</span>
                <div className="flex-1"><p className="text-sm font-medium text-gray-800">{g.name}</p><p className="text-[10px] text-gray-500">{g.stages?.map(s => s.name).join(' → ') || g.description}</p></div>
                <div className="w-2 h-6 rounded-full" style={{ backgroundColor: g.color }} />
              </label>
            ); })}
          </div>
        )}

        {/* Tab: Projects */}
        {tab === 'projects' && (
          <div className="space-y-1">
            {projects.length > 0 ? projects.map(p => (
              <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 p-2 bg-white rounded-lg border hover:bg-gray-50 text-sm">
                <span className="text-xs font-bold text-blue-600">{p.code}</span>
                <span className="text-gray-900 truncate flex-1">{p.name}</span>
                <span className="text-[10px] text-gray-400">{p.role}</span>
              </a>
            )) : <p className="text-xs text-gray-400 text-center py-6">Chưa gán dự án</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ═══ ADD MEMBER FORM ═══ */
function AddMemberForm({ allUsers, existingIds, onAdd }) {
  const [uid, setUid] = useState('');
  const [role, setRole] = useState('member');
  const avail = allUsers.filter(u => u.is_active && !existingIds.includes(u.id));
  return (
    <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200">
      <UserPlus className="h-4 w-4 text-blue-500 shrink-0" />
      <select value={uid} onChange={e => setUid(e.target.value)} className="flex-1 h-7 px-2 border rounded text-xs"><option value="">Chọn nhân viên...</option>{avail.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
      <select value={role} onChange={e => setRole(e.target.value)} className="h-7 px-2 border rounded text-xs"><option value="director">GĐ</option><option value="manager">QL</option><option value="team_lead">TN</option><option value="member">NV</option></select>
      <button onClick={() => { if (!uid) return; onAdd(uid, role); setUid(''); }} className="h-7 px-3 bg-blue-600 text-white rounded text-[10px] font-medium cursor-pointer disabled:opacity-50" disabled={!uid}>Thêm</button>
    </div>
  );
}