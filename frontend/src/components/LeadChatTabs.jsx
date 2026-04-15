import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { Trash2, Send, Users, Crown, Shield, Building2, Eye, Paperclip, X, Mic } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
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
export function LeadChatTab({ leadId, socket, fillParent, onMessagesChange }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const { user } = useAuth();
  const { registerLeadChatPresence } = useMessengerDock();
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  const emitMessages = useCallback((list) => {
    onMessagesChangeRef.current?.(list);
  }, []);

  useEffect(() => {
    emitMessages(messages);
  }, [messages, emitMessages]);

  useEffect(() => {
    return registerLeadChatPresence(leadId);
  }, [leadId, registerLeadChatPresence]);

  useEffect(() => {
    setMessages([]);
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

  const send = async (files = null) => {
    const pickedFiles = files ? Array.from(files).filter(Boolean) : [];
    if ((!text.trim() && pickedFiles.length === 0) || sending) return;
    setSending(true);
    try {
      if (pickedFiles.length > 0) {
        // Upload từng file qua endpoint riêng để backend lưu attachment_url/attachment_mime đúng format
        for (let i = 0; i < pickedFiles.length; i++) {
          const fd = new FormData();
          fd.append('file', pickedFiles[i]);
          if (i === 0 && text.trim()) fd.append('content', text); // chỉ file đầu tiên mang theo text
          await api.post(`/crm/leads/${leadId}/chat/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        await api.post(`/crm/leads/${leadId}/chat`, { content: text.trim() });
      }
      setText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gửi tin nhắn'); }
    setSending(false);
  };

  const renderAttachments = (message) => {
    const items = Array.isArray(message.attachments) && message.attachments.length
      ? message.attachments
      : message.attachment_url
        ? [{ url: message.attachment_url, name: message.attachment_name, type: message.attachment_mime, size: message.attachment_size }]
        : [];

    if (!items.length) return null;

    return items.map((att, i) => {
      const isImg = att.type?.startsWith('image/');
      const isVideo = att.type?.startsWith('video/');
      const isAudio = att.type?.startsWith('audio/');
      return (
        <div key={i} className="mt-2">
          {isImg ? (
            <img src={att.url} className="rounded-lg max-w-full max-h-48 cursor-pointer" alt={att.name} onClick={() => setMediaPreview(att)} />
          ) : isVideo ? (
            <video src={att.url} controls className="rounded-lg max-w-full max-h-48 cursor-pointer" onClick={() => setMediaPreview(att)} />
          ) : isAudio ? (
            <audio src={att.url} controls className="w-full max-w-xs" />
          ) : (
            <a href={att.url} target="_blank" rel="noreferrer" className="bg-gray-100 p-2 rounded-lg flex items-center gap-2 text-xs text-blue-600 hover:bg-gray-200">
              <Paperclip size={12} /> {att.name || 'Tệp đính kèm'}
            </a>
          )}
        </div>
      );
    });
  };

  return (
    <div className={fillParent ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'} style={fillParent ? undefined : { height: '450px' }}>
      {/* Media Lightbox */}
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <button type="button" onClick={() => setMediaPreview(null)} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"><X /></button>
          {mediaPreview.type?.startsWith('image/') ? <img src={mediaPreview.url} className="max-h-[80vh] max-w-full rounded-lg" /> :
           <video src={mediaPreview.url} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg" />}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-t-xl">
        {messages.map((m) => {
          const isMe = String(m.user_id) === String(user?.userId || user?.id);
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
                {renderAttachments(m)}
                <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-white rounded-b-xl flex gap-2 shrink-0">
        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => send(e.target.files)} />
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          ref={audioInputRef}
          onChange={(e) => {
            send(e.target.files);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-blue-500 cursor-pointer p-2" title="Đính kèm">
          <Paperclip size={18} />
        </button>
        <button type="button" onClick={() => audioInputRef.current?.click()} className="text-gray-400 hover:text-violet-600 cursor-pointer p-2" title="Ghi âm / file âm thanh">
          <Mic size={18} />
        </button>
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Nhập tin nhắn..."
          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50" />
        <button type="button" onClick={() => send()} disabled={sending || (!text.trim())}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function collectMessengerAttachments(message) {
  if (Array.isArray(message.attachments) && message.attachments.length) return message.attachments;
  if (message.attachment_url) {
    return [{ url: message.attachment_url, name: message.attachment_name, type: message.attachment_mime, size: message.attachment_size }];
  }
  return [];
}

function groupMessengerAttachments(items) {
  const images = [];
  const videos = [];
  const audios = [];
  const files = [];
  (items || []).forEach((att) => {
    const t = att.type || '';
    if (t.startsWith('image/')) images.push(att);
    else if (t.startsWith('video/')) videos.push(att);
    else if (t.startsWith('audio/')) audios.push(att);
    else files.push(att);
  });
  return { images, videos, audios, files };
}

function resolveMentionIdsFromContent(content, members) {
  const ids = [];
  if (!content?.trim() || !members?.length) return ids;
  const re = /@([^\s\n@]+)/g;
  let m;
  while ((m = re.exec(content))) {
    const piece = m[1].toLowerCase();
    const pieceCompact = piece.replace(/\s/g, '');
    for (const mem of members) {
      const name = (mem.user?.full_name || '').trim();
      if (!name) continue;
      const low = name.toLowerCase();
      const lowCompact = low.replace(/\s/g, '');
      if (low.startsWith(piece) || lowCompact.startsWith(pieceCompact)) {
        const id = mem.user_id;
        if (id && !ids.includes(id)) ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function renderMessengerTextContent(content, isMe) {
  if (!content) return null;
  const parts = content.split(/(@[^\s\n@]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          className={
            isMe ? 'font-semibold text-amber-100 underline decoration-amber-200' : 'font-semibold text-amber-900 bg-amber-100/95 px-0.5 rounded'
          }
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ═══════════════════════════════════════════════════════════════
// Chat nhóm nội bộ (Messenger) — không phải Lead/Deal
// ═══════════════════════════════════════════════════════════════
export function MessengerGroupChatTab({ groupId, socket, fillParent, onMessagesChange }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [groupMeta, setGroupMeta] = useState(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionPickIdx, setMentionPickIdx] = useState(0);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const { user } = useAuth();
  const { registerMessengerGroupPresence } = useMessengerDock();
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  const emitMessages = useCallback((list) => {
    onMessagesChangeRef.current?.(list);
  }, []);

  useEffect(() => {
    emitMessages(messages);
  }, [messages, emitMessages]);

  useEffect(() => {
    return registerMessengerGroupPresence(groupId);
  }, [groupId, registerMessengerGroupPresence]);

  const loadGroupMeta = useCallback(async () => {
    try {
      const { data } = await api.get(`/messenger/groups/${groupId}`);
      setGroupMeta({ is_direct: !!data?.is_direct, members: data?.members || [] });
    } catch {
      setGroupMeta(null);
    }
  }, [groupId]);

  useEffect(() => {
    setMessages([]);
    setMentionOpen(false);
    void loadGroupMeta();
    load();
    if (socket) {
      socket.emit('join:messenger_group', groupId);
      const onChat = (msg) => {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      };
      const onMembers = (payload) => {
        if (String(payload?.group_id) !== String(groupId)) return;
        void loadGroupMeta();
        void load();
      };
      socket.on('messenger_group:chat', onChat);
      socket.on('messenger_group:members', onMembers);
      return () => {
        socket.emit('leave:messenger_group', groupId);
        socket.off('messenger_group:chat', onChat);
        socket.off('messenger_group:members', onMembers);
      };
    }
    return undefined;
  }, [groupId, socket, loadGroupMeta, load]);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/messenger/groups/${groupId}/chat`);
      setMessages(r.data || []);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 200);
    } catch (e) {
      console.error(e);
    }
  }, [groupId]);

  const leaveGroup = async () => {
    if (groupMeta?.is_direct) return;
    if (!confirm('Rời nhóm chat này?')) return;
    try {
      await api.post(`/messenger/groups/${groupId}/leave`);
      window.dispatchEvent(new CustomEvent('messenger:left-group', { detail: { groupId } }));
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không rời được nhóm');
    }
  };

  const mentionCandidates = useMemo(() => {
    const members = groupMeta?.members || [];
    const pos = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at === -1) return [];
    const frag = before.slice(at + 1);
    if (frag.includes('\n')) return [];
    const q = frag.toLowerCase();
    return members
      .filter((mem) => String(mem.user_id) !== String(user?.userId || user?.id))
      .filter((mem) => {
        const name = (mem.user?.full_name || '').toLowerCase();
        if (!q) return true;
        return name.includes(q);
      })
      .slice(0, 8);
  }, [groupMeta, text, user]);

  const syncMentionUi = useCallback(() => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at === -1) {
      setMentionOpen(false);
      return;
    }
    const frag = before.slice(at + 1);
    if (frag.includes(' ') || frag.includes('\n')) {
      setMentionOpen(false);
      return;
    }
    setMentionStart(at);
    setMentionOpen(true);
    setMentionPickIdx(0);
  }, [text]);

  const applyMentionPick = (mem) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? text.length;
    const name = (mem.user?.full_name || 'Thành viên').trim();
    const before = text.slice(0, mentionStart);
    const after = text.slice(pos);
    const insert = `@${name} `;
    const next = before + insert + after;
    setText(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const c = before.length + insert.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(c, c);
      }
    });
  };

  const send = async (files = null) => {
    const pickedFiles = files ? Array.from(files).filter(Boolean) : [];
    if ((!text.trim() && pickedFiles.length === 0) || sending) return;
    setSending(true);
    const members = groupMeta?.members || [];
    const mentionIds = resolveMentionIdsFromContent(text.trim(), members);
    try {
      if (pickedFiles.length > 0) {
        for (let i = 0; i < pickedFiles.length; i++) {
          const fd = new FormData();
          fd.append('file', pickedFiles[i]);
          if (i === 0 && text.trim()) {
            fd.append('content', text.trim());
            if (mentionIds.length) fd.append('mention_user_ids', JSON.stringify(mentionIds));
          }
          await api.post(`/messenger/groups/${groupId}/chat/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        await api.post(`/messenger/groups/${groupId}/chat`, { content: text.trim(), mention_user_ids: mentionIds });
      }
      setText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gửi tin nhắn');
    }
    setSending(false);
  };

  const renderAttachmentsGrouped = (message) => {
    const items = collectMessengerAttachments(message);
    if (!items.length) return null;
    const { images, videos, audios, files } = groupMessengerAttachments(items);
    const sections = [];
    if (images.length) sections.push({ key: 'img', label: 'Ảnh', items: images });
    if (videos.length) sections.push({ key: 'vid', label: 'Video', items: videos });
    if (audios.length) sections.push({ key: 'aud', label: 'Âm thanh', items: audios });
    if (files.length) sections.push({ key: 'fil', label: 'Tệp', items: files });
    return sections.map((sec) => (
      <div key={sec.key} className="mt-2 space-y-1">
        <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{sec.label}</p>
        <div className="space-y-1.5">
          {sec.items.map((att, i) => {
            const isImg = att.type?.startsWith('image/');
            const isVideo = att.type?.startsWith('video/');
            const isAudio = att.type?.startsWith('audio/');
            return (
              <div key={`${sec.key}-${i}`}>
                {isImg ? (
                  <img src={att.url} className="rounded-lg max-w-full max-h-48 cursor-pointer" alt={att.name} onClick={() => setMediaPreview(att)} />
                ) : isVideo ? (
                  <video src={att.url} controls className="rounded-lg max-w-full max-h-48 cursor-pointer" onClick={() => setMediaPreview(att)} />
                ) : isAudio ? (
                  <audio src={att.url} controls className="w-full max-w-xs" />
                ) : (
                  <a href={att.url} target="_blank" rel="noreferrer" className="bg-gray-100 p-2 rounded-lg flex items-center gap-2 text-xs text-blue-600 hover:bg-gray-200">
                    <Paperclip size={12} /> {att.name || 'Tệp đính kèm'}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  const uid = user?.userId || user?.id;

  return (
    <div className={fillParent ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'} style={fillParent ? undefined : { height: '450px' }}>
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <button type="button" onClick={() => setMediaPreview(null)} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full">
            <X />
          </button>
          {mediaPreview.type?.startsWith('image/') ? (
            <img src={mediaPreview.url} className="max-h-[80vh] max-w-full rounded-lg" alt="" />
          ) : (
            <video src={mediaPreview.url} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg" />
          )}
        </div>
      )}

      {groupMeta && !groupMeta.is_direct ? (
        <div className="shrink-0 flex justify-end px-3 pt-2 bg-gray-50 border-b border-gray-100">
          <button type="button" onClick={() => void leaveGroup()} className="text-[11px] text-slate-500 hover:text-rose-600 font-medium">
            Rời nhóm
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 rounded-t-xl">
        {messages.map((m) => {
          const isMe = String(m.user_id) === String(uid);
          const mentioned =
            Array.isArray(m.mention_user_ids) && m.mention_user_ids.map(String).includes(String(uid));
          if (m.is_system) {
            return (
              <div key={m.id} className="flex justify-center my-2">
                <span className="text-[10px] text-violet-700 bg-violet-50 px-3 py-1.5 rounded-full shadow-sm border border-violet-100 max-w-[95%] text-center leading-snug">
                  {m.content}
                  <span className="text-violet-400"> · {formatTime(m.created_at)}</span>
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && <Avatar name={m.user?.full_name} url={m.user?.avatar} size={7} />}
              <div
                className={`max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  isMe
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                }`}
              >
                {!isMe && <p className="text-[10px] font-medium mb-0.5 text-blue-600">{m.user?.full_name}</p>}
                {mentioned && (
                  <p className="text-[9px] font-semibold mb-1 text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 inline-block">
                    Bạn được nhắc (@)
                  </p>
                )}
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                  {renderMessengerTextContent(m.content, isMe)}
                </div>
                {renderAttachmentsGrouped(m)}
                <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t bg-white rounded-b-xl shrink-0 relative">
        {mentionOpen && mentionCandidates.length > 0 && (
          <ul className="absolute bottom-full left-3 right-14 mb-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-xs z-10">
            {mentionCandidates.map((mem, idx) => (
              <li key={mem.user_id}>
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1.5 hover:bg-sky-50 ${idx === mentionPickIdx ? 'bg-sky-50' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMentionPick(mem)}
                >
                  @{mem.user?.full_name || mem.user_id}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 items-end">
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => send(e.target.files)} />
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={audioInputRef}
            onChange={(e) => {
              send(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 hover:text-blue-500 cursor-pointer p-2 shrink-0" title="Đính kèm">
            <Paperclip size={18} />
          </button>
          <button type="button" onClick={() => audioInputRef.current?.click()} className="text-gray-400 hover:text-violet-600 cursor-pointer p-2 shrink-0" title="Ghi âm / file âm thanh">
            <Mic size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            rows={2}
            onChange={(e) => {
              setText(e.target.value);
              requestAnimationFrame(syncMentionUi);
            }}
            onKeyDown={(e) => {
              if (mentionOpen && mentionCandidates.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionPickIdx((i) => Math.min(i + 1, mentionCandidates.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionPickIdx((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyMentionPick(mentionCandidates[mentionPickIdx] || mentionCandidates[0]);
                  return;
                }
                if (e.key === 'Escape') {
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onBlur={() => setTimeout(() => setMentionOpen(false), 200)}
            placeholder="Nhập tin nhắn… Gõ @ để nhắc tên thành viên"
            className="flex-1 min-h-[44px] px-4 py-2 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 resize-y max-h-32"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

