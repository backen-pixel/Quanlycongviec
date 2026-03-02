import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Shield, ShieldCheck, ShieldAlert, Settings2, Save, CheckCircle2, FileText, StickyNote, FileCheck } from 'lucide-react';

const ICON_NAME_TO_EMOJI = {
  MessageSquare: '💬', Palette: '🎨', Calculator: '💰', FileText: '📝',
  Hammer: '🏭', Truck: '🚛', Wrench: '🔧', Heart: '❤️',
  ClipboardList: '📋', Package: '📦', Settings: '⚙️', Users: '👥',
};

function stageIcon(s) {
  if (!s?.icon) return '📋';
  if (s.icon.charCodeAt(0) > 127) return s.icon;
  return ICON_NAME_TO_EMOJI[s.icon] || '📋';
}

const MODE_OPTIONS = [
  { value: 'manual', label: 'Chờ duyệt thủ công', desc: 'Bắt buộc quản lý duyệt trước khi chuyển giai đoạn', icon: ShieldAlert, color: 'text-amber-600 bg-amber-50' },
  { value: 'auto', label: 'Tự động duyệt', desc: 'Hệ thống tự duyệt khi thỏa TẤT CẢ điều kiện đã chọn', icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
];

const CONDITION_OPTIONS = [
  { value: 'all_tasks_done', label: 'Tất cả tasks hoàn thành', desc: 'Mọi công việc ở giai đoạn này đều "Done"', icon: CheckCircle2 },
  { value: 'checklist_complete', label: 'Checklist đã tick hết', desc: 'Tất cả mục checklist phải được tick hoàn thành', icon: CheckCircle2 },
  { value: 'checklist_has_files', label: 'Checklist có file đính kèm', desc: 'Mỗi mục checklist phải có ít nhất 1 file', icon: FileText },
  { value: 'checklist_has_notes', label: 'Checklist có ghi chú', desc: 'Mỗi mục checklist phải có ghi chú', icon: StickyNote },
  { value: 'checklist_has_files_or_notes', label: 'Checklist có file HOẶC ghi chú', desc: 'Mỗi checklist phải có file hoặc ghi chú (1 trong 2)', icon: FileCheck },
];

export default function ApprovalRulesPage() {
  const [rules, setRules] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [editRule, setEditRule] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, stagesRes] = await Promise.all([
        api.get('/approvals/rules').catch(() => ({ data: { rules: [] } })),
        api.get('/stages').catch(() => ({ data: { stages: [] } })),
      ]);
      setRules(rulesRes.data.rules || []);
      setStages(stagesRes.data.stages || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRule = async (stageId, mode, conditions, description) => {
    setSaving(prev => ({ ...prev, [stageId]: true }));
    try {
      await api.put(`/approvals/rules/${stageId}`, {
        approval_mode: mode,
        auto_conditions: conditions,
        description,
      });
      await load();
      setEditRule(null);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu quy tắc');
    }
    setSaving(prev => ({ ...prev, [stageId]: false }));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
    </div>
  );

  const activeStages = stages.filter(s => s.is_active !== false);
  const stageRules = activeStages.map(s => {
    const rule = rules.find(r => r.stage_id === s.id);
    return {
      stage: s,
      rule: rule || { approval_mode: 'manual', auto_conditions: ['all_tasks_done'], description: '' },
    };
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-600" /> Quy Tắc Duyệt Tự Động
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Cấu hình cách duyệt cho từng giai đoạn · Có thể chọn nhiều điều kiện (tất cả phải thỏa mãn)
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 bg-gray-50 rounded-xl p-3">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-gray-600">Chờ duyệt thủ công</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-gray-600">Tự động duyệt</span>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {stageRules.map(({ stage, rule }) => {
          const isEditing = editRule === stage.id;
          const isManual = rule.approval_mode === 'manual';
          const conditions = rule.auto_conditions || ['all_tasks_done'];
          const conditionLabels = conditions.map(c => CONDITION_OPTIONS.find(o => o.value === c)?.label || c);

          return (
            <div key={stage.id} className={`bg-white rounded-xl border transition-all ${isEditing ? 'ring-2 ring-blue-300 shadow-lg' : ''}`}>
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                <div className="w-2 h-12 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-lg shrink-0">{stageIcon(stage)}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">{stage.name}</h3>
                  <p className="text-[10px] text-gray-400">{stage.slug}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isManual ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {isManual ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {isManual ? 'Chờ duyệt' : 'Tự động'}
                </div>
                {!isEditing && (
                  <button onClick={() => setEditRule(stage.id)}
                    className="h-8 px-3 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer flex items-center gap-1">
                    <Settings2 className="h-3.5 w-3.5" /> Cấu hình
                  </button>
                )}
              </div>

              {/* Description + conditions summary */}
              {!isEditing && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-gray-500">
                    {rule.description || (isManual
                      ? 'Bắt buộc quản lý duyệt trước khi chuyển giai đoạn tiếp theo'
                      : `Tự động duyệt khi thỏa tất cả:`
                    )}
                  </p>
                  {!isManual && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {conditionLabels.map((label, i) => (
                        <span key={i} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                          ✓ {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Edit form */}
              {isEditing && (
                <RuleEditForm
                  rule={rule}
                  stageId={stage.id}
                  saving={saving[stage.id]}
                  onSave={saveRule}
                  onCancel={() => setEditRule(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {activeStages.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có quy trình nào</p>
        </div>
      )}
    </div>
  );
}

function RuleEditForm({ rule, stageId, saving, onSave, onCancel }) {
  const [mode, setMode] = useState(rule.approval_mode || 'manual');
  const [conditions, setConditions] = useState(rule.auto_conditions || ['all_tasks_done']);
  const [description, setDescription] = useState(rule.description || '');

  const toggleCondition = (value) => {
    setConditions(prev => {
      if (prev.includes(value)) {
        const next = prev.filter(c => c !== value);
        return next.length > 0 ? next : ['all_tasks_done']; // Must have at least 1
      }
      return [...prev, value];
    });
  };

  return (
    <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
      {/* Mode toggle */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Chế độ duyệt</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${
                mode === opt.value ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <opt.icon className={`h-5 w-5 mt-0.5 shrink-0 ${mode === opt.value ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className={`text-sm font-medium ${mode === opt.value ? 'text-blue-900' : 'text-gray-700'}`}>{opt.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Auto conditions — CHECKBOXES (multi-select) */}
      {mode === 'auto' && (
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
            Điều kiện tự động duyệt
          </label>
          <p className="text-[10px] text-gray-400 mb-2">Chọn nhiều điều kiện — tất cả phải thỏa mãn mới tự động duyệt (AND)</p>
          <div className="space-y-1.5">
            {CONDITION_OPTIONS.map(opt => {
              const checked = conditions.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    checked ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCondition(opt.value)}
                    className="accent-emerald-600 h-4 w-4 rounded"
                  />
                  <opt.icon className={`h-4 w-4 shrink-0 ${checked ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                    <p className="text-[10px] text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
          {conditions.length > 1 && (
            <div className="mt-2 bg-blue-50 rounded-lg p-2 text-[10px] text-blue-700 flex items-center gap-1.5">
              💡 <strong>{conditions.length} điều kiện</strong> — hệ thống kiểm tra TẤT CẢ trước khi tự động duyệt
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Mô tả (tùy chọn)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="VD: Kiểm tra đầy đủ file thiết kế trước khi chuyển sang báo giá"
          className="w-full h-9 px-3 border rounded-lg text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="h-8 px-3 border rounded-lg text-xs text-gray-600 cursor-pointer hover:bg-gray-50">Hủy</button>
        <button
          onClick={() => onSave(stageId, mode, conditions, description)}
          disabled={saving}
          className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? 'Đang lưu...' : 'Lưu quy tắc'}
        </button>
      </div>
    </div>
  );
}
