import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { UserPlus, Trash2, Send, Users, Crown, Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';

const API = import.meta.env.VITE_API_URL || '';

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
// Tab Thành viên
// ═══════════════════════════════════════════════════════════════
export function LeadMembersTab({ leadId, allUsers }) {
  const [members, setMembers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => { load(); }, [leadId]);
  const load = async () => {
    try {
      const r = await api.get(`/crm/leads/${leadId}/members`);
      setMembers(r.data || []);
    } catch (e) { console.error(e); }
  };

  const add = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await api.post(`/crm/leads/${leadId}/members`, { user_id: selectedUser });
      setSelectedUser('');
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
    setLoading(false);
  };

  const remove = async (uid) => {
    if (!confirm('Xóa thành viên khỏi nhóm?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/members/${uid}`);
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const memberIds = new Set(members.map(m => m.user_id));
  const availableUsers = (allUsers || []).filter(u => !memberIds.has(u.id));

  const roleLabel = (r) => {
    if (r === 'owner') return { text: 'Chủ sở hữu', icon: <Crown size={12} className="text-amber-500" /> };
    if (r === 'viewer') return { text: 'Xem', icon: <Shield size={12} className="text-gray-400" /> };
    return { text: 'Thành viên', icon: <Users size={12} className="text-blue-500" /> };
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
          <option value="">Chọn thành viên để thêm...</option>
          {availableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} {u.email ? `(${u.email})` : ''}</option>)}
        </select>
        <button onClick={add} disabled={!selectedUser || loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium transition">
          <UserPlus size={14} /> Thêm
        </button>
      </div>

      <p className="text-xs text-gray-400">{members.length} thành viên</p>

      <div className="space-y-2">
        {members.map(m => {
          const rl = roleLabel(m.role);
          return (
            <div key={m.user_id} className="flex items-center justify-between p-3 bg-gray-50 border rounded-xl hover:bg-gray-100 transition">
              <div className="flex items-center gap-3">
                <Avatar name={m.user?.full_name} url={m.user?.avatar_url} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.user?.full_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {rl.icon}
                    <span className="text-[10px] text-gray-400">{rl.text}</span>
                    {m.user?.email && <span className="text-[10px] text-gray-400 ml-1">• {m.user.email}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => remove(m.user_id)}
                className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg cursor-pointer transition" title="Xóa">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {!members.length && (
          <div className="text-center py-8">
            <Users size={36} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Chưa có thành viên nào</p>
            <p className="text-xs text-gray-300 mt-1">Thêm thành viên để cùng trao đổi về Lead/Deal này</p>
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
              {!isMe && <Avatar name={m.user?.full_name} url={m.user?.avatar_url} size={7} />}
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
