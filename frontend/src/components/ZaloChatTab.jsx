import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import StartPersonalChat from './StartPersonalChat';
import { StoredImage, downloadStored } from './ZaloAttachment';
import { Send, RefreshCw, ExternalLink, UserCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import UploadFileLightbox, { collectMessageImageGallery, findUploadLightboxIndex } from './UploadFileLightbox';

const API = import.meta.env.VITE_API_URL || '';

/** Nhãn và biểu tượng cho tin không phải chữ — dùng khi không vẽ được nội dung. */
const ATTACH_LABEL = {
  image: 'Hình ảnh', video: 'Video', audio: 'Tin thoại', file: 'Tệp đính kèm',
  sticker: 'Nhãn dán', gif: 'Ảnh động', location: 'Vị trí', link: 'Liên kết',
  contact: 'Danh thiếp', unknown: 'Tin nhắn',
};
const ATTACH_ICON = {
  video: '🎬', audio: '🎧', file: '📄', location: '📍', link: '🔗', contact: '👤', gif: '🎞',
};

/** Ưu tiên bản sao trong kho công ty; chưa chép xong thì tạm dùng link Zalo. */
const bestUrl = (m) => m.stored_url || m.attachment_url || null;

const humanSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
};
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
 * Hộp thoại Zalo gắn lead/deal — tương tự FacebookChatTab.
 *
 * Dùng cho CẢ HAI kênh, phân biệt bằng prop `kind`:
 *   'oa'       — Official Account, gửi qua CS API, có luật cửa sổ 7 ngày
 *   'personal' — tài khoản cá nhân qua cổng ở máy công ty, không có luật đó
 *
 * Nhiều nhãn và ghi chú khác nhau giữa hai kênh — đừng hardcode chữ "Zalo OA".
 */
/**
 * @param {'oa'|'personal'} kind Kênh Zalo. 'oa' = Official Account,
 *   'personal' = tài khoản Zalo cá nhân chạy qua cổng ở máy công ty.
 *   Hai kênh là hai hội thoại riêng, không trộn tin của nhau.
 */
export default function ZaloChatTab({ leadId, kind = 'oa', leadPhone = null }) {
  const { socket } = useAuth();
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [contact, setContact] = useState(null);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(null);
  const [bridgeNote, setBridgeNote] = useState(null);
  const [account, setAccount] = useState(null);

  // Khai báo TRƯỚC mọi early return — dùng ở cả nhánh đang tải lẫn nhánh chính
  const isPersonal = kind === 'personal';
  const channelLabel = isPersonal ? 'Zalo cá nhân' : 'Zalo OA';
  // retrySend khai báo trước loadMessages nên phải đi qua ref
  const loadMessagesRef = useRef(null);
  const loadedOnceRef = useRef(false);
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [imageLightboxIndex, setImageLightboxIndex] = useState(null);
  const messagesContainerRef = useRef(null);
  const contactRef = useRef(null);
  contactRef.current = contact;

  /** Chỉ cuộn trong khung chat — không dùng scrollIntoView (kéo cả trang LeadDetail). */
  const scrollChatToBottom = useCallback((smooth = true) => {
    const box = messagesContainerRef.current;
    if (!box) return;
    const top = box.scrollHeight;
    if (typeof box.scrollTo === 'function') {
      box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    } else {
      box.scrollTop = top;
    }
  }, []);

  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    return messages.filter((m) => {
      const key = m.zalo_msg_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);

  const chatImageGallery = useMemo(() => collectMessageImageGallery(uniqueMessages), [uniqueMessages]);

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

  /** Đưa một tin gửi hỏng trở lại hàng đợi. */
  const retrySend = useCallback(async (messageId) => {
    setRetrying(messageId);
    try {
      const r = await fetch(`${API}/api/zalo/personal/messages/${messageId}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      const d = await r.json();
      if (!r.ok) alert(d?.error || 'Không xếp lại được tin này');
      else loadMessagesRef.current?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setRetrying(null);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!leadId) return;
    // Chỉ hiện spinner toàn khung ở lần tải đầu. Những lần làm mới sau (socket,
    // gửi lại, vừa gắn lead) mà cũng nháy spinner thì khung chat giật liên tục.
    if (!loadedOnceRef.current) setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`${API}/api/zalo/leads/${leadId}/messages?kind=${kind}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!r.ok) {
        setLoadError('error');
        setMessages([]);
        setContact(null);
        setAccount(null);
        return;
      }
      const body = await r.json();
      // Backend mới trả { contact, messages }; giữ nhánh mảng cho bản cũ.
      const arr = Array.isArray(body) ? body : (body?.messages || []);
      setMessages(arr);
      const c0 = (Array.isArray(body) ? null : body?.contact)
        || arr.find((m) => m.contact)?.contact
        || null;
      setContact(c0);
      setAccount(Array.isArray(body) ? null : (body?.account || null));
      // Đồng bộ hồ sơ chạy bằng token Zalo OA nên KHÔNG áp dụng cho tài khoản
      // cá nhân — gọi vào chỉ nhận lỗi "OA chưa cấu hình token".
      if (kind !== 'personal' && c0?.id && looksLikePlaceholderName(c0.display_name, c0.user_id)) {
        await syncProfile(c0.id);
      }
      setTimeout(() => scrollChatToBottom(false), 100);
    } catch {
      setLoadError('error');
      setMessages([]);
      setContact(null);
    } finally {
      loadedOnceRef.current = true;
      setLoading(false);
    }
  }, [leadId, kind, syncProfile, scrollChatToBottom]);

  loadMessagesRef.current = loadMessages;

  useEffect(() => {
    loadedOnceRef.current = false;
  }, [leadId, kind]);

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
      setTimeout(() => scrollChatToBottom(true), 100);
    };
    socket.on('zalo_message', h);
    return () => socket.off('zalo_message', h);
  }, [socket, scrollChatToBottom]);

  /** Cổng báo đã gửi xong hay gửi hỏng — đổi trạng thái ngay, khỏi tải lại. */
  useEffect(() => {
    if (!socket) return undefined;
    const h = (payload) => {
      if (!payload?.message_id) return;
      setMessages((prev) => prev.map((m) => (
        m.id === payload.message_id
          ? { ...m, delivery: { ...(m.delivery || {}), status: payload.ok ? 'sent' : 'failed', error: payload.error || null } }
          : m
      )));
      if (payload.ok) setBridgeNote(null);
    };
    socket.on('zalo_outbox_ack', h);
    return () => socket.off('zalo_outbox_ack', h);
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
        // Tin cá nhân đi qua hàng đợi nên gắn sẵn trạng thái chờ, để nhân viên
        // không tưởng nhầm là đã gửi xong.
        const delivery = d.pending ? { status: 'pending', outbox_id: d.outbox_id } : null;
        setMessages((prev) => [...prev, { ...d.message, contact, delivery }]);
      }
      if (d.bridge_down) {
        setBridgeNote(d.bridge_note || 'Máy công ty đang không chạy — tin sẽ gửi khi máy hoạt động lại.');
      } else {
        setBridgeNote(null);
      }
      setReply('');
      setTimeout(() => scrollChatToBottom(true), 100);
    } catch {
      alert('Lỗi mạng');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (d) =>
    new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  if (loading) {
    return <div className="text-center text-gray-400 py-12 text-sm">Đang tải hội thoại {channelLabel}…</div>;
  }

  if (!messages.length && !contact) {
    // Kênh cá nhân: nhân viên đã có số khách, cần tìm tài khoản Zalo của số đó
    // rồi nhắn trước — nên chỗ này là nút hành động, không phải lời nhắn suông.
    if (kind === 'personal') {
      return (
        <StartPersonalChat
          leadId={leadId}
          phone={leadPhone}
          onLinked={loadMessages}
        />
      );
    }
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

  /** Bên mình là ai: ưu tiên tên nhân viên sở hữu số, rồi tới tên tài khoản. */
  const ourLabel = (() => {
    const name = account?.owner_name || account?.oa_name || '';
    const phone = account?.account_phone || '';
    const digits = (v) => String(v).replace(/\D/g, '');
    if (!name || digits(name) === digits(phone)) return null;
    return name;
  })();

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
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
                {contact.phone && <span className="text-green-600 font-medium">{contact.phone}</span>}
                {/* Hai chiều: số khách ↔ số Zalo của mình. Không hiện thì nhân viên
                    không biết tin đi từ số nào, nhất là khi công ty có nhiều số. */}
                {isPersonal && account?.account_phone ? (
                  <>
                    <span className="text-gray-300">⇄</span>
                    <span className="text-blue-600 font-medium">{account.account_phone}</span>
                    {/* Tên tài khoản hay bị đặt trùng chính số — chỉ hiện khi khác */}
                    {ourLabel && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>{ourLabel}</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {contact.phone && <span className="text-gray-300">·</span>}
                    <span>{channelLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Trang Hộp thư là giao diện của Zalo OA. Kênh cá nhân chưa có trang
                tương đương nên ẩn đi, thay vì đẩy nhân viên sang chỗ không đúng. */}
            {!isPersonal && (
              <Link
                to={inboxHref}
                className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1"
              >
                <ExternalLink size={12} /> Hộp thư
              </Link>
            )}
            {kind !== 'personal' && (
            <button
              type="button"
              onClick={() => syncProfile(contact.id)}
              disabled={syncingProfile}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50"
              title="Lấy tên & avatar từ Zalo OA"
            >
              <UserCircle size={12} className={syncingProfile ? 'animate-pulse' : ''} /> Tên KH
            </button>
            )}
            <button
              type="button"
              onClick={loadMessages}
              title={isPersonal
                ? 'Tin mới tự hiện qua kết nối trực tiếp — nút này để tải lại nếu nghi ngờ sót'
                : 'Tải lại hội thoại'}
              className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1"
            >
              <RefreshCw size={12} /> Làm mới
            </button>
            <span className="text-[10px] text-gray-400">{uniqueMessages.length} tin</span>
          </div>
        </div>
      )}

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
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
                  {m.message_type === 'image' && (m.stored_url || m.attachment_url) ? (
                    m.stored_url ? (
                      <StoredImage
                        storedPath={m.stored_url}
                        fallbackUrl={m.attachment_url}
                        className="max-w-[240px] rounded-xl mb-1"
                        alt="Ảnh khách gửi"
                      />
                    ) : (
                      <button
                        type="button"
                        className="block max-w-[240px] rounded-xl mb-1 overflow-hidden cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                        onClick={() => {
                          const idx = findUploadLightboxIndex(chatImageGallery, m.attachment_url);
                          if (idx >= 0) setImageLightboxIndex(idx);
                        }}
                        title="Xem ảnh lớn"
                      >
                        <img
                          src={m.attachment_url}
                          className="max-w-[240px] rounded-xl hover:brightness-95 transition-[filter]"
                          alt=""
                        />
                      </button>
                    )
                  ) : null}

                  {/* Nhãn dán: Zalo trả URL ảnh thật, vẽ thẳng thay vì hiện chữ */}
                  {m.attachment_url && m.message_type === 'sticker' ? (
                    <img
                      src={m.attachment_url}
                      className="w-[110px] h-[110px] object-contain mb-1"
                      alt="Nhãn dán"
                      loading="lazy"
                    />
                  ) : null}

                  {/* Loại còn lại có đính kèm (tệp, thoại, video, vị trí…): một
                      dòng bấm mở được, thay vì bong bóng trống trơn */}
                  {(m.stored_url || m.attachment_url) && !['image', 'sticker'].includes(m.message_type) ? (
                    <a
                      href={m.stored_url ? '#' : m.attachment_url}
                      target={m.stored_url ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      onClick={m.stored_url ? (e) => {
                        e.preventDefault();
                        downloadStored(m.stored_url, m.attachment_name)
                          .catch(() => window.open(m.attachment_url, '_blank'));
                      } : undefined}
                      className={`flex items-start gap-2 mb-1 rounded-lg px-2 py-1.5 border ${
                        isOut
                          ? 'border-blue-300/40 bg-blue-500/20 hover:bg-blue-500/30'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-base leading-none mt-0.5">{ATTACH_ICON[m.message_type] || '📎'}</span>
                      <span className="min-w-0">
                        <span className={`block text-[12.5px] font-medium truncate ${isOut ? 'text-white' : 'text-gray-800'}`}>
                          {m.attachment_name || ATTACH_LABEL[m.message_type] || 'Tệp đính kèm'}
                        </span>
                        <span className={`block text-[11px] ${isOut ? 'text-blue-100' : 'text-gray-500'}`}>
                          {[
                            humanSize(m.attachment_size),
                            m.attachment_status === 'too_large' ? 'quá 10 MB, mở từ Zalo' : null,
                            m.stored_url ? 'đã lưu — bấm để tải' : null,
                          ].filter(Boolean).join(' · ') || 'Bấm để mở'}
                        </span>
                      </span>
                    </a>
                  ) : null}

                  {/* Không có đính kèm mà cũng không phải chữ → vẫn phải nói rõ
                      đã nhận cái gì, không để trống */}
                  {!m.stored_url && !m.attachment_url && m.message_type !== 'text' && !m.content ? (
                    <p className={`text-[12px] italic ${isOut ? 'text-blue-100' : 'text-gray-500'}`}>
                      [{ATTACH_LABEL[m.message_type] || 'Tin nhắn'}]
                      {m.attachment_name ? ` ${m.attachment_name}` : ''}
                      {humanSize(m.attachment_size) ? ` · ${humanSize(m.attachment_size)}` : ''}
                    </p>
                  ) : null}

                  {m.content && m.content !== m.attachment_name && (m.message_type !== 'sticker' || !m.attachment_url) && (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <p className={`text-[9px] mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatTime(m.created_at)}
                    {isOut && m.delivery?.status === 'pending' && ' · đang chờ gửi'}
                    {isOut && m.delivery?.status === 'sending' && ' · đang gửi…'}
                  </p>
                </div>
              </div>
              {isOut && m.delivery?.status === 'failed' && (
                <div className="flex justify-end mt-1">
                  <div className="flex items-center gap-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
                    <span>Gửi không được{m.delivery.error ? ` — ${m.delivery.error}` : ''}</span>
                    <button
                      type="button"
                      onClick={() => retrySend(m.id)}
                      disabled={retrying === m.id}
                      className="font-semibold underline disabled:opacity-50"
                    >
                      {retrying === m.id ? 'Đang xếp lại…' : 'Gửi lại'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-3 border-t mt-3 shrink-0">
        {bridgeNote && (
          <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
            {bridgeNote} Tin đã lưu vào hàng đợi và sẽ tự gửi khi kết nối trở lại.
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
            placeholder={isPersonal
              ? `Nhắn cho ${contact?.display_name || 'khách'} qua Zalo cá nhân…`
              : 'Nhập tin trả lời (tin tư vấn — trong 7 ngày sau tin khách)...'}
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
        <p className="text-[10px] text-gray-400 mt-1.5">
          {isPersonal
            // Luật cửa sổ 7 ngày là của Zalo OA, KHÔNG áp dụng cho tài khoản cá nhân.
            ? `Nhắn từ số Zalo ${account?.account_phone || 'cá nhân'}${ourLabel ? ` — ${ourLabel}` : ''}. Khách thấy đúng tài khoản này.`
            : 'Tin tư vấn Zalo OA — khách phải nhắn trước trong vòng 7 ngày.'}
        </p>
      </div>

      {imageLightboxIndex != null && chatImageGallery.length > 0 && (
        <UploadFileLightbox
          items={chatImageGallery}
          index={imageLightboxIndex}
          onIndexChange={setImageLightboxIndex}
          onClose={() => setImageLightboxIndex(null)}
        />
      )}
    </div>
  );
}
