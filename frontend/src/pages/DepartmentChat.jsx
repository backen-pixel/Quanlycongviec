import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket } from '../lib/socket';
import { getInitials, avatarColor, ROLE_LABELS } from '../lib/utils';
import { useMessengerDock } from '../context/MessengerDockContext';
import {
  Send, ArrowLeft, Pin, Reply, Trash2, Edit, MoreVertical, Paperclip, X,
  Users, Building, Image, File, Plus, Video, UserPlus, Smile
} from 'lucide-react';

export default function DepartmentChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { registerDepartmentChatPresence, markDeptRead } = useMessengerDock();
  const [dept, setDept] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editMsg, setEditMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [menuMsg, setMenuMsg] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [mediaPreview, setMediaPreview] = useState(null);
  const [emojiPickerMsg, setEmojiPickerMsg] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load department + messages
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/departments/${id}`),
      api.get(`/departments/${id}/messages`),
    ]).then(([deptRes, msgRes]) => {
      setDept(deptRes.data.department);
      setMembers(deptRes.data.members || []);
      setMessages(msgRes.data.messages || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  // Đăng ký presence để khi đang ở trang này, tin nhắn mới KHÔNG bật bong bóng
  // (chỉ stack vào danh sách messages). Đồng thời reset badge unread.
  useEffect(() => {
    if (!id) return undefined;
    markDeptRead(id);
    return registerDepartmentChatPresence(id);
  }, [id, registerDepartmentChatPresence, markDeptRead]);

  // Socket.IO realtime
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !id) return;

    // Join department room (idempotent — MessengerDockProvider cũng giữ join cho bong bóng)
    socket.emit('join:dept', id);

    const msgHandler = (data) => {
      if (data.department_id === id) {
        // Avoid duplicate if sender is current user (already added optimistically)
        setMessages(prev => {
          if (data.message?.sender_id === user?.userId && prev.some(m => m.id === data.message.id)) return prev;
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
      }
    };
    const reactionHandler = (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.message_id ? { ...m, reactions: data.reactions } : m
      ));
    };

    socket.on('department_message', msgHandler);
    socket.on('department_reaction', reactionHandler);
    return () => {
      // KHÔNG emit 'leave:dept' khi unmount: MessengerDockProvider đang quản lý
      // việc join room cho phòng ban của user, nếu rời sẽ mất bong bóng tin nhắn.
      socket.off('department_message', msgHandler);
      socket.off('department_reaction', reactionHandler);
    };
  }, [id, user?.userId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      if (editMsg) {
        await api.put(`/departments/${id}/messages/${editMsg.id}`, { content });
        setMessages(prev => prev.map(m => m.id === editMsg.id ? { ...m, content, is_edited: true } : m));
        setEditMsg(null);
      } else {
        const { data } = await api.post(`/departments/${id}/messages`, {
          content, reply_to_id: replyTo?.id || null,
        });
        setMessages(prev => [...prev, data.message]);
        setReplyTo(null);
      }
      setText('');
      inputRef.current?.focus();
    } catch {}
    setSending(false);
  };

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('content', text.trim() || '');
        const { data } = await api.post(`/departments/${id}/chat/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setMessages(prev => [...prev, data.message]);
      }
      setText('');
      setReplyTo(null);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.error || 'Upload thất bại');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadAvailableUsers = async (search = '') => {
    try {
      const { data } = await api.get(`/departments/${id}/chat/available-users`, { params: { search } });
      setAvailableUsers(data.users || []);
    } catch {}
  };

  const addParticipant = async (userId) => {
    try {
      const { data } = await api.post(`/departments/${id}/chat/participants`, { user_id: userId });
      setMembers(prev => [...prev, data.member]);
      setShowAddMember(false);
      setUserSearch('');
      loadAvailableUsers('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Không thêm được thành viên');
    }
  };

  const removeParticipant = async (userId) => {
    if (!confirm('Xóa thành viên khỏi nhóm chat?')) return;
    try {
      await api.delete(`/departments/${id}/chat/participants/${userId}`);
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch (e) {
      alert(e?.response?.data?.error || 'Không xóa được thành viên');
    }
  };

  const deleteMessage = async (msgId) => {
    if (!confirm('Xóa tin nhắn?')) return;
    await api.delete(`/departments/${id}/messages/${msgId}`);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setMenuMsg(null);
  };

  const pinMessage = async (msg) => {
    const { data } = await api.put(`/departments/${id}/messages/${msg.id}/pin`, { is_pinned: !msg.is_pinned });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: !m.is_pinned } : m));
    setMenuMsg(null);
  };

  const startEdit = (msg) => {
    setEditMsg(msg);
    setText(msg.content);
    setMenuMsg(null);
    inputRef.current?.focus();
  };

  const startReply = (msg) => {
    setReplyTo(msg);
    setMenuMsg(null);
    inputRef.current?.focus();
  };

  const cancelEdit = () => { setEditMsg(null); setText(''); };
  const cancelReply = () => setReplyTo(null);

  // Emoji reactions
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏'];

  const toggleReaction = async (msgId, emoji) => {
    try {
      const { data } = await api.post(`/departments/${id}/messages/${msgId}/react`, { emoji });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m));
    } catch {}
    setEmojiPickerMsg(null);
  };

  // Group reactions by emoji for display
  const groupReactions = (reactions) => {
    if (!reactions?.length) return [];
    const map = {};
    reactions.forEach(r => {
      if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, count: 0, users: [], myReaction: false };
      map[r.emoji].count++;
      map[r.emoji].users.push(r.user?.full_name || '');
      if (r.user_id === user?.userId) map[r.emoji].myReaction = true;
    });
    return Object.values(map);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') { cancelEdit(); cancelReply(); }
  };

  // Group messages by date
  const groupByDate = (msgs) => {
    const groups = {};
    msgs.forEach(m => {
      const d = new Date(m.created_at).toLocaleDateString('vi-VN');
      if (!groups[d]) groups[d] = [];
      groups[d].push(m);
    });
    return groups;
  };

  const pinnedMessages = messages.filter(m => m.is_pinned);
  const isAdmin = ['admin', 'manager'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
      </div>
    );
  }

  const dateGroups = groupByDate(messages);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/departments')} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: (dept?.color || '#6366F1') + '20' }}>
          <Building className="h-5 w-5" style={{ color: dept?.color || '#6366F1' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900">{dept?.name || 'Phòng ban'}</h2>
          <p className="text-xs text-gray-500">{members.length} thành viên</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowAddMember(true); loadAvailableUsers(''); }}
            className="h-8 px-3 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
            <UserPlus className="h-3.5 w-3.5" /> Thêm người
          </button>
        )}
        <button onClick={() => setShowMembers(!showMembers)}
          className={`h-8 px-3 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 ${showMembers ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Users className="h-3.5 w-3.5" /> {members.length}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 flex flex-col">
          {/* Pinned messages */}
          {pinnedMessages.length > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                <Pin className="h-3 w-3" />
                <span className="font-medium">{pinnedMessages.length} tin ghim</span>
                <span className="truncate ml-2 text-amber-600">
                  {pinnedMessages[pinnedMessages.length - 1]?.content?.slice(0, 60)}
                </span>
              </div>
            </div>
          )}

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <MessageBubble className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có tin nhắn. Bắt đầu trao đổi!</p>
                </div>
              </div>
            ) : (
              Object.entries(dateGroups).map(([date, msgs]) => (
                <div key={date}>
                  <div className="flex items-center justify-center my-3">
                    <span className="bg-gray-100 text-gray-500 text-[10px] px-3 py-1 rounded-full">{date}</span>
                  </div>
                  {msgs.map((msg, i) => {
                    const isMe = msg.sender_id === user?.userId;
                    const showAvatar = i === 0 || msgs[i - 1]?.sender_id !== msg.sender_id;
                    return (
                      <div key={msg.id}
                        className={`flex gap-2 group relative ${isMe ? 'flex-row-reverse' : ''} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}
                        onMouseLeave={() => setMenuMsg(null)}>
                        {/* Avatar */}
                        <div className="w-8 shrink-0">
                          {showAvatar && (
                            <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ backgroundColor: avatarColor(msg.sender?.full_name || '') }}>
                              {getInitials(msg.sender?.full_name || '')}
                            </div>
                          )}
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                          {showAvatar && (
                            <p className={`text-[10px] font-medium mb-0.5 ${isMe ? 'text-right text-blue-600' : 'text-gray-500'}`}>
                              {msg.sender?.full_name}
                            </p>
                          )}

                          {/* Reply preview */}
                          {msg.reply_to && (
                            <div className={`text-[10px] px-2 py-1 mb-0.5 rounded border-l-2 ${isMe ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-300'}`}>
                              <span className="font-medium">{msg.reply_to.sender?.full_name}:</span>{' '}
                              <span className="text-gray-500">{msg.reply_to.content?.slice(0, 50)}</span>
                            </div>
                          )}

                          <div className={`relative rounded-2xl px-3.5 py-2 text-sm ${
                            isMe ? 'bg-blue-600 text-white rounded-tr-md' : 'bg-gray-100 text-gray-900 rounded-tl-md'
                          } ${msg.is_pinned ? 'ring-1 ring-amber-400' : ''}`}>
                            {msg.is_pinned && <Pin className="absolute -top-1 -right-1 h-3 w-3 text-amber-500" />}
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                            {/* Attachments */}
                            {msg.attachments?.length > 0 && (
                              <div className="mt-1.5 space-y-2">
                                {msg.attachments.map((a, ai) => {
                                  const isImage = a.type?.startsWith('image');
                                  const isVideo = a.type?.startsWith('video');
                                  const isAudio = a.type?.startsWith('audio');
                                  if (isImage) {
                                    return (
                                      <img key={ai} src={a.url} alt={a.name || 'image'}
                                        onClick={() => setMediaPreview({ type: 'image', url: a.url, name: a.name })}
                                        className="max-w-[240px] rounded-xl cursor-pointer hover:opacity-90 border border-black/5" />
                                    );
                                  }
                                  if (isVideo) {
                                    return (
                                      <div key={ai} className="space-y-1">
                                        <video src={a.url} controls className="max-w-[240px] rounded-xl" preload="metadata" />
                                        <button type="button" onClick={() => setMediaPreview({ type: 'video', url: a.url, name: a.name })}
                                          className={`text-[11px] ${isMe ? 'text-blue-200 hover:text-white' : 'text-blue-600 hover:text-blue-700'}`}>
                                          Mở trình chiếu
                                        </button>
                                      </div>
                                    );
                                  }
                                  if (isAudio) {
                                    return <audio key={ai} src={a.url} controls className="max-w-[240px] h-9" />;
                                  }
                                  return (
                                    <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer"
                                      className={`flex items-center gap-1.5 text-xs ${isMe ? 'text-blue-200 hover:text-white' : 'text-blue-600 hover:text-blue-700'}`}>
                                      <File className="h-3 w-3" />
                                      {a.name || 'File'}
                                    </a>
                                  );
                                })}
                              </div>
                            )}

                            <div className={`flex items-center gap-1 mt-0.5 text-[9px] ${isMe ? 'text-blue-200 justify-end' : 'text-gray-400'}`}>
                              <span>{new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                              {msg.is_edited && <span>(đã sửa)</span>}
                            </div>
                          </div>

                          {/* Reactions display */}
                          {msg.reactions?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {groupReactions(msg.reactions).map(r => (
                                <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)}
                                  title={r.users.join(', ')}
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border cursor-pointer transition-colors ${
                                    r.myReaction ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}>
                                  <span>{r.emoji}</span>
                                  <span className="text-[10px] font-medium">{r.count}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Context menu trigger + emoji button */}
                          <div className={`absolute top-0 ${isMe ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5`}>
                            <button onClick={() => setEmojiPickerMsg(emojiPickerMsg === msg.id ? null : msg.id)}
                              className="w-6 h-6 rounded hover:bg-gray-200 flex items-center justify-center cursor-pointer"
                              title="Thêm cảm xúc">
                              <Smile className="h-3 w-3 text-gray-400" />
                            </button>
                            <button onClick={() => setMenuMsg(menuMsg === msg.id ? null : msg.id)}
                              className="w-6 h-6 rounded hover:bg-gray-200 flex items-center justify-center cursor-pointer">
                              <MoreVertical className="h-3 w-3 text-gray-400" />
                            </button>
                            {/* Emoji picker popup */}
                            {emojiPickerMsg === msg.id && (
                              <div className="absolute z-50 bg-white rounded-xl shadow-lg border p-1.5 flex items-center gap-0.5"
                                style={{ [isMe ? 'left' : 'right']: 0, bottom: '100%', marginBottom: '4px' }}>
                                {QUICK_EMOJIS.map(emoji => (
                                  <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                                    className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-lg cursor-pointer transition-transform hover:scale-125">
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                            {menuMsg === msg.id && (
                              <div className="absolute z-50 bg-white rounded-lg shadow-lg border py-1 min-w-[120px]"
                                style={{ [isMe ? 'left' : 'right']: 0, top: '100%' }}>
                                <button onClick={() => startReply(msg)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                                  <Reply className="h-3 w-3" /> Trả lời
                                </button>
                                {isMe && (
                                  <button onClick={() => startEdit(msg)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                                    <Edit className="h-3 w-3" /> Sửa
                                  </button>
                                )}
                                {isAdmin && (
                                  <button onClick={() => pinMessage(msg)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2 cursor-pointer">
                                    <Pin className="h-3 w-3" /> {msg.is_pinned ? 'Bỏ ghim' : 'Ghim'}
                                  </button>
                                )}
                                {(isMe || isAdmin) && (
                                  <button onClick={() => deleteMessage(msg.id)} className="w-full px-3 py-1.5 text-xs text-left hover:bg-red-50 text-red-600 flex items-center gap-2 cursor-pointer">
                                    <Trash2 className="h-3 w-3" /> Xóa
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply/Edit indicator */}
          {(replyTo || editMsg) && (
            <div className="bg-gray-50 border-t px-4 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                {replyTo && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Reply className="h-3 w-3 text-blue-500" />
                    <span className="font-medium text-blue-600">Trả lời {replyTo.sender?.full_name}:</span>
                    <span className="text-gray-500 truncate">{replyTo.content?.slice(0, 50)}</span>
                  </div>
                )}
                {editMsg && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Edit className="h-3 w-3 text-amber-500" />
                    <span className="font-medium text-amber-600">Đang sửa tin nhắn</span>
                  </div>
                )}
              </div>
              <button onClick={() => { cancelEdit(); cancelReply(); }} className="w-6 h-6 rounded hover:bg-gray-200 flex items-center justify-center cursor-pointer">
                <X className="h-3 w-3 text-gray-500" />
              </button>
            </div>
          )}

          {/* Input */}
          <div className="bg-white border-t px-4 py-3">
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
                onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-200 cursor-pointer disabled:opacity-50 shrink-0"
                title="Tải ảnh/video/file">
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="flex-1 relative">
                <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={uploading ? 'Đang tải file...' : 'Nhập tin nhắn...'} rows={1}
                  className="w-full px-4 py-2.5 bg-gray-100 rounded-2xl text-sm resize-none outline-none focus:bg-gray-50 focus:ring-2 focus:ring-blue-500 max-h-32"
                  style={{ minHeight: '40px' }} />
              </div>
              <button onClick={sendMessage} disabled={!text.trim() || sending || uploading}
                className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 cursor-pointer disabled:opacity-50 shrink-0">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Members panel */}
        {showMembers && (
          <div className="w-64 border-l bg-gray-50 overflow-y-auto shrink-0">
            <div className="p-3 border-b bg-white">
              <h3 className="text-xs font-semibold text-gray-900">Thành viên ({members.length})</h3>
            </div>
            <div className="p-2 space-y-0.5">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white group">
                  <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: avatarColor(m.full_name) }}>
                    {getInitials(m.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{m.full_name}</p>
                    <p className="text-[10px] text-gray-400">{m.position || ROLE_LABELS[m.role] || m.role}</p>
                  </div>
                  {isAdmin && m.id !== user?.userId && (
                    <button onClick={() => removeParticipant(m.id)} className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-700 cursor-pointer">
                      Xóa
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddMember(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Thêm thành viên vào chat</h3>
                <p className="text-xs text-gray-500">Có thể thêm người ngoài phòng ban vào nhóm chat này</p>
              </div>
              <button onClick={() => setShowAddMember(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 border-b">
              <input
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); loadAvailableUsers(e.target.value); }}
                placeholder="Tìm tên nhân viên..."
                className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="p-3 overflow-y-auto max-h-[50vh] space-y-1">
              {availableUsers.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">Không có người phù hợp</div>
              ) : availableUsers.map(u => (
                <button key={u.id} onClick={() => addParticipant(u.id)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: avatarColor(u.full_name) }}>
                    {getInitials(u.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{u.position || ROLE_LABELS[u.role] || u.role}{u.department_id ? ' • Khác phòng ban' : ' • Chưa vào phòng ban'}</p>
                  </div>
                  <Plus className="h-4 w-4 text-emerald-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setMediaPreview(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer">
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-[92vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {mediaPreview.type === 'image' ? (
              <img src={mediaPreview.url} alt={mediaPreview.name || 'preview'} className="max-w-[92vw] max-h-[90vh] rounded-2xl shadow-2xl" />
            ) : (
              <video src={mediaPreview.url} controls autoPlay className="max-w-[92vw] max-h-[90vh] rounded-2xl shadow-2xl" />
            )}
            {mediaPreview.name && <p className="text-center text-white/80 text-sm mt-3">{mediaPreview.name}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple placeholder icon component
function MessageBubble({ className }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>;
}
