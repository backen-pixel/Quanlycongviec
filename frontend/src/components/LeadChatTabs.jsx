import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { Trash2, Send, Users, Crown, Shield, Building2, Eye } from 'lucide-react';
import { useAuth } from '../lib/auth';
import EmployeePicker from './EmployeePicker';

function Avatar({ name, url, size = 8 }) {
  if (url) return <img src={url} alt="" className={`w-${size} h-${size} rounded-full object-cover`} />;
  const letter = (name || 'U')[0].toUpperCase();
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[letter.charCodeAt(0) % colors.length];
  return <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>{letter}</div>;
}

const formatTime = (d) => {
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
};

// ═══════════════════════════════════════════════════════════════
// Tab Thành viên — dùng EmployeePicker lọc theo Công ty + Phòng ban
// ═══════════════════════════════════════════════════════════════
export function LeadMembersTab({ leadId }) {
  const [members, setMembers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]); // [{user_id, role, name}]
  const [pickUserId, setPickUserId] = useState(null);
  const [pickRole, setPickRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const MEMBER_ROLES = [
    { value: 'responsible', label: 'Chịu trách nhiệm', icon: <Crown size={12} className="text-red-500" />, color: 'text-red-600 bg-red-50' },
    { value: 'member', label: 'Tham gia', icon: <Users size={12} className="text-blue-500" />, color: 'text-blue-600 bg-blue-50' },
    { value: 'supervisor', label: 'Giám sát', icon: <Shield size={12} className="text-amber-500" />, color: 'text-amber-600 bg-amber-50' },
    { value: 'viewer', label: 'Xem', icon: <Eye size={12} className="text-gray-400" />, color: 'text-gray-500 bg-gray-100' },
  ];

  useEffect(() => {
    load();
    api.get('/companies').then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
  }, [leadId]);

  const load = async () => {
    try {
      const r = await api.get(`/crm/leads/${leadId}/members`);
      setMembers(r.data || []);
    } catch (e) { console.error(e); }
  };

  const addToQueue = () => {
    if (!pickUserId) return;
    if (selectedUsers.find(u => u.user_id === pickUserId)) return;
    setSelectedUsers(prev => [...prev, { user_id: pickUserId, role: pickRole }]);
    setPickUserId(null);
  };

  const removeFromQueue = (uid) => setSelectedUsers(prev => prev.filter(u => u.user_id !== uid));

  const updateQueueRole = (uid, role) => setSelectedUsers(prev => prev.map(u => u.user_id === uid ? { ...u, role } : u));

  const submitAll = async () => {
    if (!selectedUsers.length) return;
    setLoading(true);
    try {
      await api.post(`/crm/leads/${leadId}/members`, { members: selectedUsers });
      setSelectedUsers([]);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi thêm thành viên'); }
    setLoading(false);
  };

  const remove = async (uid) => {
    if (!confirm('Xóa thành viên khỏi nhóm?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/members/${uid}`);
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const changeRole = async (uid, newRole) => {
    try {
      await api.post(`/crm/leads/${leadId}/members`, { user_id: uid, role: newRole });
      load();
    } catch (e) { alert('Lỗi cập nhật quyền'); }
  };

  const getRoleMeta = (r) => MEMBER_ROLES.find(x => x.value === r) || MEMBER_ROLES[1];

  return (
    <div className="space-y-4">
      {/* Thêm thành viên */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-blue-700 flex items-center gap-1"><Building2 size={12} /> Thêm thành viên</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); setPickUserId(null); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400">
            <option value="">Chọn công ty...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <EmployeePicker
            companyId={companyId}
            value={pickUserId}
            onChange={(id) => setPickUserId(id)}
            placeholder="Chọn nhân viên..."
            size="md"
          />
          <select value={pickRole} onChange={e => setPickRole(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400">
            {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={addToQueue} disabled={!pickUserId}
          className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-40">
          + Thêm vào danh sách
        </button>

        {/* Queue */}
        {selectedUsers.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-blue-200">
            <p className="text-[10px] text-blue-600 font-medium">Đang chọn {selectedUsers.length} người:</p>
            {selectedUsers.map(su => (
              <div key={su.user_id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-blue-100">
                <span className="flex-1 text-xs text-gray-700 truncate">{su.user_id.slice(0, 8)}...</span>
                <select value={su.role} onChange={e => updateQueueRole(su.user_id, e.target.value)}
                  className="text-[10px] border rounded px-1 py-0.5 bg-white">
                  {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => removeFromQueue(su.user_id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={submitAll} disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-40">
              {loading ? 'Đang thêm...' : `Thêm ${selectedUsers.length} thành viên`}
            </button>
          </div>
        )}
      </div>

      {/* Danh sách thành viên */}
      <p className="text-xs text-gray-400">{members.length} thành viên</p>

      <div className="space-y-2">
        {members.map(m => {
          const rl = getRoleMeta(m.role);
          return (
            <div key={m.user_id} className="flex items-center justify-between p-3 bg-gray-50 border rounded-xl hover:bg-gray-100 transition">
              <div className="flex items-center gap-3">
                <Avatar name={m.user?.full_name} url={m.user?.avatar} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.user?.full_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {rl.icon}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>{rl.label}</span>
                    {m.user?.email && <span className="text-[10px] text-gray-400 ml-1">• {m.user.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}
                  className="text-[10px] border rounded-lg px-2 py-1 bg-white cursor-pointer">
                  {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => remove(m.user_id)}
                  className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg cursor-pointer transition" title="Xóa">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {!members.length && (
          <div className="text-center py-8">
            <Users size={36} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Chưa có thành viên nào</p>
            <p className="text-xs text-gray-300 mt-1">Chọn công ty → nhân viên → quyền để thêm vào nhóm</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab Chat realtime
// ═══════════════════════════════════════════════════════════════
export function LeadChatTab({ leadId, socket }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    load();
    if (socket) {
      socket.emit('join:lead', leadId);
      const handler = (msg) => {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      socket.on('lead:chat', handler);
      return () => {
        socket.emit('leave:lead', leadId);
        socket.off('lead:chat', handler);
      };
    }
  }, [leadId, socket]);

  const load = async () => {
    try {
      const r = await api.get(`/crm/leads/${leadId}/chat`);
      setMessages(r.data || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (e) { console.error(e); }
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/crm/leads/${leadId}/chat`, { content: text });
      setText('');
    } catch (e) { alert('Lỗi gửi tin nhắn'); }
    setSending(false);
  };

  return (
    <div className="flex flex-col" style={{ height: '450px' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-t-xl">
        {messages.map((m) => {
          const isMe = m.user_id === user?.userId;
          if (m.is_system) {
            return (
              <div key={m.id} className="flex justify-center my-2">
                <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
                  {m.content} • {formatTime(m.created_at)}
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && <Avatar name={m.user?.full_name} url={m.user?.avatar} size={7} />}
              <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${
                isMe ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
              }`}>
                {!isMe && <p className={`text-[10px] font-medium mb-0.5 ${isMe ? 'text-blue-200' : 'text-blue-600'}`}>{m.user?.full_name}</p>}
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        {!messages.length && (
          <div className="text-center py-12">
            <Send size={32} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Chưa có tin nhắn</p>
            <p className="text-xs text-gray-300 mt-1">Bắt đầu trao đổi với các thành viên trong nhóm</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-white rounded-b-xl flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Nhập tin nhắn..."
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
