/**
 * Panel bình luận (thread + reactions) dùng chung cho chi tiết CRM và Sản xuất.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket } from '../lib/socket';
import { FbCrmAvatar, FbCrmCommentComposer, formatCrmFbRelativeTime } from './crmFbCommentUi';

const REACTION_PICKER = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function commentIdKey(c) {
  const id = c?.id;
  return id != null && id !== '' ? String(id) : '';
}

/** Thêm/cập nhật một dòng — tránh trùng khi vừa nhận socket vừa nhận response POST. */
export function upsertCommentList(prev, row, { replace = false } = {}) {
  const key = commentIdKey(row);
  if (!key) return prev || [];
  const list = prev || [];
  const idx = list.findIndex((c) => commentIdKey(c) === key);
  const normalized = { ...row, reactions: row.reactions || { summary: [], mine: null } };
  if (idx >= 0) {
    if (!replace) return list;
    const next = list.slice();
    next[idx] = { ...list[idx], ...normalized, reactions: normalized.reactions ?? list[idx].reactions };
    return next;
  }
  return [...list, normalized];
}

function groupByParent(flat, parentKey = 'parent_id') {
  const m = new Map();
  for (const c of flat || []) {
    const pk = c[parentKey] != null && c[parentKey] !== '' ? String(c[parentKey]) : '__root__';
    if (!m.has(pk)) m.set(pk, []);
    m.get(pk).push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }
  return m;
}

function ReactionStrip({ comment, disabled, onPick }) {
  const rx = comment.reactions || { summary: [], mine: null };
  const countOf = (em) => (rx.summary || []).find((s) => s.emoji === em)?.count || 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 pl-0.5">
      {REACTION_PICKER.map((em) => {
        const n = countOf(em);
        const mine = rx.mine === em;
        return (
          <button
            key={em}
            type="button"
            disabled={disabled}
            onClick={() => onPick(em)}
            className={`inline-flex min-h-[26px] items-center gap-0.5 rounded-full border px-2 py-0.5 text-[14px] leading-none transition-colors disabled:opacity-50 ${
              mine ? 'border-[#1877f2] bg-[#e7f3ff] shadow-sm' : n > 0 ? 'border-[#e4e6eb] bg-white hover:bg-[#f0f2f5]' : 'border-transparent bg-[#f0f2f5]/80 text-[#65676b] hover:bg-[#e4e6eb]'
            }`}
          >
            <span>{em}</span>
            {n > 0 && <span className="text-[11px] font-semibold text-[#65676b] tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ReactionCornerBadge({ comment }) {
  const items = (comment.reactions?.summary || []).filter((s) => s.count > 0);
  if (!items.length) return null;
  const total = items.reduce((acc, s) => acc + s.count, 0);
  return (
    <div className="pointer-events-none absolute bottom-0 right-1 z-10 translate-y-1/2 select-none">
      <div className="flex items-center gap-0.5 rounded-full border border-[#e4e6eb] bg-white py-0.5 pl-0.5 pr-1.5 shadow-md ring-1 ring-black/[0.04]">
        <div className="flex items-center -space-x-1.5 pl-0.5">
          {items.slice(0, 3).map((s) => <span key={s.emoji} className="text-[13px] leading-none">{s.emoji}</span>)}
        </div>
        {total > 1 && <span className="text-[10px] font-semibold text-[#65676b] tabular-nums">{total}</span>}
      </div>
    </div>
  );
}

function CommentThread({
  comments,
  loading,
  user,
  bodyField,
  getBody,
  setBody,
  editingId,
  editingBody,
  setEditingId,
  setEditingBody,
  replyTo,
  setReplyTo,
  posting,
  reactionBusy,
  onSubmit,
  onSaveEdit,
  onRemove,
  onReply,
  onReaction,
}) {
  const commentsByParent = useMemo(() => groupByParent(comments), [comments]);

  const renderBranch = (parentKey, depth) => {
    const list = commentsByParent.get(parentKey) || [];
    return list.map((c) => {
      const showCornerRx = editingId !== c.id && (c.reactions?.summary || []).some((s) => s.count > 0);
      return (
        <div key={c.id} className={depth > 0 ? 'ml-5 border-l border-[#ccd0d5] pl-2.5 pt-0.5' : ''}>
          <div className="group/crx flex gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-black/[0.025]">
            <FbCrmAvatar user={c.user} className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className={`relative inline-block max-w-full ${showCornerRx ? 'mb-2.5' : ''}`}>
                <div className={`max-w-full rounded-2xl border border-[#e4e6eb]/90 bg-white px-3 py-2 shadow-sm ${showCornerRx ? 'pb-2.5' : ''}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="text-[13px] font-semibold text-[#050505]">{c.user?.full_name || 'Thành viên'}</span>
                    <span className="text-[11px] text-[#65676b]">
                      {formatCrmFbRelativeTime(c.created_at)}
                      {c.updated_at && c.updated_at !== c.created_at && <span className="text-[#65676b]/70"> · Đã chỉnh sửa</span>}
                    </span>
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editingBody}
                        onChange={(e) => setEditingBody(e.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[15px] text-[#050505] focus:border-[#1877f2]/40 focus:outline-none focus:ring-1 focus:ring-[#1877f2]/30"
                      />
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={onSaveEdit} className="text-[13px] font-semibold text-[#1877f2] hover:underline">Lưu</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditingBody(''); }} className="text-[13px] font-semibold text-[#65676b] hover:underline">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 break-words text-[15px] leading-snug text-[#050505] whitespace-pre-wrap">{getBody(c)}</p>
                  )}
                </div>
                {editingId !== c.id && <ReactionCornerBadge comment={c} />}
              </div>
              {editingId !== c.id && (
                <div className="pt-1">
                  <ReactionStrip comment={c} disabled={reactionBusy === c.id} onPick={(em) => onReaction(c, em)} />
                </div>
              )}
              {editingId !== c.id && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-1 text-[12px]">
                  <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => onReply(c)}>Trả lời</button>
                  {String(c.user_id || '') === String(user?.id || user?.userId || '') && (
                    <>
                      <span className="text-[#ccd0d5]">·</span>
                      <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => { setEditingId(c.id); setEditingBody(getBody(c)); }}>Sửa</button>
                      <span className="text-[#ccd0d5]">·</span>
                      <button type="button" className="font-semibold text-[#65676b] hover:underline" onClick={() => onRemove(c)}>Xóa</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {renderBranch(String(c.id), depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] overflow-hidden">
      <div className="max-h-[min(480px,60vh)] overflow-y-auto px-2 py-3">
        {loading && <p className="py-8 text-center text-sm text-[#65676b]">Đang tải…</p>}
        {!loading && !(comments || []).length && (
          <p className="py-8 text-center text-sm text-[#65676b]">Chưa có bình luận. Hãy là người đầu tiên!</p>
        )}
        {!loading && renderBranch('__root__', 0)}
      </div>
      <div className="border-t border-[#e4e6eb] bg-white">
        {replyTo && (
          <div className="flex items-center justify-between gap-2 border-b border-[#e4e6eb] bg-[#f0f2f5] px-3 py-2 text-[13px] text-[#050505]">
            <span className="min-w-0 truncate">Đang trả lời <span className="font-semibold">{replyTo.name}</span></span>
            <button type="button" className="shrink-0 font-semibold text-[#65676b] hover:underline" onClick={() => setReplyTo(null)}>Hủy</button>
          </div>
        )}
        <FbCrmCommentComposer
          user={user}
          value={bodyField}
          onChange={(e) => setBody(e.target.value)}
          onSubmit={onSubmit}
          posting={posting}
          placeholder={replyTo ? `Trả lời ${replyTo.name}…` : `Bình luận với tư cách ${user?.full_name || user?.email || 'bạn'}…`}
        />
      </div>
    </div>
  );
}

/** Bình luận lead/deal CRM — realtime qua socket `lead:comment` */
export function CrmLeadCommentsPanel({ leadId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactionBusy, setReactionBusy] = useState(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const r = await api.get(`/crm/leads/${leadId}/comments`);
      const rows = Array.isArray(r.data) ? r.data : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
      onCountChange?.(rows.length);
    } catch {
      setComments([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [leadId, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!leadId) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:lead', leadId);
    const handler = (payload) => {
      if (String(payload?.lead_id) !== String(leadId)) return;
      const action = payload?.action || 'created';
      if (action === 'deleted') {
        const cid = payload.comment_id != null ? String(payload.comment_id) : '';
        setComments((prev) => {
          const next = (prev || []).filter((c) => commentIdKey(c) !== cid);
          onCountChange?.(next.length);
          return next;
        });
        return;
      }
      const row = payload.comment;
      if (!row?.id) return;
      if (action === 'updated') {
        setComments((prev) => upsertCommentList(prev, row, { replace: true }));
        return;
      }
      setComments((prev) => {
        const next = upsertCommentList(prev, row);
        if (next.length !== (prev || []).length) onCountChange?.(next.length);
        return next;
      });
    };
    socket.on('lead:comment', handler);
    return () => {
      socket.emit('leave:lead', leadId);
      socket.off('lead:comment', handler);
    };
  }, [leadId, onCountChange]);

  const submit = async () => {
    const v = body.trim();
    if (!v) return;
    setPosting(true);
    try {
      const payload = { body: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      const r = await api.post(`/crm/leads/${leadId}/comments`, payload);
      const row = r.data || {};
      setComments((prev) => {
        const next = upsertCommentList(prev, row);
        if (next.length !== (prev || []).length) onCountChange?.(next.length);
        return next;
      });
      setBody('');
      setReplyTo(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/crm/lead-comments/${editingId}`, { body: v });
      const row = r.data || {};
      setComments((prev) => prev.map((c) => (c.id === editingId ? { ...row, reactions: row.reactions ?? c.reactions } : c)));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/crm/lead-comments/${c.id}`);
      setComments((prev) => {
        const next = prev.filter((x) => x.id !== c.id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const pickReaction = async (c, emoji) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/crm/lead-comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  return (
    <CommentThread
      comments={comments}
      loading={loading}
      user={user}
      bodyField={body}
      getBody={(c) => c.body}
      setBody={setBody}
      editingId={editingId}
      editingBody={editingBody}
      setEditingId={setEditingId}
      setEditingBody={setEditingBody}
      replyTo={replyTo}
      setReplyTo={setReplyTo}
      posting={posting}
      reactionBusy={reactionBusy}
      onSubmit={submit}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
      onReply={(c) => { setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' }); setEditingId(null); }}
      onReaction={pickReaction}
    />
  );
}

/** Bình luận dự án sản xuất — realtime qua socket `project:comment` */
export function ProjectCommentsPanel({ projectId, onCountChange }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reactionBusy, setReactionBusy] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api.get(`/projects/${projectId}/comments`);
      const rows = Array.isArray(r.data?.comments) ? r.data.comments : [];
      setComments(rows.map((c) => ({ ...c, reactions: c.reactions || { summary: [], mine: null } })));
      onCountChange?.(rows.length);
    } catch {
      setComments([]);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:project', projectId);
    const merge = (payload) => {
      if (String(payload?.project_id) !== String(projectId)) return;
      const action = payload?.action;
      if (action === 'deleted') {
        const cid = payload.comment_id != null ? String(payload.comment_id) : commentIdKey(payload.comment);
        if (cid) setComments((prev) => (prev || []).filter((c) => commentIdKey(c) !== cid));
        return;
      }
      const row = payload.comment;
      if (!row?.id) return;
      if (action === 'updated') {
        setComments((prev) => upsertCommentList(prev, row, { replace: true }));
        return;
      }
      setComments((prev) => upsertCommentList(prev, row));
    };
    socket.on('project:comment', merge);
    socket.on('project:comment:deleted', (p) => merge({ ...p, action: 'deleted' }));
    socket.on('project:comment:updated', (p) => merge({ ...p, action: 'updated' }));
    return () => {
      socket.off('project:comment', merge);
      socket.off('project:comment:deleted', merge);
      socket.off('project:comment:updated', merge);
    };
  }, [projectId]);

  const submit = async () => {
    const v = body.trim();
    if (!v) return;
    setPosting(true);
    try {
      const payload = { content: v };
      if (replyTo?.id != null) payload.parent_id = replyTo.id;
      const r = await api.post(`/projects/${projectId}/comments`, payload);
      const row = r.data?.comment || r.data;
      if (row?.id) {
        setComments((prev) => {
          const next = upsertCommentList(prev, row);
          if (next.length !== (prev || []).length) onCountChange?.(next.length);
          return next;
        });
      } else await load();
      setBody('');
      setReplyTo(null);
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async () => {
    const v = editingBody.trim();
    if (!v) return;
    try {
      const r = await api.patch(`/projects/${projectId}/comments/${editingId}`, { content: v });
      const row = r.data || {};
      setComments((prev) => prev.map((c) => (c.id === editingId ? { ...row, reactions: row.reactions ?? c.reactions } : c)));
      setEditingId(null);
      setEditingBody('');
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi sửa');
    }
  };

  const removeComment = async (c) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    try {
      await api.delete(`/projects/${projectId}/comments/${c.id}`);
      setComments((prev) => {
        const next = prev.filter((x) => x.id !== c.id);
        onCountChange?.(next.length);
        return next;
      });
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi xóa');
    }
  };

  const pickReaction = async (c, emoji) => {
    if (reactionBusy != null) return;
    setReactionBusy(c.id);
    try {
      const r = await api.put(`/projects/${projectId}/comments/${c.id}/reaction`, { emoji });
      const reactions = r.data || { summary: [], mine: null };
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reactions } : x)));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi cảm xúc');
    } finally {
      setReactionBusy(null);
    }
  };

  return (
    <CommentThread
      comments={comments}
      loading={loading}
      user={user}
      bodyField={body}
      getBody={(c) => c.content}
      setBody={setBody}
      editingId={editingId}
      editingBody={editingBody}
      setEditingId={setEditingId}
      setEditingBody={setEditingBody}
      replyTo={replyTo}
      setReplyTo={setReplyTo}
      posting={posting}
      reactionBusy={reactionBusy}
      onSubmit={submit}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
      onReply={(c) => { setReplyTo({ id: c.id, name: c.user?.full_name || 'Thành viên' }); setEditingId(null); }}
      onReaction={pickReaction}
    />
  );
}
