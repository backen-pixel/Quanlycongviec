import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { FileUploadButton, FilePreview } from './FileUpload';
import {
  Shield, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, RotateCcw,
  Paperclip, FileText, Send, ChevronDown, ChevronUp, Eye, AlertTriangle
} from 'lucide-react';
import { formatDateTime, getInitials, avatarColor } from '../lib/utils';

/** Màu nhấn: default = xanh CRM; workshop = teal (module xưởng) */
const ACCENT = {
  blue: {
    icon: 'text-blue-600',
    btn: 'bg-blue-600 hover:bg-blue-700',
    formWrap: 'bg-blue-50 border border-blue-200',
    formTitle: 'text-blue-900',
    link: 'text-blue-600',
    rePanel: 'bg-blue-50 border border-blue-200',
    reTitle: 'text-blue-900',
  },
  teal: {
    icon: 'text-teal-600',
    btn: 'bg-teal-600 hover:bg-teal-700',
    formWrap: 'bg-teal-50 border border-teal-200',
    formTitle: 'text-teal-900',
    link: 'text-teal-600',
    rePanel: 'bg-teal-50 border border-teal-200',
    reTitle: 'text-teal-900',
  },
};

export default function ProjectApprovalsTab({ projectId, project, onUpdated, autoShowRequest, onRequestShown, variant = 'default' }) {
  const accentKey = variant === 'workshop' ? 'teal' : 'blue';
  const ax = ACCENT[accentKey];
  const { user } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  // Auto-show request form when triggered from header button
  useEffect(() => {
    if (autoShowRequest && !loading) {
      setShowRequest(true);
      onRequestShown?.();
    }
  }, [autoShowRequest, loading]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/approvals/project/${projectId}`);
      setApprovals(data.approvals || []);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const hasRecentRejection = approvals.some(a => a.status === 'rejected' && a.requested_by === user?.userId);

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={`h-4 w-4 ${ax.icon}`} />
          <span className="text-sm font-medium text-gray-700">
            {approvals.length > 0 ? `${approvals.length} yêu cầu duyệt` : 'Chưa có yêu cầu duyệt'}
          </span>
          {pendingApprovals.length > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
              {pendingApprovals.length} chờ duyệt
            </span>
          )}
        </div>
        {!showRequest && (
          <button onClick={() => setShowRequest(true)}
            className={`h-8 px-3 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${ax.btn}`}>
            <Send className="h-3.5 w-3.5" /> Gửi yêu cầu duyệt
          </button>
        )}
      </div>

      {/* Create request form */}
      {showRequest && (
        <RequestApprovalForm
          accentKey={accentKey}
          projectId={projectId}
          project={project}
          onCreated={() => { load(); setShowRequest(false); onUpdated?.(); }}
          onCancel={() => setShowRequest(false)}
        />
      )}

      {/* Approvals list */}
      {approvals.map(approval => (
        <ApprovalCard
          key={approval.id}
          accentKey={accentKey}
          approval={approval}
          isAdmin={isAdmin}
          currentUserId={user?.userId}
          expanded={expandedId === approval.id}
          onToggle={() => setExpandedId(expandedId === approval.id ? null : approval.id)}
          onDecided={() => { load(); onUpdated?.(); }}
          onReRequested={() => { load(); }}
        />
      ))}

      {approvals.length === 0 && !showRequest && (
        <div className="text-center py-10 text-gray-400">
          <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có yêu cầu duyệt cho dự án này</p>
          <p className="text-[10px] mt-1">Bấm "Gửi yêu cầu duyệt" khi hoàn thành giai đoạn</p>
        </div>
      )}
    </div>
  );
}

// ═══ Request Approval Form ═══
function RequestApprovalForm({ projectId, project, onCreated, onCancel, accentKey = 'blue' }) {
  const ax = ACCENT[accentKey] || ACCENT.blue;
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoCheck, setAutoCheck] = useState(null);

  // Check auto-approval possibility
  useEffect(() => {
    api.get(`/approvals/check-auto/${projectId}`)
      .then(r => setAutoCheck(r.data))
      .catch(() => {});
  }, [projectId]);

  const submit = async () => {
    setLoading(true);
    try {
      // Determine next stage
      const STAGE_FLOW = [
        { slug: 'consulting', status: 'consulting' },
        { slug: 'design', status: 'designing' },
        { slug: 'quotation', status: 'quoting' },
        { slug: 'contract', status: 'contract_signed' },
        { slug: 'production', status: 'producing' },
        { slug: 'delivery', status: 'shipping' },
        { slug: 'customer-care', status: 'warranty' },
      ];
      const curIdx = STAGE_FLOW.findIndex(s => s.status === project?.status);
      const next = curIdx >= 0 && curIdx < STAGE_FLOW.length - 1 ? STAGE_FLOW[curIdx + 1] : null;

      const { data } = await api.post(`/approvals/project/${projectId}/request`, {
        notes,
        attachments: files,
        next_stage_slug: next?.slug,
        next_status: next?.status,
      });

      if (data.auto_approved) {
        alert('✅ Tự động duyệt thành công! Giai đoạn đã đạt đủ điều kiện.');
      }
      onCreated();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gửi yêu cầu');
    }
    setLoading(false);
  };

  return (
    <div className={`rounded-xl p-4 space-y-3 ${ax.formWrap}`}>
      <h3 className={`text-sm font-bold flex items-center gap-2 ${ax.formTitle}`}>
        <Send className="h-4 w-4" /> Gửi yêu cầu duyệt giai đoạn hiện tại
      </h3>

      {/* Auto-approval hint */}
      {autoCheck?.mode === 'auto' && (
        <div className={`text-xs rounded-lg p-2.5 ${
          autoCheck.auto_check?.approved
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border border-amber-200 text-amber-700'
        }`}>
          {autoCheck.auto_check?.approved ? (
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Đủ điều kiện tự động duyệt: {autoCheck.auto_check.reason}</span>
          ) : (
            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Chưa đủ điều kiện tự động: {autoCheck.auto_check?.reason}</span>
          )}
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-gray-600 block mb-1">Ghi chú / Nội dung chuyển giao</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Mô tả công việc đã hoàn thành, kết quả, lưu ý cho giai đoạn tiếp theo..."
          className="w-full min-h-[80px] px-3 py-2 border rounded-lg text-sm resize-none"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-gray-600 block mb-1">File đính kèm</label>
        <FileUploadButton onFilesUploaded={f => setFiles(prev => [...prev, ...f])} />
        <FilePreview files={files} onRemove={i => setFiles(f => f.filter((_, j) => j !== i))} small />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer hover:bg-gray-50">Hủy</button>
        <button onClick={submit} disabled={loading}
          className={`h-8 px-4 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${ax.btn}`}>
          {loading ? 'Đang gửi...' : <><Send className="h-3.5 w-3.5" /> Gửi yêu cầu</>}
        </button>
      </div>
    </div>
  );
}

// ═══ Approval Card ═══
function ApprovalCard({ approval, isAdmin, currentUserId, expanded, onToggle, onDecided, onReRequested, accentKey = 'blue' }) {
  const ax = ACCENT[accentKey] || ACCENT.blue;
  const [action, setAction] = useState(null); // 'approve' | 'reject'
  const [reason, setReason] = useState('');
  const [approveNotes, setApproveNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [reRequestNotes, setReRequestNotes] = useState('');
  const [reRequestFiles, setReRequestFiles] = useState([]);
  const [showReRequest, setShowReRequest] = useState(false);

  const isPending = approval.status === 'pending';
  const isRejected = approval.status === 'rejected';
  const isApproved = approval.status === 'approved' || approval.status === 'auto_approved';
  const isMyRequest = approval.requested_by === currentUserId;

  const statusConfig = {
    pending: { label: 'Chờ duyệt', icon: Clock, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-400' },
    approved: { label: 'Đã duyệt', icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
    auto_approved: { label: 'Tự động duyệt', icon: ShieldCheck, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
    rejected: { label: 'Từ chối', icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-400' },
  };
  const cfg = statusConfig[approval.status] || statusConfig.pending;

  const decide = async (act) => {
    if (act === 'reject' && !reason.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/approvals/${approval.id}/decide`, {
        action: act,
        reject_reason: reason,
        approve_notes: approveNotes,
      });
      setAction(null);
      setReason('');
      setApproveNotes('');
      onDecided();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setLoading(false);
  };

  const reRequest = async () => {
    setLoading(true);
    try {
      await api.post(`/approvals/${approval.id}/re-request`, {
        notes: reRequestNotes || approval.notes,
        attachments: reRequestFiles.length ? reRequestFiles : approval.attachments,
      });
      setShowReRequest(false);
      onReRequested();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setLoading(false);
  };

  return (
    <div className={`rounded-xl border transition-all ${cfg.bg}`}>
      {/* Header — always visible */}
      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={onToggle}>
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Requester avatar */}
        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
          style={{ backgroundColor: avatarColor(approval.requester?.full_name) }}>
          {getInitials(approval.requester?.full_name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{approval.requester?.full_name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${cfg.text} bg-white/60`}>
              <cfg.icon className="h-3 w-3" /> {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span>{approval.stage?.name}</span>
            <span>·</span>
            <span>{formatDateTime(approval.created_at)}</span>
            {approval.attachments?.length > 0 && (
              <span className="flex items-center gap-0.5"><Paperclip className="h-2.5 w-2.5" /> {approval.attachments.length}</span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/50">
          {/* Notes */}
          {approval.notes && (
            <div className="bg-white/70 rounded-lg p-3 mt-3">
              <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">📝 Ghi chú</label>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{approval.notes}</p>
            </div>
          )}

          {/* Attachments */}
          {approval.attachments?.length > 0 && (
            <div className="bg-white/70 rounded-lg p-3">
              <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1.5">📎 File đính kèm</label>
              <div className="space-y-1">
                {approval.attachments.map((f, i) => (
                  <a key={i} href={f.file_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                    {f.mime_type?.startsWith('image/') ? (
                      <img src={f.file_url} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <span className={`text-xs truncate flex-1 ${ax.link}`}>{f.file_name || `File ${i + 1}`}</span>
                    {f.file_size && <span className="text-[10px] text-gray-400">{(f.file_size / 1024).toFixed(0)} KB</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Rejection reason */}
          {isRejected && approval.reject_reason && (
            <div className="bg-red-100/70 rounded-lg p-3">
              <label className="text-[10px] font-semibold text-red-600 uppercase block mb-1">❌ Lý do từ chối</label>
              <p className="text-sm text-red-800 whitespace-pre-wrap">{approval.reject_reason}</p>
              {approval.decider && (
                <p className="text-[10px] text-red-500 mt-1">
                  — {approval.decider.full_name} · {formatDateTime(approval.decided_at)}
                </p>
              )}
            </div>
          )}

          {/* Approval notes */}
          {isApproved && approval.approve_notes && (
            <div className="bg-emerald-100/70 rounded-lg p-3">
              <label className="text-[10px] font-semibold text-emerald-600 uppercase block mb-1">✅ Ghi chú duyệt</label>
              <p className="text-sm text-emerald-800 whitespace-pre-wrap">{approval.approve_notes}</p>
              {approval.decider && (
                <p className="text-[10px] text-emerald-500 mt-1">
                  — {approval.decider.full_name} · {formatDateTime(approval.decided_at)}
                </p>
              )}
            </div>
          )}

          {/* Admin: Approve/Reject actions */}
          {isPending && isAdmin && !action && (
            <div className="flex gap-2 pt-1">
              <button onClick={(e) => { e.stopPropagation(); setAction('approve'); }}
                className="h-8 px-4 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-emerald-700 cursor-pointer">
                <CheckCircle2 className="h-3.5 w-3.5" /> Duyệt
              </button>
              <button onClick={(e) => { e.stopPropagation(); setAction('reject'); }}
                className="h-8 px-4 bg-red-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-red-700 cursor-pointer">
                <XCircle className="h-3.5 w-3.5" /> Từ chối
              </button>
            </div>
          )}

          {/* Approve form */}
          {isPending && action === 'approve' && (
            <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
              <label className="text-[11px] font-medium text-emerald-700 block">Ghi chú khi duyệt (tùy chọn)</label>
              <textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)}
                placeholder="Ghi chú thêm khi duyệt..." className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAction(null)} className="h-7 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
                <button onClick={() => decide('approve')} disabled={loading}
                  className="h-7 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-emerald-700 disabled:opacity-50">
                  {loading ? 'Đang duyệt...' : '✅ Xác nhận duyệt'}
                </button>
              </div>
            </div>
          )}

          {/* Reject form */}
          {isPending && action === 'reject' && (
            <div className="bg-red-50 rounded-lg p-3 space-y-2">
              <label className="text-[11px] font-medium text-red-700 block">Lý do từ chối *</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Nhập lý do từ chối..." className="w-full min-h-[60px] px-3 py-2 border border-red-200 rounded-lg text-sm resize-none" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAction(null)} className="h-7 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
                <button onClick={() => decide('reject')} disabled={loading || !reason.trim()}
                  className="h-7 px-3 bg-red-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-red-700 disabled:opacity-50">
                  {loading ? 'Đang xử lý...' : '❌ Xác nhận từ chối'}
                </button>
              </div>
            </div>
          )}

          {/* Re-request button (for rejected items, shown to requester) */}
          {isRejected && isMyRequest && !showReRequest && (
            <button onClick={() => setShowReRequest(true)}
              className={`h-8 px-4 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${ax.btn}`}>
              <RotateCcw className="h-3.5 w-3.5" /> Gửi lại yêu cầu duyệt
            </button>
          )}

          {/* Re-request form */}
          {isRejected && isMyRequest && showReRequest && (
            <div className={`rounded-lg p-3 space-y-2 ${ax.rePanel}`}>
              <h4 className={`text-sm font-medium ${ax.reTitle}`}>Gửi lại yêu cầu duyệt</h4>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Ghi chú cập nhật</label>
                <textarea value={reRequestNotes} onChange={e => setReRequestNotes(e.target.value)}
                  placeholder="Mô tả những gì đã sửa / bổ sung..." className="w-full min-h-[60px] px-3 py-2 border rounded-lg text-sm resize-none" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">File mới (tùy chọn)</label>
                <FileUploadButton compact onFilesUploaded={f => setReRequestFiles(prev => [...prev, ...f])} />
                <FilePreview files={reRequestFiles} onRemove={i => setReRequestFiles(f => f.filter((_, j) => j !== i))} small />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowReRequest(false)} className="h-7 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer">Hủy</button>
                <button onClick={reRequest} disabled={loading}
                  className={`h-7 px-3 text-white rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 ${ax.btn}`}>
                  {loading ? 'Đang gửi...' : '🔄 Gửi lại'}
                </button>
              </div>
            </div>
          )}

          {/* Everyone can see content */}
          {(isApproved || isRejected) && !isAdmin && !isMyRequest && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 pt-1">
              <Eye className="h-3 w-3" /> Bạn đang xem nội dung đã {isApproved ? 'duyệt' : 'từ chối'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
