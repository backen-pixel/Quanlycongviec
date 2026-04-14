import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Image, Paperclip, Send, RefreshCw } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

/**
 * Messenger thread for a CRM lead/deal (same UI as Lead detail).
 */
export default function FacebookChatTab({ leadId }) {
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [contact, setContact] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const loadMessages = useCallback(() => {
    if (!leadId) return;
    fetch(`${API}/api/facebook/leads/${leadId}/messages`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setMessages(d);
        if (d.length > 0 && d[0].contact) setContact(d[0].contact);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => {});
  }, [leadId]);

  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    return messages.filter((m) => {
      const key = m.fb_message_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const timer = setInterval(loadMessages, 15000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  const sendReply = async () => {
    if (!reply.trim() || !contact || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/reply`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: reply }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, { ...msg, contact }]);
        setReply('');
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !contact) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${API}/api/upload/single`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!upRes.ok) throw new Error('Upload failed');
      const upData = await upRes.json();

      let attType = type || 'file';
      if (file.type.startsWith('image/')) attType = 'image';
      else if (file.type.startsWith('video/')) attType = 'video';
      else if (file.type.startsWith('audio/')) attType = 'audio';

      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/reply`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({
          message: '',
          attachment_url: upData.file_url,
          attachment_type: attType,
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, { ...msg, contact }]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      alert('Lỗi gửi file: ' + e.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const syncHistory = async () => {
    if (!contact) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contact.id}/sync-history`, {
        method: 'POST',
        headers: hdr(),
      });
      const data = await res.json();
      if (data.synced > 0) loadMessages();
    } catch (e) {
      /* ignore */
    }
    setSyncing(false);
  };

  const formatTime = (d) =>
    new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  if (!messages.length && !contact) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p className="text-3xl mb-2">📘</p>
        <p className="text-sm">Chưa có tin nhắn Facebook nào liên kết với {leadId ? 'lead' : 'deal'} này.</p>
        <p className="text-xs mt-1">Khi KH nhắn tin qua Messenger, tin nhắn sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}>
      {contact && (
        <div className="flex items-center justify-between pb-3 border-b mb-3 shrink-0">
          <div className="flex items-center gap-2">
            {contact.fb_profile_pic ? (
              <img src={contact.fb_profile_pic} className="w-9 h-9 rounded-full shadow-sm" alt="" />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {(contact.fb_name || 'FB')[0]}
              </div>
            )}
            <div>
              <p className="font-semibold text-sm text-gray-800">{contact.fb_name}</p>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                {contact.phone && <span className="text-green-600">📞 {contact.phone}</span>}
                <span>Messenger</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={syncHistory}
              disabled={syncing}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync
            </button>
            <span className="text-[10px] text-gray-400">{uniqueMessages.length} tin nhắn</span>
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
                  {m.attachment_url && (m.message_type === 'image' || m.attachment_type === 'image') && (
                    <img
                      src={m.attachment_url}
                      className="max-w-[240px] rounded-xl mb-1 cursor-pointer hover:opacity-90"
                      alt=""
                      onClick={() => window.open(m.attachment_url, '_blank')}
                    />
                  )}
                  {m.attachment_url && (m.message_type === 'audio' || m.attachment_type === 'audio') && (
                    <audio
                      src={m.attachment_url}
                      controls
                      className="max-w-[240px] h-9 mb-1"
                      style={{ filter: isOut ? 'invert(1) hue-rotate(180deg)' : 'none' }}
                    />
                  )}
                  {m.attachment_url && (m.message_type === 'video' || m.attachment_type === 'video') && (
                    <video src={m.attachment_url} controls className="max-w-[240px] rounded-xl mb-1" preload="metadata" />
                  )}
                  {m.attachment_url && (m.message_type === 'file' || m.attachment_type === 'file') && (
                    <a
                      href={m.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg mb-1 ${
                        isOut ? 'bg-blue-400/30 hover:bg-blue-400/50' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      📎 Tệp đính kèm
                    </a>
                  )}
                  {m.content && !['[image]', '[audio]', '[video]', '[file]'].includes(m.content) && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <p className={`text-[9px] mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="pt-3 border-t mt-3 shrink-0">
        {uploading && (
          <div className="flex items-center gap-2 text-xs text-blue-600 mb-2">
            <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Đang tải lên...
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading || !contact}
            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg cursor-pointer transition disabled:opacity-40"
            title="Gửi hình ảnh"
          >
            <Image size={18} />
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !contact}
            className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg cursor-pointer transition disabled:opacity-40"
            title="Gửi file"
          >
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />

          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
            placeholder="Trả lời qua Messenger..."
            disabled={!contact}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 disabled:opacity-40"
          />

          <button
            type="button"
            onClick={sendReply}
            disabled={sending || !reply.trim() || !contact}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
