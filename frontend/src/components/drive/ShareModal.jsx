import { useEffect, useState } from 'react';
import { X, Users, Building, UserCheck, Globe2, Trash2 } from 'lucide-react';
import api from '../../lib/api';
import { driveShare, driveUnshare, driveListShares } from '../../lib/drive';

const ROLES = [
  { value: 'viewer', label: 'Xem' },
  { value: 'commenter', label: 'Bình luận' },
  { value: 'editor', label: 'Chỉnh sửa' },
  { value: 'owner', label: 'Chủ sở hữu' },
];

/**
 * ShareModal — phân quyền nội bộ cho user/dept/company/role/everyone.
 * props: { targetType: 'file'|'folder'|'root', targetId, targetName, onClose }
 */
export default function ShareModal({ targetType, targetId, targetName, onClose }) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [acls, setAcls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState({ principal_type: 'user', principal_id: '', role: 'viewer' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/users').then((r) => r.data?.users || r.data || []).catch(() => []),
      api.get('/departments').then((r) => r.data?.departments || r.data || []).catch(() => []),
      driveListShares(targetType, targetId).catch(() => ({ acls: [] })),
    ]).then(([u, d, s]) => {
      setUsers(u);
      setDepartments(d);
      setAcls(s.acls || []);
      setLoading(false);
    });
  }, [targetType, targetId]);

  async function handleAdd() {
    if (picking.principal_type !== 'everyone' && !picking.principal_id) return;
    try {
      await driveShare({
        target_type: targetType,
        target_id: targetId,
        principal_type: picking.principal_type,
        principal_id: picking.principal_type === 'everyone' ? null : picking.principal_id,
        role: picking.role,
      });
      const s = await driveListShares(targetType, targetId);
      setAcls(s.acls || []);
      setPicking({ principal_type: 'user', principal_id: '', role: 'viewer' });
    } catch (e) {
      alert(e?.response?.data?.error || e?.message || 'Lỗi');
    }
  }

  async function handleRemove(id) {
    try {
      await driveUnshare(id);
      setAcls((cur) => cur.filter((a) => a.id !== id));
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  function labelForPrincipal(a) {
    if (a.principal_type === 'everyone') return 'Mọi người trong hệ thống';
    if (a.principal_type === 'user') {
      const u = users.find((x) => x.id === a.principal_id);
      return u ? `${u.full_name || u.email} (User)` : `User ${a.principal_id?.slice(0, 8)}...`;
    }
    if (a.principal_type === 'department') {
      const d = departments.find((x) => x.id === a.principal_id);
      return d ? `${d.name} (Phòng ban)` : `Dept ${a.principal_id?.slice(0, 8)}...`;
    }
    if (a.principal_type === 'company') return `Công ty ${a.principal_id?.slice(0, 8)}...`;
    return a.principal_type;
  }

  const principalsList = picking.principal_type === 'user'
    ? users.filter((u) => !search || (u.full_name || u.email || '').toLowerCase().includes(search.toLowerCase()))
    : picking.principal_type === 'department'
    ? departments.filter((d) => !search || d.name?.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="h-14 px-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Chia sẻ</h2>
            <p className="text-xs text-slate-400 truncate" title={targetName}>{targetName}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </header>

        <div className="p-4 space-y-4 overflow-auto">
          {/* Add new */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">Thêm người / nhóm</h3>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: 'user', icon: UserCheck, label: 'User' },
                { v: 'department', icon: Building, label: 'Phòng ban' },
                { v: 'everyone', icon: Globe2, label: 'Mọi người' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setPicking((p) => ({ ...p, principal_type: opt.v, principal_id: '' }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border ${
                    picking.principal_type === opt.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <opt.icon size={12} /> {opt.label}
                </button>
              ))}
            </div>

            {picking.principal_type !== 'everyone' && (
              <>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={picking.principal_type === 'user' ? 'Tìm user...' : 'Tìm phòng ban...'}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
                <div className="border rounded-lg max-h-44 overflow-auto">
                  {principalsList.slice(0, 100).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPicking((c) => ({ ...c, principal_id: p.id }))}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${picking.principal_id === p.id ? 'bg-blue-50' : ''}`}
                    >
                      {picking.principal_type === 'user' ? (p.full_name || p.email) : p.name}
                    </button>
                  ))}
                  {principalsList.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Không có kết quả</p>}
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <select
                value={picking.role}
                onChange={(e) => setPicking((c) => ({ ...c, role: e.target.value }))}
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button
                onClick={handleAdd}
                disabled={picking.principal_type !== 'everyone' && !picking.principal_id}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Thêm
              </button>
            </div>
          </div>

          {/* Current ACLs */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">Đang có quyền</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Đang tải...</p>
            ) : acls.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa chia sẻ cho ai (chỉ chủ sở hữu xem được)</p>
            ) : (
              <ul className="space-y-1">
                {acls.map((a) => (
                  <li key={a.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg">
                    <div className="text-sm text-slate-700">
                      {labelForPrincipal(a)}
                      <span className="ml-2 text-xs text-slate-400">— {ROLES.find((r) => r.value === a.role)?.label || a.role}</span>
                    </div>
                    <button onClick={() => handleRemove(a.id)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
