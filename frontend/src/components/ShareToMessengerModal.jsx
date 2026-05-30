import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Send, X, Users, MessageSquare, Loader2, Check, Link2, Copy } from 'lucide-react';
import api from '../lib/api';
import { getInitials } from '../lib/utils';
import { useMessengerDock } from '../context/MessengerDockContext';

/**
 * Modal chia sẻ bài viết nội bộ qua Messenger.
 * Cho phép tìm thành viên hoặc chọn nhóm chat, rồi gửi tin nhắn kèm link bài viết.
 *
 * Props:
 *   - post: bài viết cần chia sẻ ({ id, body, author, ... })
 *   - onClose(): đóng modal
 *   - onSent(target): callback sau khi gửi thành công
 *
 * Hành vi:
 *   - Tìm staff qua /internal-social/users/search
 *   - List nhóm từ /messenger/groups (cache lần đầu)
 *   - Gửi nhiều người cùng lúc: với từng người user → tạo direct group rồi POST chat;
 *     với nhóm → POST chat trực tiếp.
 */
export default function ShareToMessengerModal({ post, onClose, onSent }) {
  const { openMessengerGroupChat } = useMessengerDock();

  const [q, setQ] = useState('');
  const [staffHits, setStaffHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [selected, setSelected] = useState({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingGroups(true);
    api
      .get('/messenger/groups')
      .then(({ data }) => {
        if (cancelled) return;
        setGroups(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const term = q.trim();
    if (term.length < 2) {
      setStaffHits([]);
      setSearching(false);
      return undefined;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/internal-social/users/search', { params: { q: term } });
        setStaffHits(Array.isArray(data?.users) ? data.users : []);
      } catch {
        setStaffHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [q]);

  const postUrl = useMemo(
    () => `${window.location.origin}/social?post=${post?.id || ''}`,
    [post?.id],
  );

  const postSnippet = useMemo(() => String(post?.body || '').trim(), [post?.body]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(postUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = postUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt('Sao chép liên kết:', postUrl);
    }
  };

  const composeMessage = (extra) => {
    const lines = [];
    if (extra?.trim()) lines.push(extra.trim());
    if (postSnippet) lines.push(`💬 "${postSnippet.slice(0, 200)}${postSnippet.length > 200 ? '…' : ''}"`);
    const authorName = post?.author?.full_name || post?.author?.email || '';
    lines.push(`🔗 ${authorName ? `Bài viết của ${authorName}: ` : 'Xem bài viết: '}${postUrl}`);
    return lines.join('\n\n');
  };

  const toggleTarget = (key, value) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const handleSend = async () => {
    if (!selectedList.length || sending) return;
    setSending(true);
    const content = composeMessage(note);
    const failures = [];
    let lastOpenedGroup = null;

    for (const target of selectedList) {
      try {
        let gid = null;
        if (target.type === 'user') {
          const { data } = await api.post('/messenger/direct', { peer_user_id: target.id });
          gid = data?.id || null;
          if (gid) {
            lastOpenedGroup = {
              id: gid,
              name: data?.name || data?.display_name || target.name,
              is_direct: true,
              peer_id: target.id,
              peer_avatar: target.avatar || null,
            };
          }
        } else if (target.type === 'group') {
          gid = target.id;
          lastOpenedGroup = {
            id: gid,
            name: target.name,
            is_direct: !!target.is_direct,
            peer_id: target.peer_id || null,
            peer_avatar: target.peer_avatar || null,
          };
        }
        if (gid) {
          await api.post(`/messenger/groups/${gid}/chat`, { content });
        } else {
          failures.push(target.name);
        }
      } catch {
        failures.push(target.name);
      }
    }
    setSending(false);
    if (failures.length === selectedList.length) {
      alert('Không gửi được. Vui lòng thử lại.');
      return;
    }
    if (failures.length > 0) {
      alert(`Một số người không gửi được: ${failures.join(', ')}`);
    }
    if (lastOpenedGroup && selectedList.length === 1) {
      openMessengerGroupChat(lastOpenedGroup);
    }
    onSent?.({ count: selectedList.length - failures.length });
    onClose?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[min(85vh,720px)]"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-fuchsia-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow">
              <Send className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Chia sẻ qua tin nhắn</h2>
              <p className="text-[11px] text-slate-500">Chọn người nhận để gửi bài viết</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* COPY LINK — luôn hiển thị ngay dưới header */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0 bg-slate-50/60">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
            <Link2 className="h-3 w-3" /> Liên kết bài viết
          </label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Link2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                readOnly
                value={postUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-transparent text-sm text-slate-700 outline-none truncate"
              />
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors shrink-0 ${
                copied
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="Sao chép liên kết"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Đã chép
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Chép
                </>
              )}
            </button>
          </div>
        </div>

        {/* SEARCH + ghi chú */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm thành viên (tên, email)…"
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/60"
            />
          </div>
          {selectedList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((t) => (
                <span
                  key={`${t.type}-${t.id}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium"
                >
                  {t.name}
                  <button
                    type="button"
                    onClick={() => toggleTarget(`${t.type}-${t.id}`, t)}
                    className="hover:text-indigo-900"
                    aria-label="Bỏ chọn"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* LIST */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Staff search results */}
          {q.trim().length >= 2 && (
            <section>
              <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Thành viên
              </h3>
              {searching && (
                <p className="px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
                </p>
              )}
              {!searching && staffHits.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-400 italic">Không tìm thấy.</p>
              )}
              <ul className="divide-y divide-slate-100">
                {staffHits.map((u) => {
                  const key = `user-${u.id}`;
                  const picked = !!selected[key];
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() =>
                          toggleTarget(key, {
                            type: 'user',
                            id: u.id,
                            name: u.full_name || u.email,
                            avatar: u.avatar || null,
                          })
                        }
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
                      >
                        <UserAvatar user={u} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{u.full_name || u.email}</p>
                          <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                        </div>
                        <CheckBubble checked={picked} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Groups */}
          <section>
            <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Nhóm chat
            </h3>
            {loadingGroups && (
              <p className="px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
              </p>
            )}
            {!loadingGroups && groups.length === 0 && (
              <p className="px-4 py-3 text-xs text-slate-400 italic">Chưa có nhóm chat.</p>
            )}
            <ul className="divide-y divide-slate-100">
              {groups.slice(0, 30).map((g) => {
                const key = `group-${g.id}`;
                const picked = !!selected[key];
                const display = g.name || g.display_name || (g.is_direct ? 'Chat trực tiếp' : 'Nhóm');
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() =>
                        toggleTarget(key, {
                          type: 'group',
                          id: g.id,
                          name: display,
                          is_direct: !!g.is_direct,
                          peer_id: g.peer_id || null,
                          peer_avatar: g.peer_avatar || null,
                        })
                      }
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                        {g.is_direct ? <UserAvatar user={{ avatar: g.peer_avatar, full_name: display }} /> : <Users className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{display}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {g.is_direct ? 'Chat trực tiếp' : `Nhóm · ${g.member_count || g.members_count || '?'} thành viên`}
                        </p>
                      </div>
                      <CheckBubble checked={picked} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* COMPOSER + SEND */}
        <div className="border-t border-slate-200 px-4 py-3 shrink-0 bg-slate-50 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Thêm ghi chú (không bắt buộc)…"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/60"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {selectedList.length > 0 ? `Sẽ gửi tới ${selectedList.length} người/nhóm` : 'Chưa chọn ai'}
            </p>
            <button
              type="button"
              disabled={!selectedList.length || sending}
              onClick={handleSend}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white font-semibold text-sm shadow hover:shadow-lg disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all"
              style={{ color: '#ffffff' }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Đang gửi…' : 'Gửi'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UserAvatar({ user }) {
  const name = user?.full_name || user?.email || '?';
  const pic = typeof user?.avatar === 'string' && user.avatar.trim();
  if (pic) {
    return <img src={pic} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover border border-slate-200" />;
  }
  return (
    <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-600 text-white text-sm font-semibold flex items-center justify-center">
      {getInitials(name)}
    </div>
  );
}

function CheckBubble({ checked }) {
  return (
    <span
      className={`shrink-0 inline-flex h-5 w-5 rounded-full border-2 items-center justify-center transition-colors ${
        checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
      }`}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}
