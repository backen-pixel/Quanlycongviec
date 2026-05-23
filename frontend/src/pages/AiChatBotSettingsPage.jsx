/**
 * AiChatBotSettingsPage
 * Trang admin cấu hình "🤖 AI Assistant" trong chat phòng ban / nhóm.
 *
 * 2 tab:
 *   - "Lịch chạy" (schedules)   : khi nào bot đăng tin, vào kênh nào, dùng mẫu nội dung nào
 *   - "Mẫu nội dung AI" (playbooks): thư viện các "luồng" AI sẽ nói (admin tạo tuỳ ý + bật/tắt)
 *
 * Mỗi schedule trỏ vào 1 playbook → muốn đổi cách AI nói, chỉ cần sửa playbook
 * (không cần đụng vào từng lịch).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Play,
  Power,
  PowerOff,
  X,
  Clock,
  Building2,
  UsersRound,
  History,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Sparkles,
  Database,
  FileText,
  Lock,
  Settings as SettingsIcon,
} from 'lucide-react';

const DATA_SOURCES = [
  { id: 'channel_context', label: 'Context kênh (task + lead + CSKH)', desc: 'Quét tasks/leads của thành viên kênh, gửi vào prompt' },
  { id: 'kpi', label: 'KPI tháng', desc: 'Tổng điểm KPI tháng của thành viên kênh' },
  { id: 'none', label: 'Không kèm dữ liệu', desc: 'AI chỉ chạy theo prompt thuần (vd: lời chào, thông báo cố định)' },
];

const WEEKDAY_LABELS = [
  { id: 1, label: 'T2' },
  { id: 2, label: 'T3' },
  { id: 3, label: 'T4' },
  { id: 4, label: 'T5' },
  { id: 5, label: 'T6' },
  { id: 6, label: 'T7' },
  { id: 7, label: 'CN' },
];

const EMPTY_SCHEDULE = {
  channel_type: 'department',
  channel_id: '',
  playbook_id: '',
  custom_prompt: '',
  title: '',
  note: '',
  run_slots: [{ h: 8, m: 0 }],
  max_runs_per_day: 2,
  weekdays: [],
  enabled: true,
};

const EMPTY_PLAYBOOK = {
  name: '',
  description: '',
  icon: '✨',
  data_source: 'channel_context',
  system_prompt: '',
  user_prompt_extra: '',
  max_tokens: 700,
  temperature: 0.55,
  enabled: true,
};

function formatSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return '—';
  return slots.map((s) => `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`).join(', ');
}

function formatWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || !weekdays.length) return 'Mọi ngày';
  return weekdays.map((d) => WEEKDAY_LABELS.find((w) => w.id === d)?.label || d).join(', ');
}

export default function AiChatBotSettingsPage() {
  const [tab, setTab] = useState('schedules'); // 'schedules' | 'playbooks'
  const [bot, setBot] = useState(null);
  const [channels, setChannels] = useState({ departments: [], groups: [] });
  const [schedules, setSchedules] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [runsModal, setRunsModal] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((text, kind = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [botRes, chRes, schRes, pbRes] = await Promise.all([
        api.get('/ai-chat-bot/bot'),
        api.get('/ai-chat-bot/channels'),
        api.get('/ai-chat-bot/schedules'),
        api.get('/ai-chat-bot/playbooks'),
      ]);
      setBot(botRes.data);
      setChannels(chRes.data || { departments: [], groups: [] });
      setSchedules(schRes.data?.schedules || []);
      setPlaybooks(pbRes.data?.playbooks || []);
    } catch (e) {
      showToast(e?.response?.data?.error || 'Không tải được dữ liệu', 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">🤖 AI Assistant trong chat</h1>
            <p className="text-xs text-gray-500">
              Tạo các luồng AI tự động đăng tin vào chat phòng ban / nhóm
            </p>
          </div>
        </div>
      </div>

      {/* Bot status */}
      {bot && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-white border border-gray-200 flex items-center gap-3 text-sm">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-base">🤖</div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900">{bot.full_name}</div>
            <div className="text-xs text-gray-500">
              ID: <code className="font-mono">{bot.id?.slice(0, 8)}…</code> · Bot xuất hiện như 1 thành viên trong chat
            </div>
          </div>
          {bot.openai_configured ? (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> OpenAI sẵn sàng
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Thiếu OPENAI_API_KEY — chạy fallback tĩnh
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab('schedules')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'schedules' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Calendar className="h-4 w-4" /> Lịch chạy
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{schedules.length}</span>
        </button>
        <button
          onClick={() => setTab('playbooks')}
          className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-2 ${
            tab === 'playbooks' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Mẫu nội dung AI
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{playbooks.length}</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : tab === 'schedules' ? (
        <SchedulesTab
          schedules={schedules}
          playbooks={playbooks}
          channels={channels}
          busyId={busyId}
          setBusyId={setBusyId}
          onReload={reload}
          showToast={showToast}
          editing={editingSchedule}
          setEditing={setEditingSchedule}
          setRunsModal={setRunsModal}
          setTab={setTab}
        />
      ) : (
        <PlaybooksTab
          playbooks={playbooks}
          busyId={busyId}
          setBusyId={setBusyId}
          onReload={reload}
          showToast={showToast}
          editing={editingPlaybook}
          setEditing={setEditingPlaybook}
        />
      )}

      {/* Runs history modal */}
      {runsModal && <RunsModal data={runsModal} onClose={() => setRunsModal(null)} />}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 ${
            toast.kind === 'err' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {toast.kind === 'err' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 1: SCHEDULES
   ════════════════════════════════════════════════════════ */

function SchedulesTab({
  schedules, playbooks, channels, busyId, setBusyId, onReload, showToast, editing, setEditing, setRunsModal, setTab,
}) {
  const enabledPlaybooks = useMemo(() => playbooks.filter((p) => p.enabled), [playbooks]);

  const channelOptions = useMemo(() => {
    if (editing?.channel_type === 'group') {
      return channels.groups.map((g) => ({
        id: g.id,
        label: g.is_lead_group ? `🎯 ${g.name}` : g.name,
      }));
    }
    return channels.departments.map((d) => ({ id: d.id, label: d.name }));
  }, [editing?.channel_type, channels]);

  const onCreate = () => {
    if (!enabledPlaybooks.length) {
      showToast('Hãy tạo / bật ít nhất 1 mẫu nội dung trước', 'err');
      setTab('playbooks');
      return;
    }
    setEditing({ ...EMPTY_SCHEDULE, playbook_id: enabledPlaybooks[0].id });
  };

  const onEdit = (sch) =>
    setEditing({
      ...EMPTY_SCHEDULE,
      ...sch,
      playbook_id: sch.playbook_id || enabledPlaybooks[0]?.id || '',
      run_slots: Array.isArray(sch.run_slots) ? sch.run_slots : [{ h: 8, m: 0 }],
      weekdays: Array.isArray(sch.weekdays) ? sch.weekdays : [],
    });

  const onSave = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) return showToast('Nhập tên gợi nhớ cho lịch', 'err');
    if (!editing.channel_id) return showToast('Chọn kênh chat', 'err');
    if (!editing.playbook_id) return showToast('Chọn mẫu nội dung AI', 'err');

    const payload = {
      channel_type: editing.channel_type,
      channel_id: editing.channel_id,
      playbook_id: editing.playbook_id,
      custom_prompt: editing.custom_prompt?.trim() || null,
      title: editing.title.trim(),
      note: editing.note?.trim() || null,
      run_slots: editing.run_slots,
      max_runs_per_day: editing.max_runs_per_day,
      weekdays: editing.weekdays?.length ? editing.weekdays : null,
      enabled: editing.enabled,
    };
    try {
      setBusyId('save');
      if (editing.id) {
        await api.put(`/ai-chat-bot/schedules/${editing.id}`, payload);
        showToast('Đã cập nhật lịch');
      } else {
        await api.post('/ai-chat-bot/schedules', payload);
        showToast('Đã tạo lịch');
      }
      setEditing(null);
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Lưu lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (sch) => {
    if (!confirm(`Xoá lịch "${sch.title}"?`)) return;
    try {
      setBusyId(sch.id);
      await api.delete(`/ai-chat-bot/schedules/${sch.id}`);
      showToast('Đã xoá');
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Xoá lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onToggle = async (sch) => {
    try {
      setBusyId(sch.id);
      await api.patch(`/ai-chat-bot/schedules/${sch.id}/toggle`, { enabled: !sch.enabled });
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Đổi trạng thái lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onRunNow = async (sch) => {
    try {
      setBusyId(sch.id);
      const { data } = await api.post(`/ai-chat-bot/schedules/${sch.id}/run-now`);
      if (data.status === 'ok') showToast('Đã gửi tin AI vào kênh ✓');
      else if (data.status === 'skipped') showToast(`Bỏ qua: ${data.error || 'không rõ'}`, 'err');
      else showToast(`Lỗi: ${data.error || 'không rõ'}`, 'err');
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Gửi thử lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onViewRuns = async (sch) => {
    try {
      const { data } = await api.get(`/ai-chat-bot/schedules/${sch.id}/runs`);
      setRunsModal({ id: sch.id, title: sch.title, runs: data.runs || [] });
    } catch (e) {
      showToast(e?.response?.data?.error || 'Không tải được lịch sử', 'err');
    }
  };

  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          onClick={onCreate}
          className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center gap-2 cursor-pointer shadow"
        >
          <Plus className="h-4 w-4" /> Tạo lịch mới
        </button>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Chưa có lịch AI nào"
          subtitle='Bấm "Tạo lịch mới" để bot AI bắt đầu đăng tin vào chat'
        />
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              sch={s}
              busy={busyId === s.id}
              onEdit={() => onEdit(s)}
              onDelete={() => onDelete(s)}
              onToggle={() => onToggle(s)}
              onRunNow={() => onRunNow(s)}
              onViewRuns={() => onViewRuns(s)}
            />
          ))}
        </div>
      )}

      {editing && (
        <ScheduleEditorModal
          value={editing}
          onChange={setEditing}
          channelOptions={channelOptions}
          playbooks={enabledPlaybooks}
          onClose={() => setEditing(null)}
          onSave={onSave}
          saving={busyId === 'save'}
        />
      )}
    </>
  );
}

function ScheduleCard({ sch, busy, onEdit, onDelete, onToggle, onRunNow, onViewRuns }) {
  const ChannelIcon = sch.channel_type === 'department' ? Building2 : UsersRound;
  const pb = sch.playbook;

  return (
    <div className={`bg-white rounded-2xl border ${sch.enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'} p-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: (sch.channel_color || '#6366F1') + '20' }}
        >
          <ChannelIcon className="h-5 w-5" style={{ color: sch.channel_color || '#6366F1' }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{sch.title}</h3>
            {sch.enabled ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Đang chạy</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Tạm dừng</span>
            )}
            {pb ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  pb.enabled ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                }`}
                title={pb.enabled ? 'Mẫu đang bật' : '⚠️ Mẫu bị tắt — lịch chạy sẽ bị bỏ qua'}
              >
                {pb.icon || '✨'} {pb.name}
                {!pb.enabled && ' (tắt)'}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                ⚠️ Chưa gán mẫu
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-gray-500 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <ChannelIcon className="h-3 w-3" />
              <span className="font-medium text-gray-700">{sch.channel_name}</span>
              <span className="text-gray-400">· {sch.channel_type === 'department' ? 'Phòng ban' : 'Nhóm chat'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>Giờ chạy (VN): <b className="text-gray-700">{formatSlots(sch.run_slots)}</b></span>
              <span className="text-gray-400">· tối đa {sch.max_runs_per_day} lần/ngày</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              <span>Ngày: <b className="text-gray-700">{formatWeekdays(sch.weekdays)}</b></span>
            </div>
            {sch.note && <div className="text-gray-400">📝 {sch.note}</div>}
            {sch.last_run_at && (
              <div className="text-gray-400">
                Lần gần nhất:{' '}
                <span className={sch.last_run_status === 'ok' ? 'text-emerald-600' : 'text-red-500'}>
                  {sch.last_run_status === 'ok' ? '✓' : '✗'} {new Date(sch.last_run_at).toLocaleString('vi-VN')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRunNow}
            disabled={busy}
            className="h-8 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Gửi thử ngay (không tính quota)"
          >
            <Play className="h-3 w-3" /> Gửi thử
          </button>
          <button
            onClick={onToggle}
            disabled={busy}
            className={`h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 ${
              sch.enabled ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
            }`}
            title={sch.enabled ? 'Tạm dừng' : 'Bật lại'}
          >
            {sch.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onViewRuns}
            className="h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center cursor-pointer"
            title="Lịch sử chạy"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            disabled={busy}
            className="h-8 w-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Sửa"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="h-8 w-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Xoá"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleEditorModal({ value, onChange, channelOptions, playbooks, onClose, onSave, saving }) {
  const update = (patch) => onChange({ ...value, ...patch });

  const addSlot = () => update({ run_slots: [...(value.run_slots || []), { h: 9, m: 0 }] });
  const removeSlot = (i) => update({ run_slots: value.run_slots.filter((_, idx) => idx !== i) });
  const setSlot = (i, k, v) => {
    const slots = value.run_slots.map((s, idx) => (idx === i ? { ...s, [k]: parseInt(v, 10) || 0 } : s));
    update({ run_slots: slots });
  };
  const toggleWd = (id) => {
    const set = new Set(value.weekdays || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ weekdays: [...set].sort() });
  };

  const selectedPb = playbooks.find((p) => p.id === value.playbook_id);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{value.id ? 'Sửa lịch AI' : 'Tạo lịch AI'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tên gợi nhớ *</label>
            <input
              value={value.title || ''}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="VD: Brief sáng 8h cho phòng Kinh Doanh"
              className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              value={value.note || ''}
              onChange={(e) => update({ note: e.target.value })}
              placeholder="Tuỳ chọn"
              className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* Kênh */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kênh chat *</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => update({ channel_type: 'department', channel_id: '' })}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  value.channel_type === 'department' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Building2 className="h-3.5 w-3.5" /> Phòng ban
              </button>
              <button type="button" onClick={() => update({ channel_type: 'group', channel_id: '' })}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  value.channel_type === 'group' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <UsersRound className="h-3.5 w-3.5" /> Nhóm chat
              </button>
            </div>
            <select
              value={value.channel_id || ''}
              onChange={(e) => update({ channel_id: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
            >
              <option value="">— Chọn {value.channel_type === 'department' ? 'phòng ban' : 'nhóm chat'} —</option>
              {channelOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Playbook */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mẫu nội dung AI *</label>
            <select
              value={value.playbook_id || ''}
              onChange={(e) => update({ playbook_id: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
            >
              <option value="">— Chọn mẫu —</option>
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon || '✨'} {p.name}
                </option>
              ))}
            </select>
            {selectedPb?.description && (
              <p className="text-[11px] text-gray-500 mt-1.5 italic">{selectedPb.description}</p>
            )}
          </div>

          {/* Custom prompt (optional override) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Yêu cầu thêm cho lần đăng này (tuỳ chọn)
            </label>
            <textarea
              value={value.custom_prompt || ''}
              onChange={(e) => update({ custom_prompt: e.target.value })}
              placeholder="VD: 'Chú ý nhắc thêm về đơn hàng ABC sắp giao' — AI sẽ nhận đây như admin_instruction"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* Lịch chạy */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Giờ chạy (giờ Việt Nam) *</label>
              <button type="button" onClick={addSlot}
                className="text-xs text-indigo-600 hover:text-indigo-700 cursor-pointer flex items-center gap-1">
                <Plus className="h-3 w-3" /> Thêm giờ
              </button>
            </div>
            <div className="space-y-2">
              {(value.run_slots || []).map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <input type="number" min={0} max={23} value={s.h} onChange={(e) => setSlot(i, 'h', e.target.value)}
                    className="w-16 h-9 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-center" />
                  <span className="text-gray-400">:</span>
                  <input type="number" min={0} max={59} value={s.m} onChange={(e) => setSlot(i, 'm', e.target.value)}
                    className="w-16 h-9 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-center" />
                  {value.run_slots.length > 1 && (
                    <button type="button" onClick={() => removeSlot(i)}
                      className="h-7 w-7 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center cursor-pointer">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Số lần tối đa / ngày</label>
            <input type="number" min={1} max={24} value={value.max_runs_per_day}
              onChange={(e) => update({ max_runs_per_day: parseInt(e.target.value, 10) || 1 })}
              className="w-24 h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
            <p className="text-[11px] text-gray-500 mt-1">
              Bot sẽ ngừng đăng nếu đã đạt số lần này. "Gửi thử ngay" không tính.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ngày trong tuần</label>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((w) => {
                const active = (value.weekdays || []).includes(w.id);
                return (
                  <button key={w.id} type="button" onClick={() => toggleWd(w.id)}
                    className={`h-9 w-9 rounded-lg text-xs font-medium cursor-pointer ${
                      active ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Không chọn = chạy mọi ngày.</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!value.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 cursor-pointer" />
            <span className="text-sm text-gray-700">Kích hoạt lịch ngay sau khi lưu</span>
          </label>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 cursor-pointer">
            Huỷ
          </button>
          <button onClick={onSave} disabled={saving}
            className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium cursor-pointer flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {value.id ? 'Lưu' : 'Tạo lịch'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TAB 2: PLAYBOOKS (mẫu nội dung AI)
   ════════════════════════════════════════════════════════ */

function PlaybooksTab({ playbooks, busyId, setBusyId, onReload, showToast, editing, setEditing }) {
  const onCreate = () => setEditing({ ...EMPTY_PLAYBOOK });
  const onEdit = (pb) => setEditing({ ...EMPTY_PLAYBOOK, ...pb });

  const onSave = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) return showToast('Nhập tên mẫu', 'err');
    if (!editing.system_prompt?.trim()) return showToast('Nhập system prompt', 'err');

    const payload = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      icon: editing.icon || null,
      data_source: editing.data_source,
      system_prompt: editing.system_prompt.trim(),
      user_prompt_extra: editing.user_prompt_extra?.trim() || null,
      max_tokens: editing.max_tokens,
      temperature: editing.temperature,
      enabled: editing.enabled,
    };

    try {
      setBusyId('save');
      if (editing.id) {
        await api.put(`/ai-chat-bot/playbooks/${editing.id}`, payload);
        showToast('Đã cập nhật mẫu');
      } else {
        await api.post('/ai-chat-bot/playbooks', payload);
        showToast('Đã tạo mẫu');
      }
      setEditing(null);
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Lưu lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (pb) => {
    if (pb.is_builtin) return showToast('Mẫu hệ thống không thể xoá — chỉ tắt được', 'err');
    if (!confirm(`Xoá mẫu "${pb.name}"?`)) return;
    try {
      setBusyId(pb.id);
      await api.delete(`/ai-chat-bot/playbooks/${pb.id}`);
      showToast('Đã xoá');
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Xoá lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const onToggle = async (pb) => {
    try {
      setBusyId(pb.id);
      await api.patch(`/ai-chat-bot/playbooks/${pb.id}/toggle`, { enabled: !pb.enabled });
      onReload();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Đổi trạng thái lỗi', 'err');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          Mỗi mẫu = 1 "kịch bản" AI sẽ nói. Tạo bao nhiêu cũng được, bật-tắt riêng từng cái.
          <br />Mẫu nào bị tắt thì lịch đang dùng nó sẽ bị bỏ qua (status "skipped").
        </p>
        <button onClick={onCreate}
          className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center gap-2 cursor-pointer shadow">
          <Plus className="h-4 w-4" /> Tạo mẫu mới
        </button>
      </div>

      {playbooks.length === 0 ? (
        <EmptyState icon={Sparkles} title="Chưa có mẫu nào" subtitle='Bấm "Tạo mẫu mới" để bắt đầu' />
      ) : (
        <div className="space-y-2">
          {playbooks.map((pb) => (
            <PlaybookCard
              key={pb.id}
              pb={pb}
              busy={busyId === pb.id}
              onEdit={() => onEdit(pb)}
              onDelete={() => onDelete(pb)}
              onToggle={() => onToggle(pb)}
            />
          ))}
        </div>
      )}

      {editing && (
        <PlaybookEditorModal
          value={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={onSave}
          saving={busyId === 'save'}
        />
      )}
    </>
  );
}

function PlaybookCard({ pb, busy, onEdit, onDelete, onToggle }) {
  const ds = DATA_SOURCES.find((d) => d.id === pb.data_source);
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
      pb.enabled ? 'border-gray-200' : 'border-gray-100 opacity-70'
    }`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center text-xl shrink-0">
          {pb.icon || '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{pb.name}</h3>
            {pb.is_builtin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex items-center gap-0.5">
                <Lock className="h-2.5 w-2.5" /> hệ thống
              </span>
            )}
            {pb.enabled ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Bật</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Tắt</span>
            )}
            {ds && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium flex items-center gap-1">
                <Database className="h-2.5 w-2.5" /> {ds.label}
              </span>
            )}
          </div>
          {pb.description && <p className="text-xs text-gray-600 mt-1">{pb.description}</p>}
          <p className="text-[11px] text-gray-400 mt-1 font-mono">code: {pb.code}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onToggle} disabled={busy}
            className={`h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 ${
              pb.enabled ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
            }`}
            title={pb.enabled ? 'Tắt mẫu này' : 'Bật mẫu này'}>
            {pb.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onEdit} disabled={busy}
            className="h-8 w-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center justify-center cursor-pointer disabled:opacity-50"
            title="Sửa nội dung">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!pb.is_builtin && (
            <button onClick={onDelete} disabled={busy}
              className="h-8 w-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center cursor-pointer disabled:opacity-50"
              title="Xoá">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaybookEditorModal({ value, onChange, onClose, onSave, saving }) {
  const update = (patch) => onChange({ ...value, ...patch });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            {value.id ? `Sửa mẫu: ${value.name}` : 'Tạo mẫu nội dung AI'}
            {value.is_builtin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium flex items-center gap-0.5">
                <Lock className="h-2.5 w-2.5" /> hệ thống
              </span>
            )}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Icon</label>
              <input value={value.icon || ''} onChange={(e) => update({ icon: e.target.value })}
                placeholder="📋" maxLength={4}
                className="w-full h-10 px-3 text-center rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-xl" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên mẫu *</label>
              <input value={value.name || ''} onChange={(e) => update({ name: e.target.value })}
                placeholder="VD: Cảnh báo lead VIP chưa chốt"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mô tả ngắn (để admin nhớ)</label>
            <input value={value.description || ''} onChange={(e) => update({ description: e.target.value })}
              placeholder="Mô tả để admin biết mẫu này dùng làm gì"
              className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn dữ liệu cho AI *</label>
            <div className="grid grid-cols-1 gap-2">
              {DATA_SOURCES.map((d) => (
                <button key={d.id} type="button" onClick={() => update({ data_source: d.id })}
                  className={`text-left p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    value.data_source === d.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-500" />
                    {d.label}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 ml-6">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> System Prompt * (chỉ thị cho AI viết thế nào)
            </label>
            <textarea value={value.system_prompt || ''} onChange={(e) => update({ system_prompt: e.target.value })}
              rows={8}
              placeholder={`Loại: "Tóm tắt việc cần làm hôm nay" cho kênh.
Cấu trúc:
1) Một dòng tổng quan.
2) Liệt kê 3-7 việc ưu tiên...
3) Một câu nhắc/cổ vũ.`}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono leading-relaxed" />
            <p className="text-[11px] text-gray-500 mt-1">
              Sẽ được ghép vào sau system prompt mặc định. AI sẽ nhận context_pack chứa dữ liệu kênh.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Yêu cầu thêm mặc định (optional) — sẽ dùng nếu schedule không override
            </label>
            <textarea value={value.user_prompt_extra || ''} onChange={(e) => update({ user_prompt_extra: e.target.value })}
              rows={2}
              placeholder="VD: 'Tập trung vào lead có giá > 100tr'"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
          </div>

          <details className="bg-gray-50 rounded-xl p-3 group">
            <summary className="cursor-pointer text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <SettingsIcon className="h-3.5 w-3.5" />
              Tham số nâng cao OpenAI
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Max tokens (200..4000)</label>
                <input type="number" min={200} max={4000} value={value.max_tokens}
                  onChange={(e) => update({ max_tokens: parseInt(e.target.value, 10) || 700 })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-1">Temperature (0..1.5)</label>
                <input type="number" min={0} max={1.5} step={0.05} value={value.temperature}
                  onChange={(e) => update({ temperature: parseFloat(e.target.value) || 0.55 })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
            </div>
          </details>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!value.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 cursor-pointer" />
            <span className="text-sm text-gray-700">Bật mẫu này (các lịch đang dùng sẽ chạy)</span>
          </label>
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 cursor-pointer">
            Huỷ
          </button>
          <button onClick={onSave} disabled={saving}
            className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium cursor-pointer flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {value.id ? 'Lưu' : 'Tạo mẫu'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ════════════════════════════════════════════════════════ */

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
      <Icon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}

function RunsModal({ data, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">
            <History className="h-5 w-5 inline -mt-1 mr-1.5" />
            Lịch sử chạy — {data.title}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center cursor-pointer">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {data.runs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Chưa có lần chạy nào.</p>
          ) : (
            data.runs.map((r) => (
              <div key={r.id}
                className={`p-3 rounded-xl border ${
                  r.status === 'ok' ? 'border-emerald-200 bg-emerald-50/40'
                    : r.status === 'error' ? 'border-red-200 bg-red-50/40'
                      : 'border-gray-200 bg-gray-50/40'
                }`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-gray-500">{r.vn_date}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white text-gray-600 font-medium">{r.slot_label || '—'}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    r.status === 'ok' ? 'bg-emerald-100 text-emerald-700'
                      : r.status === 'error' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>{r.status}</span>
                  <span className="ml-auto text-gray-400">{new Date(r.created_at).toLocaleString('vi-VN')}</span>
                </div>
                {r.message_preview && (
                  <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">{r.message_preview}</p>
                )}
                {r.error_text && (
                  <p className="mt-1 text-xs text-red-600 font-mono">{r.error_text}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
