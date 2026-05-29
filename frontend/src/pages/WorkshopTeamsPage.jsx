import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  Users, Plus, Trash2, Save, Loader2, Truck, Wrench,
  UserPlus, Crown, UserMinus, X, ChevronDown, ChevronUp,
} from 'lucide-react';

const TYPE_CONFIG = {
  delivery: {
    label: 'Vận chuyển',
    icon: Truck,
    color: '#f97316',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
    btn: 'bg-orange-600 hover:bg-orange-700',
  },
  installation: {
    label: 'Lắp đặt',
    icon: Wrench,
    color: '#d97706',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    btn: 'bg-amber-600 hover:bg-amber-700',
  },
};

const AVATAR_COLORS = ['#0f766e', '#1d4ed8', '#7c3aed', '#be185d', '#dc2626', '#059669', '#d97706', '#6366f1'];
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h += id.charCodeAt(i);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function WorkshopTeamsPage() {
  const [teams, setTeams] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('delivery');

  // Form thêm team
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: 'delivery', description: '', color: '#f97316' });
  const [addSaving, setAddSaving] = useState(false);

  // Edit team
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Thêm thành viên
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);

  // Expand team
  const [expandedIds, setExpandedIds] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamRes, userRes] = await Promise.all([
        api.get('/workshop-teams'),
        api.get('/workshop-teams/users'),
      ]);
      setTeams(teamRes.data || []);
      setAllUsers(userRes.data || []);
    } catch {
      setTeams([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = teams.filter((t) => t.type === activeType);

  const handleAddTeam = async () => {
    if (!addForm.name.trim()) return alert('Nhập tên đội');
    setAddSaving(true);
    try {
      await api.post('/workshop-teams', { ...addForm, type: activeType });
      setShowAddTeam(false);
      setAddForm({ name: '', type: 'delivery', description: '', color: '#f97316' });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setAddSaving(false);
  };

  const handleDeleteTeam = async (id) => {
    if (!confirm('Xóa đội này? Các dự án đang gán sẽ bị mất liên kết.')) return;
    try { await api.delete(`/workshop-teams/${id}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const handleSaveEdit = async (id) => {
    setEditSaving(true);
    try {
      await api.put(`/workshop-teams/${id}`, editForm);
      setEditId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setEditSaving(false);
  };

  const handleAddMember = async (teamId) => {
    if (!selectedUser) return alert('Chọn nhân viên');
    setAddingMember(true);
    try {
      await api.post(`/workshop-teams/${teamId}/members`, { user_id: selectedUser, role: selectedRole });
      setAddMemberTeamId(null);
      setSelectedUser('');
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setAddingMember(false);
  };

  const handleRemoveMember = async (teamId, userId) => {
    if (!confirm('Xóa thành viên này khỏi đội?')) return;
    try { await api.delete(`/workshop-teams/${teamId}/members/${userId}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const cfg = TYPE_CONFIG[activeType];
  const Icon = cfg.icon;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quản lý Đội nhóm</h1>
            <p className="text-sm text-gray-500">Đội Vận chuyển & Lắp đặt</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddTeam(true); setAddForm((f) => ({ ...f, type: activeType, color: cfg.color })); }}
          className={`h-9 px-4 text-white rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer ${cfg.btn}`}
        >
          <Plus className="h-4 w-4" /> Tạo đội mới
        </button>
      </div>

      {/* Tab type */}
      <div className="flex gap-2">
        {Object.entries(TYPE_CONFIG).map(([key, c]) => {
          const TIcon = c.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveType(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                activeType === key
                  ? `${c.bg} ${c.border} shadow-sm`
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
              style={{ color: activeType === key ? '#000000' : '#475569' }}
            >
              <TIcon className="h-4 w-4" /> Đội {c.label} ({teams.filter((t) => t.type === key).length})
            </button>
          );
        })}
      </div>

      {/* Add team form */}
      {showAddTeam && (
        <div className={`rounded-xl border-2 p-4 space-y-3 ${cfg.border} ${cfg.bg}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color: cfg.color }} />
              Tạo đội {cfg.label} mới
            </h3>
            <button type="button" onClick={() => setShowAddTeam(false)} className="p-1 hover:bg-gray-200 rounded cursor-pointer">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">Tên đội *</label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full h-8 px-3 border rounded-lg text-sm"
                placeholder={`VD: Đội ${cfg.label} 1`}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium block mb-1">Mô tả</label>
              <input
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full h-8 px-3 border rounded-lg text-sm"
                placeholder="Ghi chú ngắn..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddTeam}
              disabled={addSaving}
              className={`h-8 px-4 text-white rounded-lg text-sm font-medium cursor-pointer flex items-center gap-1 ${cfg.btn}`}
            >
              {addSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Tạo
            </button>
            <button type="button" onClick={() => setShowAddTeam(false)} className="h-8 px-4 border rounded-lg text-sm cursor-pointer">Hủy</button>
          </div>
        </div>
      )}

      {/* Teams list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Icon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có đội {cfg.label} nào</p>
          <p className="text-xs mt-1">Nhấn "Tạo đội mới" để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((team) => {
            const isExpanded = expandedIds[team.id] !== false; // default expanded
            const isEditing = editId === team.id;
            const members = team.members || [];
            const leader = members.find((m) => m.role === 'leader');
            const regular = members.filter((m) => m.role !== 'leader');

            // Users not in this team
            const memberUserIds = new Set(members.map((m) => m.user?.id).filter(Boolean));
            const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

            return (
              <div key={team.id} className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${isEditing ? cfg.border : 'border-gray-200'}`}>
                {/* Team header */}
                <div className={`flex items-center gap-3 px-4 py-3 ${cfg.bg}`}>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: team.color || cfg.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="h-7 px-2 border rounded text-sm flex-1"
                        autoFocus
                      />
                      <input
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                        className="h-7 px-2 border rounded text-sm flex-1"
                        placeholder="Mô tả..."
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold" style={{ color: '#000000' }}>{team.name}</h3>
                      {team.description && <p className="text-[11px] text-gray-500 truncate">{team.description}</p>}
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                      {members.length} người
                    </span>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(team.id)}
                          disabled={editSaving}
                          className={`h-7 px-3 text-white rounded-lg text-xs cursor-pointer ${cfg.btn}`}
                        >
                          {editSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lưu'}
                        </button>
                        <button type="button" onClick={() => setEditId(null)} className="h-7 px-2 border rounded-lg text-xs cursor-pointer">Hủy</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditId(team.id); setEditForm({ name: team.name, description: team.description || '' }); }}
                          className="p-1.5 rounded hover:bg-white/60 text-gray-500 cursor-pointer"
                          title="Sửa tên"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(team.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-400 cursor-pointer"
                          title="Xóa đội"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedIds((p) => ({ ...p, [team.id]: !isExpanded }))}
                          className="p-1.5 rounded hover:bg-white/60 text-gray-500 cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Members */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3">
                    {/* Leader */}
                    {leader && (
                      <div className="flex items-center gap-2 pb-2 border-b border-dashed border-gray-100">
                        <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <div className="flex items-center gap-2 flex-1">
                          {leader.user?.avatar ? (
                            <img src={leader.user.avatar} alt="" className="h-7 w-7 rounded-full" />
                          ) : (
                            <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: avatarColor(leader.user?.id || '') }}>
                              {getInitials(leader.user?.full_name)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-gray-900">{leader.user?.full_name || '—'}</p>
                            <p className="text-[10px] text-amber-600 font-medium">Trưởng nhóm</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => handleRemoveMember(team.id, leader.user?.id)}
                          className="p-1 hover:bg-red-50 text-red-400 rounded cursor-pointer" title="Xóa">
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Regular members */}
                    {regular.length > 0 && (
                      <div className="space-y-2">
                        {regular.map((m) => (
                          <div key={m.id} className="flex items-center gap-2">
                            {m.user?.avatar ? (
                              <img src={m.user.avatar} alt="" className="h-7 w-7 rounded-full shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{ backgroundColor: avatarColor(m.user?.id || '') }}>
                                {getInitials(m.user?.full_name)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{m.user?.full_name || '—'}</p>
                              <p className="text-[10px] text-gray-400">{m.user?.role || ''}</p>
                            </div>
                            <button type="button" onClick={() => handleRemoveMember(team.id, m.user?.id)}
                              className="p-1 hover:bg-red-50 text-red-400 rounded cursor-pointer" title="Xóa">
                              <UserMinus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {members.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">Chưa có thành viên</p>
                    )}

                    {/* Add member row */}
                    {addMemberTeamId === team.id ? (
                      <div className="flex items-center gap-2 pt-2 border-t border-dashed border-gray-100">
                        <select
                          value={selectedUser}
                          onChange={(e) => setSelectedUser(e.target.value)}
                          className="flex-1 h-8 px-2 border rounded-lg text-xs bg-white"
                        >
                          <option value="">— Chọn nhân viên —</option>
                          {availableUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                          ))}
                        </select>
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          className="w-28 h-8 px-2 border rounded-lg text-xs bg-white"
                        >
                          <option value="member">Thành viên</option>
                          <option value="leader">Trưởng nhóm</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddMember(team.id)}
                          disabled={addingMember}
                          className={`h-8 px-3 text-white rounded-lg text-xs font-medium cursor-pointer ${cfg.btn}`}
                        >
                          {addingMember ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Thêm'}
                        </button>
                        <button type="button" onClick={() => { setAddMemberTeamId(null); setSelectedUser(''); }}
                          className="h-8 px-2 border rounded-lg text-xs cursor-pointer">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAddMemberTeamId(team.id); setSelectedUser(''); setSelectedRole('member'); }}
                        className={`w-full h-8 border-2 border-dashed rounded-lg text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5 transition-colors hover:bg-gray-50 ${cfg.border} text-gray-500`}
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Thêm thành viên
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <strong>Lưu ý:</strong> Cần chạy migration <code className="bg-white/80 px-1 rounded">database/79_workshop_teams.sql</code> để sử dụng tính năng này.
        Khi gán đội cho dự án VC, tất cả thành viên trong đội sẽ nhận thông báo tự động.
      </div>
    </div>
  );
}
