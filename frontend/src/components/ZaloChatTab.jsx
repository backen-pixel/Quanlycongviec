import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Send, RefreshCw, ExternalLink, UserCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

function looksLikePlaceholderName(name, userId) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^Zalo\s/i.test(n)) return true;
  if (/^Zalo KH$/i.test(n)) return true;
  if (userId && n === String(userId)) return true;
  return false;
}

/**
 * Hộp thoại Zalo OA gắn lead/deal — tương tự FacebookChatTab.
 */
export default function ZaloChatTab({ leadId }) {
  const { socket } = useAuth();
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [contact, setContact] = useState(null);
  const [sending, setSending] = useState(false);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const messagesEndRef = useRef(null);
  const contactRef = useRef(null);
  contactRef.current = contact;

  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    return messages.filter((m) => {
      const key = m.zalo_msg_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);

  const syncProfile = useCallback(async (contactId) => {
    if (!contactId) return null;
    setSyncingProfile(true);
    try {
      const r = await fetch(`${API}/api/zalo/contacts/${contactId}/sync-profile`, {
        method: 'POST',
        headers: hdr(),
      });
      const d = await r.json();
      if (r.ok && d.contact) {
        setContact(d.contact);
        return d.contact;
      }
      return null;
    } catch {
      return null;
    } finally {
      setSyncingProfile(false);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`${API}/api/zalo/leads/${leadId}/messages`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!r.ok) {
        setLoadError('error');
        setMessages([]);
        setContact(null);
        return;
      }
      const list = await r.json();
      const arr = Array.isArray(list) ? list : [];
      setMessages(arr);
      const c0 = arr.find((m) => m.contact)?.contact || null;
      setContact(c0);
      if (c0?.id && looksLikePlaceholderName(c0.display_name, c0.user_id)) {
        await syncProfile(c0.id);
      }
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      setLoadError('error');
      setMessages([]);
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [leadId, syncProfile]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!socket) return;
    const h = (payload) => {
      const cid = contactRef.current?.id;
      if (!cid || String(payload.contact_id) !== String(cid) || !payload.message) return;
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message.id)
          ? prev
          : [...prev, { ...payload.message, contact: contactRef.current }],
      );
      if (payload.contact) setContact((c) => ({ ...c, ...payload.contact }));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };
    socket.on('zalo_message', h);
    return () => socket.off('zalo_message', h);
  }, [socket]);

  const sendReply = async () => {
    if (!reply.trim() || !contact?.id || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/zalo/contacts/${contact.id}/messages`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ text: reply.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || 'Gửi tin thất bại');
        return;
      }
      if (d.message) {
        setMessages((prev) => [...prev, { ...d.message, contact }]);
      }
      setReply('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      alert('Lỗi mạng');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (d) =>
    new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  if (loading) {
    return <div className="text-center text-gray-400 py-12 text-sm">Đang tải hội thoại Zalo OA…</div>;
  }

  if (!messages.length && !contact) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p className="text-3xl mb-2">💬</p>
        <p className="text-sm">Chưa có tin nhắn Zalo OA liên kết với lead/deal này.</p>
        <p className="text-xs mt-1">Khi khách nhắn OA (webhook hoạt động) và tạo/gán lead, tin sẽ hiện ở đây.</p>
        <Link to="/crm/zalo?tab=inbox" className="text-xs text-blue-600 hover:underline mt-3 inline-block">
          Mở Hộp thư Zalo →
        </Link>
        {loadError === 'error' && <p className="text-xs text-red-500 mt-2">Không tải được dữ liệu.</p>}
      </div>
    );
  }

  const inboxHref = contact?.id
    ? `/crm/zalo?tab=inbox&contact=${encodeURIComponent(contact.id)}`
    : '/crm/zalo?tab=inbox';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}>
      {contact && (
        <div className="flex items-center justify-between pb-3 border-b mb-3 shrink-0">
          <div className="flex items-center gap-2">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} className="w-9 h-9 rounded-full shadow-sm object-cover" alt="" />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-sky-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {(contact.display_name || 'Z')[0]}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm text-gray-800">
                {contact.display_name || contact.user_id || 'Khách Zalo'}
              </p>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {contact.phone && <span className="text-green-600">📞 {contact.phone}</span>}
                <span>Zalo OA</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={inboxHref}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1"
            >
              <ExternalLink size={12} /> Hộp thư
            </Link>
            <button
              type="button"
              onClick={() => syncProfile(contact.id)}
              disabled={syncingProfile}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50"
              title="Lấy tên & avatar từ Zalo OA"
            >
              <UserCircle size={12} className={syncingProfile ? 'animate-pulse' : ''} /> Tên KH
            </button>
            <button
              type="button"
              onClick={loadMessages}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Làm mới
            </button>
            <span className="text-[10px] text-gray-400">{uniqueMessages.length} tin</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {uniqueMessages.map((m, i) => {
          const isOut = m.direction === 'outbound';
          const showDate =
            i === 0 || new Date(m.created_at).toDateString() !== new Date(uniqueMessages[i - 1]?.created_at).toDateString();
          return (
            <div key={m.id || i}>
              {showDate && (
                <div className="flex justify-center my-2">
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                    {new Date(m.created_at).toLocaleDateString('vi-VN', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
              )}
              <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                    isOut
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  {m.attachment_url && m.message_type === 'image' && (
                    <img
                      src={m.attachment_url}
                      className="max-w-[240px] rounded-xl mb-1 cursor-pointer"
                      alt=""
                      onClick={() => window.open(m.attachment_url, '_blank')}
                    />
                  )}
                  {m.content && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <p className={`text-[9px] mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="pt-3 border-t mt-3 shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
            placeholder="Nhập tin trả lời (tin tư vấn — trong 7 ngày sau tin khách)..."
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Send size={16} /> Gửi
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">Tin tư vấn Zalo OA — khách phải nhắn trước trong vòng 7 ngày.</p>
      </div>
    </div>
  );
}
