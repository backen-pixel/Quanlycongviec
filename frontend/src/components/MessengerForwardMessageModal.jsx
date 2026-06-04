import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Send, X, Users, Loader2, Check, MessageSquare } from 'lucide-react';
import api from '../lib/api';
import { getInitials } from '../lib/utils';
import { useMessengerDock } from '../context/MessengerDockContext';
import { buildBulkForwardMessageContent } from '../lib/messengerMessageActions';

/**
 * Chuyển tiếp tin nhắn Messenger sang bất kỳ chat nhóm / 1-1 nào user có quyền.
 */
export default function MessengerForwardMessageModal({
  message,
  messages: messagesProp,
  sourceTitle,
  excludeGroupId,
  onClose,
  onSent,
}) {
  const messages = useMemo(() => {
    if (Array.isArray(messagesProp) && messagesProp.length) return messagesProp;
    return message ? [message] : [];
  }, [message, messagesProp]);
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

  useEffect(() => {
    let cancelled = false;
    setLoadingGroups(true);
    api
      .get('/messenger/groups')
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setGroups(
          excludeGroupId
            ? list.filter((g) => String(g.id) !== String(excludeGroupId))
            : list,
        );
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
  }, [excludeGroupId]);

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
        const { data } = await api.get('/users', { params: { search: term } });
        setStaffHits(Array.isArray(data?.users) ? data.users.slice(0, 14) : []);
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

  const toggleTarget = (key, value) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const previewText = useMemo(
    () => buildBulkForwardMessageContent(messages, { sourceTitle }),
    [messages, sourceTitle],
  );

  const handleSend = async () => {
    if (!selectedList.length || sending || !messages.length) return;
    setSending(true);
    const content = buildBulkForwardMessageContent(messages, { sourceTitle, note });
    const failures = [];
    let lastOpened = null;

    for (const target of selectedList) {
      try {
        let gid = null;
        if (target.type === 'user') {
          const { data } = await api.post('/messenger/direct', { peer_user_id: target.id });
          gid = data?.id || null;
          if (gid) {
            lastOpened = {
              id: gid,
              name: data?.display_name || target.name,
              is_direct: true,
              peer_id: data?.peer_id || target.id,
              peer_avatar: data?.peer_avatar || target.avatar || null,
            };
          }
        } else if (target.type === 'group') {
          gid = target.id;
          lastOpened = {
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
      alert(`Một số người nhận không gửi được: ${failures.join(', ')}`);
    }
    if (lastOpened && selectedList.length === 1) {
      openMessengerGroupChat(lastOpened);
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow">
              <Send className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {messages.length > 1 ? `Chia sẻ ${messages.length} tin` : 'Chia sẻ tin nhắn'}
              </h2>
              <p className="text-[11px] text-slate-500">Chọn nhóm hoặc nhân viên (1-1)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-slate-100 shrink-0">
          <p className="text-[11px] text-slate-500 line-clamp-2">
            {previewText.slice(0, 160)}
            {previewText.length > 160 ? '…' : ''}
          </p>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm thành viên (tên, email)…"
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/60"
            />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ghi chú kèm theo (tuỳ chọn)…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/60"
          />
          {selectedList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((t) => (
                <span
                  key={`${t.type}-${t.id}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium"
                >
                  {t.name}
                  <button type="button" onClick={() => toggleTarget(`${t.type}-${t.id}`, t)} className="hover:text-violet-900">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {q.trim().length >= 2 && (
            <section>
              <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Thành viên
              </h3>
              {searching && (
                <p className="px-4 py-2 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tìm…
                </p>
              )}
              {!searching && staffHits.length === 0 && (
                <p className="px-4 py-2 text-xs text-slate-400">Không có kết quả</p>
              )}
              <ul className="pb-2">
                {staffHits.map((u) => {
                  const key = `user-${u.id}`;
                  const on = !!selected[key];
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() =>
                          toggleTarget(key, {
                            type: 'user',
                            id: u.id,
                            name: u.full_name || u.email,
                            avatar: u.avatar,
                          })
                        }
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${on ? 'bg-violet-50' : ''}`}
                      >
                        <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {getInitials(u.full_name || u.email)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{u.full_name || u.email}</span>
                          {u.email && u.full_name ? (
                            <span className="block text-[11px] text-slate-500 truncate">{u.email}</span>
                          ) : null}
                        </span>
                        {on ? <Check className="h-4 w-4 text-violet-600 shrink-0" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section>
            <h3 className="px-4 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Nhóm chat
            </h3>
            {loadingGroups && (
              <p className="px-4 py-2 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải…
              </p>
            )}
            <ul className="pb-2">
              {groups.map((g) => {
                const key = `group-${g.id}`;
                const on = !!selected[key];
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() =>
                        toggleTarget(key, {
                          type: 'group',
                          id: g.id,
                          name: g.name || 'Nhóm',
                          is_direct: !!g.is_direct,
                          peer_id: g.peer_id,
                          peer_avatar: g.peer_avatar,
                        })
                      }
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${on ? 'bg-violet-50' : ''}`}
                    >
                      <span className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {getInitials(g.name)}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{g.name || 'Nhóm'}</span>
                      {on ? <Check className="h-4 w-4 text-violet-600 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            disabled={!selectedList.length || sending}
            onClick={() => void handleSend()}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Gửi ({selectedList.length || 0})
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
