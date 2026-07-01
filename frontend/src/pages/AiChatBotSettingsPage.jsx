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
  User as UserIcon,
} from 'lucide-react';

const DATA_SOURCES = [
  { id: 'channel_context', label: 'Context kênh (task + lead + CSKH)', desc: 'Quét tasks/leads của thành viên kênh, gửi vào prompt' },
  { id: 'kpi', label: 'KPI tháng', desc: 'Tổng điểm KPI tháng của thành viên kênh' },
  { id: 'company_report', label: 'Báo cáo công ty (menu + hỏi đáp)', desc: 'Menu chọn công ty → sếp trả lời → AI báo cáo lead/deal/nhân viên' },
  { id: 'none', label: 'Không kèm dữ liệu', desc: 'AI chỉ chạy theo prompt thuần (vd: lời chào, thông báo cố định)' },
];

const TIME_SCOPES = [
  { id: 'today', label: 'Hôm nay (00:00 → lúc chạy)' },
  { id: 'yesterday', label: 'Hôm qua (cả ngày)' },
  { id: 'last_7d', label: '7 ngày gần đây' },
  { id: 'last_14d', label: '14 ngày gần đây' },
  { id: 'last_30d', label: '30 ngày gần đây' },
  { id: 'custom', label: 'Tuỳ chỉnh (lùi N ngày)' },
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
  time_scope: 'today',
  time_scope_days_offset: 0,
  company_whitelist: [],
  department_whitelist: [],
  user_whitelist: [],
  conversation_enabled: false,
  conversation_ttl_minutes: 60,
  personal_scope_only: false,
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

  const [channelFilters, setChannelFilters] = useState({ divisions: [], companies: [], regions: [] });

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [botRes, chRes, schRes, pbRes, filRes] = await Promise.all([
        api.get('/ai-chat-bot/bot'),
        api.get('/ai-chat-bot/channels'),
        api.get('/ai-chat-bot/schedules'),
        api.get('/ai-chat-bot/playbooks'),
        api.get('/ai-chat-bot/channel-filters').catch(() => ({ data: { divisions: [], companies: [], regions: [] } })),
      ]);
      setBot(botRes.data);
      setChannels(chRes.data || { departments: [], groups: [] });
      setSchedules(schRes.data?.schedules || []);
      setPlaybooks(pbRes.data?.playbooks || []);
      setChannelFilters(filRes.data || { divisions: [], companies: [], regions: [] });
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
          channelFilters={channelFilters}
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
  schedules, playbooks, channels, channelFilters, busyId, setBusyId, onReload, showToast, editing, setEditing, setRunsModal, setTab,
}) {
  const enabledPlaybooks = useMemo(() => playbooks.filter((p) => p.enabled), [playbooks]);

  const onCreate = () => {
    if (!enabledPlaybooks.length) {
      showToast('Hãy tạo / bật ít nhất 1 mẫu nội dung trước', 'err');
      setTab('playbooks');
      return;
    }
    setEditing({ ...EMPTY_SCHEDULE, playbook_id: enabledPlaybooks[0].id });
  };

  const onEdit = (sch) => {
    // Detect 1-1 cá nhân fanout: schedule lưu channel_type='group' + personal_scope_only=true + recipient_user_ids.length>0.
    // Đưa modal về mode user (personal_dm) để recipient picker hiển thị danh sách NV nhận DM.
    const recipientIds = Array.isArray(sch.recipient_user_ids) ? sch.recipient_user_ids : [];
    const isPersonalFanout = sch.personal_scope_only && recipientIds.length > 0;

    setEditing({
      ...EMPTY_SCHEDULE,
      ...sch,
      channel_type: isPersonalFanout ? 'user' : sch.channel_type,
      user_ids: isPersonalFanout ? recipientIds : [],
      recipient_user_ids: recipientIds,
      playbook_id: sch.playbook_id || enabledPlaybooks[0]?.id || '',
      run_slots: Array.isArray(sch.run_slots) ? sch.run_slots : [{ h: 8, m: 0 }],
      weekdays: Array.isArray(sch.weekdays) ? sch.weekdays : [],
      company_whitelist: Array.isArray(sch.company_whitelist) ? sch.company_whitelist : [],
      department_whitelist: Array.isArray(sch.department_whitelist) ? sch.department_whitelist : [],
      user_whitelist: Array.isArray(sch.user_whitelist) ? sch.user_whitelist : [],
      region_whitelist: Array.isArray(sch.region_whitelist) ? sch.region_whitelist : [],
      time_scope: sch.time_scope || 'today',
      time_scope_days_offset: sch.time_scope_days_offset ?? 0,
      conversation_enabled: !!sch.conversation_enabled,
      conversation_ttl_minutes: sch.conversation_ttl_minutes ?? 60,
      personal_scope_only: !!sch.personal_scope_only,
    });
  };

  const onSave = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) return showToast('Nhập tên gợi nhớ cho lịch', 'err');
    if (!editing.playbook_id) return showToast('Chọn mẫu nội dung AI', 'err');

    // Mode "1-1 cá nhân" (personal_dm fanout): gộp tất cả users vào 1 lịch với recipient_user_ids.
    const isPersonalFanout = editing.channel_type === 'user' && !!editing.personal_scope_only;

    let targetIds = [];
    let storedType = editing.channel_type;
    let recipientUserIds = null;
    let fanoutAnchorChannelId = null;

    if (isPersonalFanout) {
      const userIds = Array.isArray(editing.user_ids) ? editing.user_ids : [];
      if (!userIds.length) return showToast('Chọn ít nhất 1 nhân viên nhận DM', 'err');
      storedType = 'group';
      recipientUserIds = userIds;
      // Cần 1 channel_id hợp lệ để thỏa NOT NULL constraint — dùng DM của user đầu tiên làm anchor.
      // Cron sẽ ignore khi recipient_user_ids có giá trị.
      try {
        const ensureRes = await api.post('/ai-chat-bot/ensure-direct-with-bot', { user_id: userIds[0] });
        fanoutAnchorChannelId = ensureRes?.data?.group_id;
        if (!fanoutAnchorChannelId) throw new Error('Không có group_id anchor');
      } catch (e) {
        return showToast(e?.response?.data?.error || 'Không tạo được DM với user đầu tiên', 'err');
      }
    } else if (editing.channel_type === 'user' && !editing.id) {
      // 1-1 quản lý (mode manager_dm): vẫn 1 schedule với DM của 1 user.
      const userIds = Array.isArray(editing.user_ids) ? editing.user_ids : [];
      if (!userIds.length) return showToast('Chọn quản lý nhận DM', 'err');
      storedType = 'group';
      try {
        const ensureRes = await api.post('/ai-chat-bot/ensure-direct-with-bot', { user_id: userIds[0] });
        const gid = ensureRes?.data?.group_id;
        if (!gid) throw new Error('Không có group_id');
        targetIds = [gid];
      } catch (e) {
        return showToast(e?.response?.data?.error || 'Không tạo được DM', 'err');
      }
    } else {
      targetIds = editing.id
        ? [editing.channel_id]
        : (Array.isArray(editing.channel_ids) && editing.channel_ids.length
            ? editing.channel_ids
            : (editing.channel_id ? [editing.channel_id] : []));
      if (!targetIds.length) return showToast('Chọn ít nhất 1 kênh chat', 'err');
    }

    const buildPayload = (cid) => ({
      channel_type: storedType,
      channel_id: cid,
      playbook_id: editing.playbook_id,
      custom_prompt: editing.custom_prompt?.trim() || null,
      title: editing.title.trim(),
      note: editing.note?.trim() || null,
      run_slots: editing.run_slots,
      max_runs_per_day: editing.max_runs_per_day,
      weekdays: editing.weekdays?.length ? editing.weekdays : null,
      enabled: editing.enabled,
      time_scope: editing.time_scope || 'today',
      time_scope_days_offset: editing.time_scope_days_offset ?? 0,
      company_whitelist: Array.isArray(editing.company_whitelist) && editing.company_whitelist.length
        ? editing.company_whitelist
        : null,
      department_whitelist: Array.isArray(editing.department_whitelist) && editing.department_whitelist.length
        ? editing.department_whitelist
        : null,
      user_whitelist: Array.isArray(editing.user_whitelist) && editing.user_whitelist.length
        ? editing.user_whitelist
        : null,
      region_whitelist: Array.isArray(editing.region_whitelist) && editing.region_whitelist.length
        ? editing.region_whitelist
        : null,
      recipient_user_ids: recipientUserIds,
      conversation_enabled: !!editing.conversation_enabled,
      conversation_ttl_minutes: editing.conversation_ttl_minutes ?? 60,
      personal_scope_only: !!editing.personal_scope_only,
    });

    try {
      setBusyId('save');
      if (editing.id) {
        const cid = isPersonalFanout
          ? (fanoutAnchorChannelId || editing.channel_id)
          : (targetIds[0] || editing.channel_id);
        await api.put(`/ai-chat-bot/schedules/${editing.id}`, buildPayload(cid));
        showToast('Đã cập nhật lịch');
      } else if (isPersonalFanout) {
        await api.post('/ai-chat-bot/schedules', buildPayload(fanoutAnchorChannelId));
        showToast(`Đã tạo lịch fanout DM ${recipientUserIds.length} NV ✓`);
      } else {
        let ok = 0;
        let fail = 0;
        for (const cid of targetIds) {
          try {
            await api.post('/ai-chat-bot/schedules', buildPayload(cid));
            ok += 1;
          } catch {
            fail += 1;
          }
        }
        if (fail === 0) showToast(`Đã tạo ${ok} lịch ✓`);
        else showToast(`Tạo được ${ok}/${targetIds.length} lịch (${fail} lỗi)`, fail ? 'err' : 'ok');
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
          channels={channels}
          channelFilters={channelFilters}
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

/** Hàng nhỏ trong bộ lọc Phạm vi báo cáo: label trái + actions phải + content body */
function ScopeRow({ icon, label, count, total, onSelectAll, onClear, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-gray-600 flex items-center gap-1">
          {icon} {label}
          <span className="text-gray-400">({count}/{total})</span>
        </span>
        <div className="flex gap-1.5">
          {onSelectAll && total > 0 && (
            <button type="button" onClick={onSelectAll} className="text-[10px] text-indigo-600 hover:underline">
              Chọn hết
            </button>
          )}
          {onClear && (
            <button type="button" onClick={onClear} className="text-[10px] text-gray-500 hover:text-red-600 hover:underline">
              Xoá
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** Pill button cho multi-select. color: indigo | purple */
function PillButton({ checked, onClick, color = 'indigo', children, title }) {
  const palette = color === 'purple'
    ? (checked
      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
      : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400 hover:text-purple-700')
    : (checked
      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
      : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:text-indigo-700');
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-6 px-2 rounded-full text-[10px] font-medium cursor-pointer transition border ${palette}`}
    >
      {children}
    </button>
  );
}

/**
 * AlertScopePicker — dành cho playbook KHÔNG dùng company_report (cảnh báo deadline, SLA, daily brief...).
 * Cho phép admin chọn Công ty / Khu vực / Phòng ban / Nhân viên để MỞ RỘNG vùng quét vượt khỏi thành viên kênh.
 * Khi không chọn gì → mặc định = thành viên kênh.
 */
function AlertScopePicker({ value, update, channelFilters, channels }) {
  const companies = channelFilters?.companies || [];
  const allRegions = channelFilters?.regions || [];
  const allDepartments = channels?.departments || [];
  const companyId = (value.company_whitelist || [])[0] || '';
  const regionIds = value.region_whitelist || [];
  const deptIds = value.department_whitelist || [];
  const userIds = value.user_whitelist || [];

  // Sub-lists theo công ty
  const regionsOfCompany = useMemo(() => {
    if (!companyId) return [];
    return allRegions.filter((r) => String(r.company_id) === String(companyId));
  }, [allRegions, companyId]);
  const deptsOfCompany = useMemo(() => {
    if (!companyId) return [];
    return allDepartments.filter((d) => String(d.company_id || '') === String(companyId));
  }, [allDepartments, companyId]);

  // Lazy load users của công ty đã chọn (để pick nhân viên cụ thể)
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  useEffect(() => {
    if (!companyId) { setUsers([]); return; }
    setLoadingUsers(true);
    const params = new URLSearchParams({ company_id: companyId });
    api.get(`/ai-chat-bot/users?${params.toString()}`)
      .then((r) => setUsers(r.data?.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [companyId]);

  // Lọc users theo region/dept/query
  const filteredUsers = useMemo(() => {
    let list = users;
    if (deptIds.length) {
      const set = new Set(deptIds.map(String));
      list = list.filter((u) => set.has(String(u.department_id || '')));
    }
    // region filter: cần fetch user_company_regions — skip, để user click pill (server sẽ tự lọc theo region_whitelist khi chạy)
    const q = userQuery.trim().toLowerCase();
    if (q) list = list.filter((u) => `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(q));
    return list;
  }, [users, deptIds, userQuery]);

  const toggle = (key, id) => {
    const cur = Array.isArray(value[key]) ? value[key] : [];
    const set = new Set(cur.map(String));
    if (set.has(String(id))) set.delete(String(id));
    else set.add(String(id));
    update({ [key]: [...set] });
  };

  const clearAll = () => update({
    company_whitelist: [],
    region_whitelist: [],
    department_whitelist: [],
    user_whitelist: [],
  });

  const hasScope = !!(companyId || regionIds.length || deptIds.length || userIds.length);

  const summary = hasScope
    ? `${companyId ? '🏢 1 cty' : ''}${regionIds.length ? ` · 📍${regionIds.length}` : ''}${deptIds.length ? ` · 🏷${deptIds.length}` : ''}${userIds.length ? ` · 👥${userIds.length}` : ''}`
    : 'Theo thành viên kênh (mặc định)';

  return (
    <details className="mt-2 pt-2 border-t border-sky-200" open={hasScope}>
      <summary className="cursor-pointer flex items-center justify-between gap-2 list-none">
        <span className="text-[10px] font-semibold text-sky-800 uppercase tracking-wide flex items-center gap-1.5">
          <Building2 className="h-3 w-3" /> Mở rộng phạm vi cảnh báo
        </span>
        <span className="text-[10px] text-sky-700/80 truncate">{summary}</span>
      </summary>
      <div className="mt-2 space-y-2.5">
      {hasScope && (
        <div className="flex justify-end">
          <button type="button" onClick={clearAll} className="text-[10px] text-gray-500 hover:text-red-600 hover:underline">
            Xoá phạm vi
          </button>
        </div>
      )}

      {/* B1: Công ty */}
      <div>
        <label className="block text-[10px] text-gray-600 mb-1">🏢 Công ty</label>
        <select
          value={companyId}
          onChange={(e) => {
            const v = e.target.value;
            update({
              company_whitelist: v ? [v] : [],
              region_whitelist: [],
              department_whitelist: [],
              user_whitelist: [],
            });
          }}
          className="w-full h-9 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-sky-500 text-[12px] bg-white"
        >
          <option value="">— Theo thành viên kênh (mặc định) —</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
          ))}
        </select>
      </div>

      {/* B2: Khu vực + Phòng ban (chỉ hiện khi đã chọn công ty) */}
      {companyId && (
        <>
          {regionsOfCompany.length > 0 && (
            <div>
              <label className="block text-[10px] text-gray-600 mb-1">📍 Khu vực ({regionIds.length}/{regionsOfCompany.length})</label>
              <div className="flex flex-wrap gap-1">
                {regionsOfCompany.map((r) => (
                  <PillButton
                    key={r.id}
                    checked={regionIds.map(String).includes(String(r.id))}
                    onClick={() => toggle('region_whitelist', r.id)}
                  >
                    {r.code ? `${r.code} · ${r.name}` : r.name}
                  </PillButton>
                ))}
              </div>
            </div>
          )}

          {deptsOfCompany.length > 0 && (
            <div>
              <label className="block text-[10px] text-gray-600 mb-1">🏷 Phòng ban ({deptIds.length}/{deptsOfCompany.length})</label>
              <div className="flex flex-wrap gap-1">
                {deptsOfCompany.map((d) => (
                  <PillButton
                    key={d.id}
                    checked={deptIds.map(String).includes(String(d.id))}
                    onClick={() => toggle('department_whitelist', d.id)}
                    color="purple"
                  >
                    {d.name}
                  </PillButton>
                ))}
              </div>
            </div>
          )}

          {/* B3: Nhân viên cụ thể */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-600">👥 Nhân viên cụ thể ({userIds.length}/{filteredUsers.length})</label>
              {userIds.length > 0 && (
                <button type="button" onClick={() => update({ user_whitelist: [] })} className="text-[10px] text-gray-500 hover:text-red-600 hover:underline">
                  Xoá NV
                </button>
              )}
            </div>
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Tìm tên/email nhân viên..."
              className="w-full h-8 px-2 mb-1.5 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-sky-500 text-[11px] bg-white"
            />
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-1.5 bg-white">
              {loadingUsers ? (
                <div className="text-[10px] text-gray-400 text-center py-2">Đang tải...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-[10px] text-gray-400 text-center py-2">
                  {userQuery ? 'Không có nhân viên khớp' : 'Không có nhân viên trong phạm vi'}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {filteredUsers.slice(0, 80).map((u) => (
                    <PillButton
                      key={u.id}
                      checked={userIds.map(String).includes(String(u.id))}
                      onClick={() => toggle('user_whitelist', u.id)}
                    >
                      {u.full_name}
                    </PillButton>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              💡 Để TRỐNG = lấy tất cả NV trong phạm vi công ty/khu vực/phòng ban đã chọn ở trên.
            </p>
          </div>
        </>
      )}

      <details className="text-[10px] text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5 border border-gray-200">
        <summary className="cursor-pointer font-medium text-gray-700">💬 3 cách gửi cảnh báo</summary>
        <ul className="mt-1.5 space-y-1 pl-3 list-disc leading-relaxed">
          <li>
            <b>1-1 mỗi NV (cá nhân)</b>: ở mục <i>Kênh chat</i> chọn <b>Nhân viên (DM)</b> → tích nhiều NV, bật <b>"Chỉ báo cáo 1-1 cá nhân"</b>. Bot DM riêng từng người, mỗi người chỉ thấy item của mình.
          </li>
          <li>
            <b>1-1 quản lý (tổng hợp)</b>: ở <i>Kênh chat</i> chọn <b>Nhân viên (DM)</b> → tích đúng 1 quản lý, KHÔNG bật "1-1 cá nhân". Bot DM 1 báo cáo tổng hợp lấy dữ liệu theo phạm vi cấu hình ở trên.
          </li>
          <li>
            <b>Nhóm chat (tổng hợp)</b>: ở <i>Kênh chat</i> chọn <b>Nhóm chat</b>. Bot gửi 1 báo cáo tổng hợp vào nhóm, dữ liệu lấy theo phạm vi cấu hình ở trên.
          </li>
        </ul>
      </details>
      </div>
    </details>
  );
}

function ScheduleEditorModal({ value, onChange, channels, channelFilters, playbooks, onClose, onSave, saving }) {
  const update = (patch) => onChange({ ...value, ...patch });

  // ── State filter (lưu trong giá trị editing để không bị reset khi rerender)
  const isEditingExisting = !!value.id;
  const f = value._filter || {};
  const setFilter = (patch) => update({ _filter: { ...f, ...patch } });

  // ── Scope picker (báo cáo công ty): cascade Khối → Cty → Dept → User
  const [scopeUsers, setScopeUsers] = useState([]);
  const [scopeUserQuery, setScopeUserQuery] = useState('');
  const [scopeKhoiId, setScopeKhoiId] = useState('');
  const scopePbIsReport = useMemo(
    () => playbooks.find((p) => p.id === value.playbook_id)?.data_source === 'company_report',
    [playbooks, value.playbook_id],
  );
  useEffect(() => {
    if (!scopePbIsReport) return undefined;
    let cancelled = false;
    api
      .get('/ai-chat-bot/users')
      .then((r) => {
        if (!cancelled) setScopeUsers(r.data?.users || []);
      })
      .catch(() => {
        if (!cancelled) setScopeUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scopePbIsReport]);

  // Cascade hierarchy
  const scopeCompaniesFiltered = useMemo(() => {
    const list = channelFilters?.companies || [];
    if (!scopeKhoiId) return list;
    return list.filter((c) => String(c.division_unit_id || '') === String(scopeKhoiId));
  }, [channelFilters?.companies, scopeKhoiId]);

  const scopeDepartmentsFiltered = useMemo(() => {
    const cwl = Array.isArray(value.company_whitelist) ? value.company_whitelist.map(String) : [];
    const allowedCompanyIds = cwl.length
      ? cwl
      : scopeCompaniesFiltered.map((c) => String(c.id));
    return (channels?.departments || []).filter((d) => {
      if (!allowedCompanyIds.includes(String(d.company_id || ''))) return false;
      return true;
    });
  }, [channels?.departments, value.company_whitelist, scopeCompaniesFiltered]);

  const scopeUsersFiltered = useMemo(() => {
    const cwl = Array.isArray(value.company_whitelist) ? value.company_whitelist.map(String) : [];
    const dwl = Array.isArray(value.department_whitelist) ? value.department_whitelist.map(String) : [];
    const allowedCompanyIds = cwl.length
      ? cwl
      : scopeCompaniesFiltered.map((c) => String(c.id));
    const allowedDeptIds = dwl.length
      ? dwl
      : scopeDepartmentsFiltered.map((d) => String(d.id));
    const q = scopeUserQuery.trim().toLowerCase();
    return scopeUsers.filter((u) => {
      if (allowedCompanyIds.length && !allowedCompanyIds.includes(String(u.company_id || ''))) return false;
      if (dwl.length && !allowedDeptIds.includes(String(u.department_id || ''))) return false;
      if (q && !`${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scopeUsers, value.company_whitelist, value.department_whitelist, scopeCompaniesFiltered, scopeDepartmentsFiltered, scopeUserQuery]);

  // Helpers — toggle item in a whitelist array
  const toggleInWhitelist = (key, id) => {
    const cur = Array.isArray(value[key]) ? value[key] : [];
    const set = new Set(cur.map(String));
    if (set.has(String(id))) set.delete(String(id));
    else set.add(String(id));
    update({ [key]: [...set] });
  };
  const isSelected = (key, id) => {
    const cur = Array.isArray(value[key]) ? value[key] : [];
    return cur.map(String).includes(String(id));
  };

  // ── Mode DM: tải danh sách nhân viên theo filter
  const [userList, setUserList] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');

  useEffect(() => {
    // Tải users khi mode = user (cả tạo mới + sửa) để recipient picker luôn hoạt động.
    if (value.channel_type !== 'user') return;
    let cancelled = false;
    setUserLoading(true);
    const params = new URLSearchParams();
    if (f.division_id) params.set('division_id', f.division_id);
    if (f.company_id) params.set('company_id', f.company_id);
    if (f.region_id) params.set('region_id', f.region_id);
    if (f.department_id) params.set('department_id', f.department_id);
    api
      .get(`/ai-chat-bot/users?${params.toString()}`)
      .then((r) => {
        if (!cancelled) setUserList(r.data?.users || []);
      })
      .catch(() => {
        if (!cancelled) setUserList([]);
      })
      .finally(() => {
        if (!cancelled) setUserLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [value.channel_type, f.division_id, f.company_id, f.region_id, f.department_id]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return userList;
    return userList.filter((u) =>
      (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
    );
  }, [userList, userQuery]);

  const selectedUserIds = Array.isArray(value.user_ids) ? value.user_ids : [];
  const toggleUser = (id) => {
    const set = new Set(selectedUserIds.map(String));
    if (set.has(String(id))) set.delete(String(id));
    else set.add(String(id));
    update({ user_ids: [...set] });
  };
  const selectAllUsers = () => update({ user_ids: filteredUsers.map((u) => u.id) });
  const clearUsers = () => update({ user_ids: [] });

  // Danh sách phòng ban sau khi áp filter
  const filteredDepartments = useMemo(() => {
    const list = channels?.departments || [];
    return list.filter((d) => {
      if (f.division_id && String(d.division_unit_id || '') !== String(f.division_id)) return false;
      if (f.company_id && String(d.company_id || '') !== String(f.company_id)) return false;
      if (f.region_id) {
        const rids = (d.region_ids || []).map(String);
        if (!rids.includes(String(f.region_id))) return false;
      }
      return true;
    });
  }, [channels?.departments, f.division_id, f.company_id, f.region_id]);

  // Khi đổi khối/công ty: reset company_id/region_id nếu không còn phù hợp
  const filteredCompanies = useMemo(() => {
    const list = channelFilters?.companies || [];
    if (!f.division_id) return list;
    return list.filter((c) => String(c.division_unit_id || '') === String(f.division_id));
  }, [channelFilters?.companies, f.division_id]);

  const filteredRegions = useMemo(() => {
    const list = channelFilters?.regions || [];
    if (!f.company_id) return list;
    return list.filter((r2) => String(r2.company_id) === String(f.company_id));
  }, [channelFilters?.regions, f.company_id]);

  // Multi-select dept ids (chỉ dùng khi TẠO MỚI). Sửa lịch: dropdown đơn.
  const selectedDeptIds = Array.isArray(value.channel_ids) ? value.channel_ids : [];
  const toggleDept = (id) => {
    const set = new Set(selectedDeptIds.map(String));
    if (set.has(String(id))) set.delete(String(id));
    else set.add(String(id));
    update({ channel_ids: [...set], channel_id: set.size === 1 ? [...set][0] : '' });
  };
  const selectAllDepts = () => {
    const ids = filteredDepartments.map((d) => d.id);
    update({ channel_ids: ids, channel_id: ids.length === 1 ? ids[0] : '' });
  };
  const clearDepts = () => update({ channel_ids: [], channel_id: '' });

  // Channel options cho mode "Nhóm chat" hoặc khi sửa lịch (đơn select)
  const singleChannelOptions = useMemo(() => {
    if (value.channel_type === 'group') {
      return (channels?.groups || []).map((g) => ({
        id: g.id,
        label: g.is_lead_group ? `🎯 ${g.name}` : g.name,
      }));
    }
    return filteredDepartments.map((d) => ({ id: d.id, label: d.name + (d.company_name ? ` — ${d.company_name}` : '') }));
  }, [value.channel_type, channels?.groups, filteredDepartments]);

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

          {/* Kênh — CHỈ hiển thị cho playbook company_report (báo cáo sếp).
              Các playbook cảnh báo khác dùng tab "Cách gửi" trong panel "Phạm vi thời gian cảnh báo" bên dưới. */}
          {(!selectedPb || selectedPb.data_source === 'company_report') && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Kênh chat *</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => update({ channel_type: 'department', channel_id: '', channel_ids: [] })}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  value.channel_type === 'department' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Building2 className="h-3.5 w-3.5" /> Phòng ban
              </button>
              <button type="button" onClick={() => update({ channel_type: 'group', channel_id: '', channel_ids: [] })}
                className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  value.channel_type === 'group' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <UsersRound className="h-3.5 w-3.5" /> Nhóm chat
              </button>
              {!isEditingExisting && (
                <button type="button" onClick={() => update({ channel_type: 'user', channel_id: '', channel_ids: [], user_ids: [] })}
                  className={`h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                    value.channel_type === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  <UserIcon className="h-3.5 w-3.5" /> Nhân viên (DM)
                </button>
              )}
            </div>

            {/* Bộ lọc Khối/Công ty/Khu vực (+ Phòng ban khi mode 'user') */}
            {(value.channel_type === 'department' || value.channel_type === 'user') && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2 mb-2">
                <p className="text-[11px] font-semibold text-gray-600 uppercase">
                  {value.channel_type === 'department' ? 'Lọc phòng ban' : 'Lọc nhân viên'}
                </p>
                <div className={`grid gap-2 ${value.channel_type === 'user' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
                  <select
                    value={f.division_id || ''}
                    onChange={(e) => setFilter({ division_id: e.target.value, company_id: '', region_id: '' })}
                    className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs"
                  >
                    <option value="">— Khối —</option>
                    {(channelFilters?.divisions || []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <select
                    value={f.company_id || ''}
                    onChange={(e) => setFilter({ company_id: e.target.value, region_id: '' })}
                    className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs"
                  >
                    <option value="">— Công ty —</option>
                    {filteredCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.short_name}</option>
                    ))}
                  </select>
                  <select
                    value={f.region_id || ''}
                    onChange={(e) => setFilter({ region_id: e.target.value })}
                    disabled={!f.company_id}
                    className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs disabled:opacity-50"
                  >
                    <option value="">— Khu vực —</option>
                    {filteredRegions.map((r2) => (
                      <option key={r2.id} value={r2.id}>{r2.name}</option>
                    ))}
                  </select>
                  {value.channel_type === 'user' && (
                    <select
                      value={f.department_id || ''}
                      onChange={(e) => setFilter({ department_id: e.target.value })}
                      className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs"
                    >
                      <option value="">— Phòng ban —</option>
                      {filteredDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.company_name ? ` — ${d.company_name}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {(f.division_id || f.company_id || f.region_id || f.department_id) && (
                  <button
                    type="button"
                    onClick={() => setFilter({ division_id: '', company_id: '', region_id: '', department_id: '' })}
                    className="text-[11px] text-indigo-600 hover:underline"
                  >
                    Xoá bộ lọc
                  </button>
                )}
              </div>
            )}

            {/* MULTI-SELECT nhân viên (DM) — luôn là tạo mới */}
            {value.channel_type === 'user' && !isEditingExisting && (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-[11px] font-semibold text-gray-600">
                    {userLoading ? 'Đang tải…' : `${filteredUsers.length} nhân viên`}
                    {selectedUserIds.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        đã chọn {selectedUserIds.length}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Tìm tên / email…"
                      className="h-7 px-2 text-[11px] rounded border border-gray-200 w-40"
                    />
                    <button
                      type="button"
                      onClick={selectAllUsers}
                      className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Chọn tất cả
                    </button>
                    {selectedUserIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearUsers}
                        className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Bỏ chọn
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-4">
                      {userLoading ? 'Đang tải danh sách…' : 'Không có nhân viên phù hợp'}
                    </p>
                  ) : (
                    filteredUsers.map((u) => {
                      const checked = selectedUserIds.map(String).includes(String(u.id));
                      return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-indigo-50 ${
                            checked ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUser(u.id)}
                            className="rounded"
                          />
                          <span className="flex-1 truncate">
                            <span className="font-medium">{u.full_name || u.email}</span>
                            {u.department_name && (
                              <span className="text-gray-400"> — {u.department_name}</span>
                            )}
                            {u.company_name && (
                              <span className="text-gray-400"> · {u.company_name}</span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {selectedUserIds.length > 1 && (
                  <p className="px-3 py-1.5 text-[10px] text-indigo-700 bg-indigo-50 border-t border-indigo-100">
                    Sẽ tạo {selectedUserIds.length} lịch DM riêng (mỗi nhân viên 1 lịch — cùng nội dung & giờ chạy).
                  </p>
                )}
              </div>
            )}

            {/* MULTI-SELECT phòng ban khi tạo mới; SỬA thì single-select */}
            {value.channel_type === 'department' && !isEditingExisting ? (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-[11px] font-semibold text-gray-600">
                    {filteredDepartments.length} phòng ban
                    {selectedDeptIds.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                        đã chọn {selectedDeptIds.length}
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={selectAllDepts}
                      className="text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Chọn tất cả
                    </button>
                    {selectedDeptIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearDepts}
                        className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Bỏ chọn
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {filteredDepartments.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-4">Không có phòng ban phù hợp bộ lọc</p>
                  ) : (
                    filteredDepartments.map((d) => {
                      const checked = selectedDeptIds.map(String).includes(String(d.id));
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-indigo-50 ${
                            checked ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDept(d.id)}
                            className="rounded"
                          />
                          <span className="flex-1 truncate">
                            {d.name}
                            {d.company_name && (
                              <span className="text-gray-400"> — {d.company_name}</span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {selectedDeptIds.length > 1 && (
                  <p className="px-3 py-1.5 text-[10px] text-indigo-700 bg-indigo-50 border-t border-indigo-100">
                    Sẽ tạo {selectedDeptIds.length} lịch riêng (mỗi phòng ban 1 lịch — cùng nội dung & giờ chạy).
                  </p>
                )}
              </div>
            ) : value.channel_type !== 'user' ? (
              <select
                value={value.channel_id || ''}
                onChange={(e) => update({ channel_id: e.target.value, channel_ids: e.target.value ? [e.target.value] : [] })}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
              >
                <option value="">— Chọn {value.channel_type === 'department' ? 'phòng ban' : 'nhóm chat'} —</option>
                {singleChannelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            ) : null}
          </div>
          )}

          {/* Playbook */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Mẫu nội dung AI *</label>
            <select
              value={value.playbook_id || ''}
              onChange={(e) => {
                const pbId = e.target.value;
                const pb = playbooks.find((p) => p.id === pbId);
                const patch = { playbook_id: pbId };
                if (pb?.data_source === 'company_report' && value.channel_type === 'group') {
                  patch.conversation_enabled = true;
                }
                update(patch);
              }}
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

          {/* Panel cấu hình cảnh báo: cách gửi + người nhận + thời gian + phạm vi dữ liệu */}
          {selectedPb && selectedPb.data_source !== 'company_report' && (() => {
            const deliveryMode = value.channel_type === 'group' || value.channel_type === 'department'
              ? 'group'
              : value.channel_type === 'user' && value.personal_scope_only
                ? 'personal_dm'
                : 'manager_dm';

            const setMode = (mode) => {
              if (mode === 'personal_dm') {
                update({ channel_type: 'user', personal_scope_only: true, channel_id: '', channel_ids: [] });
              } else if (mode === 'manager_dm') {
                update({
                  channel_type: 'user',
                  personal_scope_only: false,
                  channel_id: '',
                  channel_ids: [],
                  user_ids: (value.user_ids || []).slice(0, 1),
                });
              } else {
                update({ channel_type: 'group', personal_scope_only: false, user_ids: [] });
              }
            };

            const modePalette = {
              personal_dm: 'border-amber-500 bg-amber-50 text-amber-900 shadow-sm',
              manager_dm: 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-sm',
              group: 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm',
            };
            const modeBtn = (id, icon, label) => (
              <button
                type="button"
                onClick={() => setMode(id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-1.5 rounded-lg border-2 transition cursor-pointer ${
                  deliveryMode === id
                    ? modePalette[id]
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {icon}
                <span className="text-[10px] font-semibold leading-tight text-center">{label}</span>
              </button>
            );

            return (
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 space-y-3">
                <p className="text-[11px] font-semibold text-sky-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Bot className="h-3 w-3" /> Cấu hình cảnh báo
                </p>

                {/* Hàng 1: chọn mode */}
                <div>
                  <p className="text-[10px] text-gray-600 mb-1.5">📨 Cách gửi</p>
                  <div className="grid grid-cols-3 gap-2">
                    {modeBtn('personal_dm', <UserIcon className="h-4 w-4" />, '1-1 cá nhân')}
                    {modeBtn('manager_dm', <UserIcon className="h-4 w-4" />, '1-1 quản lý')}
                    {modeBtn('group', <UsersRound className="h-4 w-4" />, 'Nhóm chat')}
                  </div>
                  <p className="text-[10px] text-sky-700/80 leading-relaxed mt-1.5">
                    {deliveryMode === 'personal_dm' && <>📨 Mỗi NV nhận DM riêng từ bot, chỉ thấy số liệu của chính mình. <b>Chỉ cần chọn người nhận</b>.</>}
                    {deliveryMode === 'manager_dm' && <>📨 1 quản lý nhận DM tổng hợp. Chọn quản lý + Phạm vi dữ liệu (cty/khu vực/NV cần tổng hợp).</>}
                    {deliveryMode === 'group' && <>📢 Tin đăng trong nhóm chat. Chọn nhóm + Phạm vi dữ liệu (cty/khu vực/NV cần tổng hợp).</>}
                  </p>
                </div>

                {/* Hàng 1.5: Lọc Khối/Cty/KV/PB cho recipient picker (DM modes) — hiển thị cả khi edit */}
                {(deliveryMode === 'personal_dm' || deliveryMode === 'manager_dm') && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                    <select
                      value={f.division_id || ''}
                      onChange={(e) => setFilter({ division_id: e.target.value, company_id: '', region_id: '', department_id: '' })}
                      className="h-8 px-1.5 rounded-lg border border-gray-200 bg-white text-[11px]"
                    >
                      <option value="">— Khối —</option>
                      {(channelFilters?.divisions || []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <select
                      value={f.company_id || ''}
                      onChange={(e) => setFilter({ company_id: e.target.value, region_id: '', department_id: '' })}
                      className="h-8 px-1.5 rounded-lg border border-gray-200 bg-white text-[11px]"
                    >
                      <option value="">— Công ty —</option>
                      {filteredCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.short_name}</option>
                      ))}
                    </select>
                    <select
                      value={f.region_id || ''}
                      onChange={(e) => setFilter({ region_id: e.target.value })}
                      disabled={!f.company_id}
                      className="h-8 px-1.5 rounded-lg border border-gray-200 bg-white text-[11px] disabled:opacity-50"
                    >
                      <option value="">— Khu vực —</option>
                      {filteredRegions.map((r2) => (
                        <option key={r2.id} value={r2.id}>{r2.name}</option>
                      ))}
                    </select>
                    <select
                      value={f.department_id || ''}
                      onChange={(e) => setFilter({ department_id: e.target.value })}
                      className="h-8 px-1.5 rounded-lg border border-gray-200 bg-white text-[11px]"
                    >
                      <option value="">— Phòng ban —</option>
                      {filteredDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}{d.company_name ? ` — ${d.company_name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hàng 2: Người nhận theo mode — hiển thị cả khi edit (gộp 1 lịch nhiều NV) */}
                {deliveryMode === 'personal_dm' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-gray-600">👥 Người nhận DM ({selectedUserIds.length}/{filteredUsers.length})</p>
                      <div className="flex gap-1">
                        <button type="button" onClick={selectAllUsers} className="text-[10px] text-amber-700 hover:underline">Chọn hết</button>
                        {selectedUserIds.length > 0 && (
                          <button type="button" onClick={clearUsers} className="text-[10px] text-gray-500 hover:text-red-600 hover:underline">Xoá</button>
                        )}
                      </div>
                    </div>
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Tìm tên/email NV..."
                      className="w-full h-8 px-2 mb-1.5 rounded-lg border border-gray-200 text-[11px] bg-white"
                    />
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-1.5 bg-white">
                      {userLoading ? (
                        <div className="text-[10px] text-gray-400 text-center py-2">Đang tải...</div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="text-[10px] text-gray-400 text-center py-2">Không có NV phù hợp</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {filteredUsers.slice(0, 80).map((u) => (
                            <PillButton
                              key={u.id}
                              checked={selectedUserIds.map(String).includes(String(u.id))}
                              onClick={() => toggleUser(u.id)}
                              color="purple"
                            >
                              {u.full_name}
                            </PillButton>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedUserIds.length > 0 && (
                      <p className="text-[10px] text-amber-700 mt-1">
                        ✓ 1 lịch duy nhất sẽ fan-out DM riêng cho {selectedUserIds.length} NV. Mỗi người chỉ thấy số liệu của chính mình.
                      </p>
                    )}
                  </div>
                )}

                {deliveryMode === 'manager_dm' && (
                  <div>
                    <p className="text-[10px] text-gray-600 mb-1">👤 Quản lý nhận DM (chọn 1)</p>
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Tìm quản lý..."
                      className="w-full h-8 px-2 mb-1.5 rounded-lg border border-gray-200 text-[11px] bg-white"
                    />
                    <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-1.5 bg-white">
                      {userLoading ? (
                        <div className="text-[10px] text-gray-400 text-center py-2">Đang tải...</div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="text-[10px] text-gray-400 text-center py-2">Không có NV phù hợp</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {filteredUsers.slice(0, 80).map((u) => {
                            const checked = (value.user_ids || [])[0] === u.id;
                            return (
                              <PillButton
                                key={u.id}
                                checked={checked}
                                onClick={() => update({ user_ids: checked ? [] : [u.id] })}
                              >
                                {u.full_name}
                              </PillButton>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {deliveryMode === 'group' && (
                  <div>
                    <p className="text-[10px] text-gray-600 mb-1">💬 Nhóm chat nhận tin</p>
                    <select
                      value={value.channel_id || ''}
                      onChange={(e) => update({
                        channel_type: 'group',
                        channel_id: e.target.value,
                        channel_ids: e.target.value ? [e.target.value] : [],
                      })}
                      className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[12px] bg-white"
                    >
                      <option value="">— Chọn nhóm —</option>
                      {(channels?.groups || []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.is_lead_group ? `🎯 ${g.name}` : g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Hàng 3: Thời gian — hiển thị cho cả 3 mode (1-1 cá nhân default today, có thể chỉnh) */}
                <div className="pt-2 border-t border-sky-200">
                  <p className="text-[10px] font-semibold text-sky-800 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                    <Clock className="h-3 w-3" /> Phạm vi thời gian cảnh báo
                  </p>
                  <div className="grid grid-cols-12 gap-2">
                    <div className={value.time_scope === 'custom' ? 'col-span-8' : 'col-span-12'}>
                      <select
                        value={value.time_scope || 'today'}
                        onChange={(e) => update({ time_scope: e.target.value })}
                        className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[12px] bg-white"
                      >
                        {TIME_SCOPES.map((ts) => (
                          <option key={ts.id} value={ts.id}>{ts.label}</option>
                        ))}
                      </select>
                    </div>
                    {value.time_scope === 'custom' && (
                      <div className="col-span-4">
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={value.time_scope_days_offset ?? 0}
                          onChange={(e) => update({ time_scope_days_offset: parseInt(e.target.value, 10) || 0 })}
                          placeholder="lùi N ngày"
                          className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[12px] text-center"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-sky-700/80 leading-relaxed mt-1">
                    Bot chỉ liệt kê item rơi trong khoảng này. VD <b>"Hôm qua"</b> → tin sáng nay tổng kết hôm qua.
                  </p>
                </div>

                {/* Hàng 4: AlertScopePicker — chỉ cho mode tổng hợp (quản lý + nhóm) */}
                {(deliveryMode === 'manager_dm' || deliveryMode === 'group') && (
                  <AlertScopePicker value={value} update={update} channelFilters={channelFilters} channels={channels} />
                )}
              </div>
            );
          })()}

          {selectedPb?.data_source === 'company_report' && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Database className="h-3 w-3" /> Phạm vi báo cáo
                </p>
                {(scopeKhoiId
                  || (value.company_whitelist || []).length
                  || (value.department_whitelist || []).length
                  || (value.user_whitelist || []).length) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScopeKhoiId('');
                      update({ company_whitelist: [], department_whitelist: [], user_whitelist: [] });
                    }}
                    className="text-[10px] text-gray-500 hover:text-red-600 hover:underline"
                  >
                    Xoá tất cả
                  </button>
                )}
              </div>

              {/* Toggle 1-1 (DM) — đặt lên đầu vì ảnh hưởng các filter dưới */}
              {value.channel_type === 'user' && (
                <label className="flex items-center gap-2 cursor-pointer rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={!!value.personal_scope_only}
                    onChange={(e) => update({ personal_scope_only: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-amber-600 cursor-pointer"
                  />
                  <span className="text-[11px] text-amber-900">
                    <b>Chế độ 1-1:</b> mỗi NV chỉ thấy báo cáo của chính mình (bỏ qua phòng ban/NV bên dưới)
                  </span>
                </label>
              )}

              {/* Hàng 1: Kỳ + (Lùi N) + Khối — 3 cột chung 1 hàng */}
              <div className="grid grid-cols-12 gap-2">
                <div className={value.time_scope === 'custom' ? 'col-span-5' : 'col-span-6'}>
                  <select
                    value={value.time_scope || 'today'}
                    onChange={(e) => update({ time_scope: e.target.value })}
                    className="w-full h-8 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-[11px] bg-white"
                  >
                    {TIME_SCOPES.map((ts) => (
                      <option key={ts.id} value={ts.id}>{ts.label}</option>
                    ))}
                  </select>
                </div>
                {value.time_scope === 'custom' && (
                  <div className="col-span-2">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={value.time_scope_days_offset ?? 0}
                      onChange={(e) => update({ time_scope_days_offset: parseInt(e.target.value, 10) || 0 })}
                      placeholder="lùi N"
                      className="w-full h-8 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-[11px] text-center"
                    />
                  </div>
                )}
                <div className={value.time_scope === 'custom' ? 'col-span-5' : 'col-span-6'}>
                  <select
                    value={scopeKhoiId}
                    onChange={(e) => {
                      setScopeKhoiId(e.target.value);
                      update({ company_whitelist: [], department_whitelist: [], user_whitelist: [] });
                    }}
                    className="w-full h-8 px-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 text-[11px] bg-white"
                  >
                    <option value="">— Mọi khối —</option>
                    {(channelFilters?.divisions || []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Disable scope khi personal_scope_only */}
              {value.personal_scope_only ? (
                <p className="text-[11px] text-amber-700 italic px-2 py-1.5 bg-amber-50/60 rounded-lg">
                  Chế độ 1-1 đang bật — bộ lọc Công ty/Phòng ban/Nhân viên không áp dụng.
                </p>
              ) : (
                <>
                  {/* Công ty — pills */}
                  <ScopeRow
                    icon={<Building2 className="h-3 w-3" />}
                    label="Công ty"
                    count={(value.company_whitelist || []).length}
                    total={scopeCompaniesFiltered.length}
                    onSelectAll={() => update({ company_whitelist: scopeCompaniesFiltered.map((c) => c.id), department_whitelist: [], user_whitelist: [] })}
                    onClear={(value.company_whitelist || []).length > 0 ? () => update({ company_whitelist: [], department_whitelist: [], user_whitelist: [] }) : null}
                  >
                    {scopeCompaniesFiltered.length === 0 ? (
                      <span className="text-[10px] text-gray-400 italic">Không có công ty</span>
                    ) : (
                      scopeCompaniesFiltered.map((c) => (
                        <PillButton
                          key={c.id}
                          checked={isSelected('company_whitelist', c.id)}
                          onClick={() => toggleInWhitelist('company_whitelist', c.id)}
                          color="indigo"
                        >
                          {c.short_name || c.name}
                        </PillButton>
                      ))
                    )}
                  </ScopeRow>

                  {/* Phòng ban — pills */}
                  <ScopeRow
                    icon={<UsersRound className="h-3 w-3" />}
                    label="Phòng ban"
                    count={(value.department_whitelist || []).length}
                    total={scopeDepartmentsFiltered.length}
                    onSelectAll={() => update({ department_whitelist: scopeDepartmentsFiltered.map((d) => d.id), user_whitelist: [] })}
                    onClear={(value.department_whitelist || []).length > 0 ? () => update({ department_whitelist: [], user_whitelist: [] }) : null}
                  >
                    {scopeDepartmentsFiltered.length === 0 ? (
                      <span className="text-[10px] text-gray-400 italic">Chọn công ty trước</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {scopeDepartmentsFiltered.map((d) => (
                          <PillButton
                            key={d.id}
                            checked={isSelected('department_whitelist', d.id)}
                            onClick={() => toggleInWhitelist('department_whitelist', d.id)}
                            color="purple"
                            title={d.company_name || ''}
                          >
                            {d.name}
                          </PillButton>
                        ))}
                      </div>
                    )}
                  </ScopeRow>

                  {/* Nhân viên — list */}
                  <ScopeRow
                    icon={<UserIcon className="h-3 w-3" />}
                    label="Nhân viên"
                    count={(value.user_whitelist || []).length}
                    total={scopeUsersFiltered.length}
                    onSelectAll={() => update({ user_whitelist: scopeUsersFiltered.map((u) => u.id) })}
                    onClear={(value.user_whitelist || []).length > 0 ? () => update({ user_whitelist: [] }) : null}
                  >
                    <input
                      value={scopeUserQuery}
                      onChange={(e) => setScopeUserQuery(e.target.value)}
                      placeholder="Tìm tên/email…"
                      className="w-full h-7 px-2 mb-1 text-[10px] rounded-lg border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                      {scopeUsersFiltered.length === 0 ? (
                        <p className="text-[10px] text-gray-400 italic text-center py-2">Không có nhân viên</p>
                      ) : (
                        scopeUsersFiltered.map((u) => {
                          const checked = isSelected('user_whitelist', u.id);
                          return (
                            <label
                              key={u.id}
                              className={`flex items-center gap-1.5 px-2 py-1 text-[10px] cursor-pointer hover:bg-indigo-50 ${checked ? 'bg-indigo-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleInWhitelist('user_whitelist', u.id)}
                                className="rounded scale-90"
                              />
                              <span className="flex-1 truncate">
                                <span className="font-medium text-gray-800">{u.full_name || u.email}</span>
                                {u.department_name && <span className="text-gray-400"> · {u.department_name}</span>}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </ScopeRow>
                </>
              )}

              {/* Conversation toggle (group only) */}
              {value.channel_type === 'group' && (
                <label className="flex items-center gap-2 cursor-pointer rounded-lg bg-white border border-gray-200 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    checked={!!value.conversation_enabled}
                    onChange={(e) => update({ conversation_enabled: e.target.checked })}
                    className="w-3.5 h-3.5 rounded text-indigo-600 cursor-pointer"
                  />
                  <span className="text-[11px] text-gray-700 flex-1">Bật hỏi đáp sau menu (@mention)</span>
                  {value.conversation_enabled && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        value={value.conversation_ttl_minutes ?? 60}
                        onChange={(e) => update({ conversation_ttl_minutes: parseInt(e.target.value, 10) || 60 })}
                        className="w-14 h-6 px-1 rounded border border-gray-200 text-[10px] text-center"
                      />
                      phút
                    </span>
                  )}
                </label>
              )}
            </div>
          )}

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
