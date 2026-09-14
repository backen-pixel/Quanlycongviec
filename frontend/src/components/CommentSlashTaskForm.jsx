import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import api from '../lib/api';

/**
 * Form tạo nhiệm vụ gọn, bật lên ngay trong khung bình luận khi gõ lệnh «/».
 *
 * Gửi thẳng vào POST /crm/leads/:id/assignments — cùng endpoint với form Giao việc đầy đủ,
 * nên dùng lại nguyên luồng đã kiểm chứng: bắn thông báo cho từng người nhận, tự đăng
 * bình luận @mention vào deal, và đồng bộ sang crm_tasks.
 *
 * Khác form đầy đủ một điểm có chủ đích: LUÔN đặt một người là `primary`
 * («Chịu trách nhiệm chính»). Mặc định hệ thống đang là `executor` cho tất cả,
 * khiến từ 21/08/2026 không nhiệm vụ nào còn người chịu trách nhiệm.
 */

const MODULE_OPTIONS = [
  { value: 'crm', label: 'CRM' },
  { value: 'production', label: 'Xưởng (SX)' },
  { value: 'logistics', label: 'Lắp đặt (VC/LĐ)' },
];

const SOURCE_OPTIONS = [
  { value: 'customer_request', label: 'Phát sinh từ khách hàng' },
  { value: 'employee_error', label: 'Lỗi từ nhân viên' },
];

function memberId(m) {
  return String(m?.user_id || m?.user?.id || m?.id || '').trim();
}

function memberName(m) {
  return String(m?.user?.full_name || m?.full_name || m?.user?.email || m?.email || '').trim()
    || 'Thành viên';
}

export default function CommentSlashTaskForm({
  leadId,
  kind = 'task',
  initialTitle = '',
  initialAssigneeIds = [],
  defaultModule = 'crm',
  onCreated,
  onCancel,
}) {
  const isPhatSinh = kind === 'phat_sinh';

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [title, setTitle] = useState(initialTitle);
  const [deadline, setDeadline] = useState('');
  const [assignModule, setAssignModule] = useState(
    MODULE_OPTIONS.some((o) => o.value === defaultModule) ? defaultModule : 'crm',
  );
  const [sourceType, setSourceType] = useState('customer_request');
  const [errorModule, setErrorModule] = useState('production');
  const [picked, setPicked] = useState(() => new Set((initialAssigneeIds || []).map(String)));
  const [primaryId, setPrimaryId] = useState(() => String(initialAssigneeIds?.[0] || ''));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    if (!leadId) { setLoadingMembers(false); return undefined; }
    (async () => {
      try {
        const r = await api.get(`/crm/leads/${leadId}/members`);
        const list = Array.isArray(r.data) ? r.data : (r.data?.members || []);
        if (alive) setMembers(list);
      } catch {
        if (alive) setMembers([]);
      } finally {
        if (alive) setLoadingMembers(false);
      }
    })();
    return () => { alive = false; };
  }, [leadId]);

  const options = useMemo(
    () => (members || [])
      .map((m) => ({ id: memberId(m), name: memberName(m) }))
      .filter((m) => m.id),
    [members],
  );

  const toggle = useCallback((id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setPrimaryId((cur) => (next.has(cur) ? cur : ([...next][0] || '')));
      return next;
    });
  }, []);

  const submit = async () => {
    const name = title.trim();
    if (!name) { setErr('Nhập tiêu đề nhiệm vụ'); return; }
    if (!picked.size) { setErr('Chọn ít nhất một người nhận'); return; }
    setErr('');
    setSaving(true);
    try {
      const ids = [...picked];
      const chief = picked.has(primaryId) ? primaryId : ids[0];
      const roles = {};
      for (const id of ids) roles[id] = id === chief ? 'primary' : 'executor';

      const { data } = await api.post(`/crm/leads/${leadId}/assignments`, {
        title: name,
        description: null,
        priority: 'medium',
        column_id: null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        assignee_ids: ids,
        assignee_roles: roles,
        assignment_module: assignModule,
        task_source_type: isPhatSinh ? sourceType : null,
        employee_error_module: isPhatSinh && sourceType === 'employee_error' ? errorModule : null,
      });
      onCreated?.(data);
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Không tạo được nhiệm vụ');
    } finally {
      setSaving(false);
    }
  };

  const chiefName = options.find((o) => o.id === primaryId)?.name || '';

  return (
    <div className="mb-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{isPhatSinh ? '⚠️' : '✅'}</span>
        <p className="flex-1 text-[13px] font-semibold text-violet-900">
          {isPhatSinh ? 'Tạo nhiệm vụ phát sinh' : 'Tạo công việc'}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-violet-700 hover:bg-violet-100 cursor-pointer"
          title="Đóng"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tiêu đề nhiệm vụ…"
        autoFocus
        className="mt-2 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-violet-400 focus:ring-0"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <label className="flex min-w-[150px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-violet-900">Khối phân công</span>
          <select
            value={assignModule}
            onChange={(e) => setAssignModule(e.target.value)}
            className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-900 focus:border-violet-400 focus:ring-0"
          >
            {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {isPhatSinh && (
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-violet-900">Loại phát sinh</span>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-900 focus:border-violet-400 focus:ring-0"
            >
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}

        {isPhatSinh && sourceType === 'employee_error' && (
          <label className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-violet-900">Khối gây lỗi</span>
            <select
              value={errorModule}
              onChange={(e) => setErrorModule(e.target.value)}
              className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-900 focus:border-violet-400 focus:ring-0"
            >
              {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}

        <label className="flex min-w-[170px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-violet-900">Hạn xử lý</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[12px] text-gray-900 focus:border-violet-400 focus:ring-0"
          />
        </label>
      </div>

      <div className="mt-2">
        <p className="text-[11px] font-semibold text-violet-900">
          Người nhận — bấm tên để chọn, bấm ★ để đặt người chịu trách nhiệm chính
        </p>
        {loadingMembers ? (
          <p className="mt-1 text-[12px] text-violet-700">Đang tải thành viên…</p>
        ) : options.length === 0 ? (
          <p className="mt-1 text-[12px] text-violet-700">
            Deal chưa có thành viên — thêm ở tab Thành viên trước.
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.map((o) => {
              const on = picked.has(o.id);
              const chief = on && o.id === primaryId;
              return (
                <span
                  key={o.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${
                    on
                      ? 'border-violet-400 bg-violet-600 text-white'
                      : 'border-violet-200 bg-white text-violet-900 hover:bg-violet-100'
                  }`}
                >
                  <button type="button" onClick={() => toggle(o.id)} className="cursor-pointer">
                    {o.name}
                  </button>
                  {on && (
                    <button
                      type="button"
                      onClick={() => setPrimaryId(o.id)}
                      title="Đặt làm người chịu trách nhiệm chính"
                      className={`cursor-pointer ${chief ? 'text-amber-300' : 'text-white/50 hover:text-amber-200'}`}
                    >
                      ★
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {chiefName && (
          <p className="mt-1 text-[11px] text-violet-800">
            Chịu trách nhiệm chính: <strong>{chiefName}</strong>
          </p>
        )}
      </div>

      {err && <p className="mt-2 text-[12px] font-medium text-rose-700">{err}</p>}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-violet-800 hover:bg-violet-100 cursor-pointer"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60 cursor-pointer"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isPhatSinh ? 'Tạo phát sinh' : 'Tạo công việc'}
        </button>
      </div>
    </div>
  );
}
