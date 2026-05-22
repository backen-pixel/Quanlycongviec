import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send, Paperclip, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { getInitials, avatarColor } from '../lib/utils';

const formatTime = (d) => {
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
};

/**
 * Bong bóng chat phòng ban thu gọn cho MessengerDock.
 * Tối giản: hiển thị danh sách tin gần đây + ô gửi (text + file).
 * Các thao tác nâng cao (ghim, sửa, xoá, reaction) mở trang đầy đủ.
 */
export default function DepartmentChatBubble({ deptId, socket, fillParent }) {
  const { user } = useAuth();
  const { registerDepartmentChatPresence } = useMessengerDock();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return registerDepartmentChatPresence(deptId);
  }, [deptId, registerDepartmentChatPresence]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/departments/${deptId}/messages`, { params: { limit: 30 } });
      const list = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(list);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 80);
    } catch {
      setMessages([]);
    }
  }, [deptId]);

  useEffect(() => {
    setMessages([]);
    void load();
  }, [deptId, load]);

  useEffect(() => {
    if (!socket || !deptId) return;
    socket.emit('join:dept', deptId);
    const onMsg = (payload) => {
      if (String(payload?.department_id) !== String(deptId)) return;
      const m = payload?.message;
      if (!m) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };
    socket.on('department_message', onMsg);
    return () => {
      // KHÔNG emit 'leave:dept' khi đóng bong bóng — MessengerDockProvider đang
      // giữ join cho phòng ban của user để có thể hiện bong bóng tin nhắn sau này.
      socket.off('department_message', onMsg);
    };
  }, [socket, deptId]);

  const sendText = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/departments/${deptId}/messages`, { content });
      if (data?.message) {
        setMessages((prev) => (prev.some((x) => x.id === data.message.id) ? prev : [...prev, data.message]));
      }
      setText('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Không gửi được tin nhắn');
    }
    setSending(false);
  };

  const uploadFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('content', text.trim() || '');
        const { data } = await api.post(`/departments/${deptId}/chat/upload`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (data?.message) {
          setMessages((prev) => (prev.some((x) => x.id === data.message.id) ? prev : [...prev, data.message]));
        }
      }
      setText('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Upload thất bại');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uid = user?.userId || user?.id;

  return (
    <div className={fillParent ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col h-[420px]'}>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 bg-slate-50">
        {messages.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">Chưa có tin nhắn</div>
        ) : (
          messages.map((m, i) => {
            const isMe = String(m.sender_id) === String(uid);
            const showAvatar = i === 0 || messages[i - 1]?.sender_id !== m.sender_id;
            const senderName = m.sender?.full_name || 'Thành viên';
            return (
              <div key={m.id} className={`flex gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                <div className="w-6 shrink-0">
                  {!isMe && showAvatar && (
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                      style={{ backgroundColor: avatarColor(senderName) }}
                    >
                      {getInitials(senderName)}
                    </div>
                  )}
                </div>
                <div className={`max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && showAvatar && (
                    <p className="text-[9px] font-medium mb-0.5 text-slate-500">{senderName}</p>
                  )}
                  <div
                    className={`relative rounded-2xl px-2.5 py-1.5 text-[12px] leading-snug shadow-sm ${
                      isMe
                        ? 'bg-gradient-to-br from-sky-500 to-cyan-600 text-white rounded-tr-md'
                        : 'bg-white text-slate-800 rounded-tl-md border border-slate-100'
                    }`}
                  >
                    {m.content ? (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    ) : null}
                    {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {m.attachments.map((a, ai) => {
                          const isImage = a.type?.startsWith('image');
                          if (isImage) {
                            return (
                              <a key={ai} href={a.url} target="_blank" rel="noopener noreferrer">
                                <img src={a.url} alt={a.name || ''} className="max-w-[180px] rounded-lg" />
                              </a>
                            );
                          }
                          return (
                            <a
                              key={ai}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-[11px] underline ${isMe ? 'text-sky-100' : 'text-sky-600'}`}
                            >
                              📎 {a.name || 'Tệp đính kèm'}
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <div className={`text-[9px] mt-0.5 ${isMe ? 'text-sky-100' : 'text-slate-400'} text-right`}>
                      {formatTime(m.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-2 py-2">
        <div className="flex items-end gap-1.5">
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
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 disabled:opacity-50"
            title="Đính kèm"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            placeholder={uploading ? 'Đang tải file…' : 'Nhập tin nhắn…'}
            rows={1}
            className="flex-1 min-h-[34px] max-h-24 px-3 py-1.5 bg-slate-100 rounded-xl text-[12px] resize-none outline-none focus:bg-white focus:ring-2 focus:ring-sky-400"
          />
          <button
            type="button"
            onClick={() => void sendText()}
            disabled={!text.trim() || sending || uploading}
            className="w-8 h-8 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white flex items-center justify-center shrink-0 disabled:opacity-40"
            title="Gửi (Enter)"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1 flex items-center justify-end">
          <Link
            to={`/departments/${deptId}/chat`}
            className="text-[10px] text-slate-400 hover:text-sky-600 inline-flex items-center gap-0.5"
          >
            <ExternalLink className="h-2.5 w-2.5" /> Mở chat đầy đủ
          </Link>
        </div>
      </div>
    </div>
  );
}
