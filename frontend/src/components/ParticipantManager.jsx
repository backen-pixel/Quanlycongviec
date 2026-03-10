import { useState, useEffect } from 'react';
import { Plus, X, Eye, Users } from 'lucide-react';
import api from '../lib/api';
import { getInitials, avatarColor } from '../lib/utils';

/**
 * ParticipantManager - Quản lý người tham gia (hỗ trợ + quan sát)
 * 
 * Props:
 * - entityType: 'task' | 'project'
 * - entityId: ID của task/project
 * - participants: Array hiện tại [{id, user_id, role, user: {full_name, avatar}}]
 * - onUpdated: Callback khi thêm/xóa thành công
 * - readOnly: Chỉ xem (không cho sửa)
 */
export default function ParticipantManager({ entityType, entityId, participants = [], onUpdated, readOnly = false }) {
  const [allUsers, setAllUsers] = useState([]);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showAddObserver, setShowAddObserver] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setAllUsers(data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const addParticipant = async (role) => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      if (entityType === 'task') {
        await api.post(`/tasks/${entityId}/participants`, { user_id: selectedUserId, role });
      } else if (entityType === 'project') {
        // Project participants API nếu có
        await api.post(`/projects/${entityId}/participants`, { user_id: selectedUserId, role });
      }
      onUpdated?.();
      setSelectedUserId('');
      setShowAddParticipant(false);
      setShowAddObserver(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi thêm thành viên');
    }
    setLoading(false);
  };

  const removeParticipant = async (userId) => {
    if (!confirm('Xóa người này khỏi danh sách?')) return;
    setLoading(true);
    try {
      if (entityType === 'task') {
        await api.delete(`/tasks/${entityId}/participants/${userId}`);
      } else if (entityType === 'project') {
        await api.delete(`/projects/${entityId}/participants/${userId}`);
      }
      onUpdated?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa');
    }
    setLoading(false);
  };

  const participantsList = participants.filter(p => p.role === 'participant');
  const observersList = participants.filter(p => p.role === 'observer');

  // Lọc user chưa được thêm
  const existingUserIds = participants.map(p => p.user_id);
  const availableUsers = allUsers.filter(u => !existingUserIds.includes(u.id));

  return (
    <div className="space-y-4">
      {/* ─── Người hỗ trợ ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Users className="h-4 w-4" /> Người hỗ trợ
          </h4>
          {!readOnly && (
            <button
              onClick={() => setShowAddParticipant(!showAddParticipant)}
              className="h-7 px-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm
            </button>
          )}
        </div>

        {/* Form thêm hỗ trợ */}
        {showAddParticipant && (
          <div className="mb-2 flex gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 h-8 px-2 border rounded-lg text-sm"
              disabled={loading}
            >
              <option value="">-- Chọn người --</option>
              {availableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
            <button
              onClick={() => addParticipant('participant')}
              disabled={!selectedUserId || loading}
              className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Thêm'}
            </button>
            <button
              onClick={() => { setShowAddParticipant(false); setSelectedUserId(''); }}
              className="h-8 px-2 text-gray-500 text-xs cursor-pointer"
            >
              Hủy
            </button>
          </div>
        )}

        {/* Danh sách hỗ trợ */}
        <div className="space-y-1">
          {participantsList.map(p => (
            <PersonRow
              key={p.id}
              user={p.user}
              onRemove={readOnly ? null : () => removeParticipant(p.user_id)}
            />
          ))}
          {!participantsList.length && (
            <p className="text-xs text-gray-400 italic">Chưa có người hỗ trợ</p>
          )}
        </div>
      </div>

      {/* ─── Người quan sát ─── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
            <Eye className="h-4 w-4" /> Người quan sát
          </h4>
          {!readOnly && (
            <button
              onClick={() => setShowAddObserver(!showAddObserver)}
              className="h-7 px-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm
            </button>
          )}
        </div>

        {/* Form thêm quan sát */}
        {showAddObserver && (
          <div className="mb-2 flex gap-2 bg-purple-50 p-2 rounded-lg border border-purple-100">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 h-8 px-2 border rounded-lg text-sm"
              disabled={loading}
            >
              <option value="">-- Chọn người --</option>
              {availableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
            <button
              onClick={() => addParticipant('observer')}
              disabled={!selectedUserId || loading}
              className="h-8 px-3 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '...' : 'Thêm'}
            </button>
            <button
              onClick={() => { setShowAddObserver(false); setSelectedUserId(''); }}
              className="h-8 px-2 text-gray-500 text-xs cursor-pointer"
            >
              Hủy
            </button>
          </div>
        )}

        {/* Danh sách quan sát */}
        <div className="space-y-1">
          {observersList.map(p => (
            <PersonRow
              key={p.id}
              user={p.user}
              onRemove={readOnly ? null : () => removeParticipant(p.user_id)}
              isObserver
            />
          ))}
          {!observersList.length && (
            <p className="text-xs text-gray-400 italic">Chưa có người quan sát</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ PersonRow Component ═══
function PersonRow({ user, onRemove, isObserver = false }) {
  if (!user) return null;
  
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 group hover:bg-gray-100 transition-colors">
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: avatarColor(user.full_name) }}
      >
        {getInitials(user.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
        <div className="text-xs text-gray-500">{user.email}</div>
      </div>
      {isObserver && (
        <Eye className="h-3.5 w-3.5 text-purple-500 shrink-0" />
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="h-6 w-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          title="Xóa"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
