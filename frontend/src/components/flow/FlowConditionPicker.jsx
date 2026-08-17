import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader2, ChevronRight, ChevronDown, ExternalLink, Building2, Columns3, ListChecks } from 'lucide-react';
import {
  STAGE_FLAGS,
  conditionSourceForModule,
  loadModuleCompanies,
  loadModulePipelines,
  loadPipelineStages,
  taskItemRequirementChips,
  templateItemsOf,
} from '../../lib/flowConditionSources';

const CHIP_TONE = {
  rose: 'border-rose-200 bg-rose-50 text-rose-600',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-600',
  sky: 'border-sky-200 bg-sky-50 text-sky-600',
};

const TABS = [
  { value: 'task_item_done', label: 'Nhiệm vụ phải xong', Icon: ListChecks },
  { value: 'stage_reached', label: 'Đã tới cột', Icon: Columns3 },
  { value: 'stage_flag', label: 'Cờ của cột', Icon: Building2 },
];

function RequirementChips({ item }) {
  const chips = taskItemRequirementChips(item);
  if (!chips.length) {
    return <span className="text-[10px] italic text-slate-400">Chưa cài yêu cầu nào</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className={`rounded border px-1 py-0.5 text-[9px] font-semibold ${CHIP_TONE[chip.tone] || CHIP_TONE.amber}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Modal chọn điều kiện cho node hoặc cạnh của luồng.
 * Chỉ trỏ tới cấu hình sẵn có: nhiệm vụ mẫu và cờ cột pipeline.
 */
export default function FlowConditionPicker({ moduleKey, targetLabel, onClose, onAdd }) {
  const source = conditionSourceForModule(moduleKey);
  const [tab, setTab] = useState('task_item_done');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [detail, setDetail] = useState(null);
  const [openStages, setOpenStages] = useState(() => new Set());
  const [selectedItems, setSelectedItems] = useState(() => new Map());
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedFlag, setSelectedFlag] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const scoped = await loadModuleCompanies(moduleKey);
        const list = await loadModulePipelines(moduleKey, scoped);
        if (cancelled) return;
        const companyMap = new Map();
        scoped.forEach((c) => companyMap.set(String(c.id), { id: String(c.id), name: c.name }));
        list.forEach((p) => {
          if (!companyMap.has(p.companyId)) companyMap.set(p.companyId, { id: p.companyId, name: p.companyName });
        });
        const companyList = [...companyMap.values()];
        setCompanies(companyList);
        setPipelines(list);
        setCompanyId(companyList[0]?.id || '');
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || e.message || 'Không tải được dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey]);

  const companyPipelines = useMemo(
    () => pipelines.filter((p) => !companyId || p.companyId === companyId),
    [pipelines, companyId],
  );

  useEffect(() => {
    setPipelineId((prev) => (companyPipelines.some((p) => String(p.id) === String(prev))
      ? prev
      : (companyPipelines[0]?.id || '')));
  }, [companyPipelines]);

  const selectedPipeline = pipelines.find((p) => String(p.id) === String(pipelineId)) || null;

  useEffect(() => {
    if (!selectedPipeline) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    setDetail({ loading: true, stages: [], byStage: {} });
    setOpenStages(new Set());
    setSelectedItems(new Map());
    setSelectedStageId('');
    (async () => {
      try {
        const data = await loadPipelineStages(moduleKey, selectedPipeline);
        if (!cancelled) setDetail({ loading: false, ...data });
      } catch (e) {
        if (!cancelled) {
          setDetail({ loading: false, stages: [], byStage: {}, error: e.response?.data?.error || 'Không tải được cột' });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [moduleKey, selectedPipeline]);

  const toggleStage = (stageId) => {
    setOpenStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const toggleItem = (stage, template, item) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, { stage, template, item });
      return next;
    });
  };

  const templatesLink = source === 'crm' ? '/crm/templates' : '/sx/task-templates';

  const canSubmit = tab === 'task_item_done'
    ? selectedItems.size > 0
    : tab === 'stage_reached'
      ? Boolean(selectedStageId)
      : Boolean(selectedFlag);

  const submit = () => {
    if (!canSubmit) return;
    const base = { source, company_id: companyId || null, pipeline_id: selectedPipeline?.id || null };

    if (tab === 'task_item_done') {
      // Gom theo cột để mỗi điều kiện là "các nhiệm vụ của một cột phải xong"
      const byStage = new Map();
      for (const { stage, template, item } of selectedItems.values()) {
        const key = String(stage.id);
        if (!byStage.has(key)) byStage.set(key, { stage, templateId: template.id, items: [] });
        byStage.get(key).items.push(item);
      }
      for (const { stage, templateId, items } of byStage.values()) {
        onAdd({
          condition_type: 'task_item_done',
          config: {
            ...base,
            stage_id: stage.id,
            template_id: templateId,
            item_ids: items.map((i) => i.id),
            label: items.length > 1
              ? `${stage.name}: hoàn tất ${items.length} nhiệm vụ`
              : `${stage.name}: ${items[0].title || items[0].name || 'nhiệm vụ'}`,
          },
        });
      }
    } else if (tab === 'stage_reached') {
      const stage = detail?.stages?.find((s) => String(s.id) === String(selectedStageId));
      onAdd({
        condition_type: 'stage_reached',
        config: { ...base, stage_id: selectedStageId, label: `Đã tới cột ${stage?.name || ''}`.trim() },
      });
    } else {
      const flagMeta = (STAGE_FLAGS[source] || []).find((f) => f.value === selectedFlag);
      onAdd({
        condition_type: 'stage_flag',
        config: { ...base, flag: selectedFlag, label: `Cột mang cờ "${flagMeta?.label || selectedFlag}"` },
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-slate-800">Thêm điều kiện</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Áp cho {targetLabel}. Điều kiện chỉ trỏ tới thiết lập đã có, không tạo yêu cầu mới.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-5 pt-3">
          {TABS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[12px] font-medium transition-colors ${
                tab === value
                  ? 'border-[#296DFF] text-[#296DFF]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách…
            </div>
          ) : error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{error}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Công ty
                  </span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[12px]"
                  >
                    {companies.length === 0 && <option value="">Không có công ty</option>}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Pipeline
                  </span>
                  <select
                    value={pipelineId}
                    onChange={(e) => setPipelineId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-[12px]"
                  >
                    {companyPipelines.length === 0 && <option value="">Không có pipeline</option>}
                    {companyPipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {detail?.loading ? (
                <div className="flex items-center gap-2 py-8 text-[12px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải cột và nhiệm vụ…
                </div>
              ) : detail?.error ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">{detail.error}</p>
              ) : tab === 'stage_flag' ? (
                <div className="space-y-1.5">
                  {(STAGE_FLAGS[source] || []).map((flag) => (
                    <label
                      key={flag.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                        selectedFlag === flag.value
                          ? 'border-[#296DFF] bg-blue-50/60 text-[#296DFF]'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="stage-flag"
                        checked={selectedFlag === flag.value}
                        onChange={() => setSelectedFlag(flag.value)}
                        className="accent-[#296DFF]"
                      />
                      {flag.label}
                    </label>
                  ))}
                </div>
              ) : tab === 'stage_reached' ? (
                <div className="space-y-1.5">
                  {(detail?.stages || []).length === 0 && (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] italic text-slate-400">
                      Pipeline này chưa có cột
                    </p>
                  )}
                  {(detail?.stages || []).map((stage) => (
                    <label
                      key={stage.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12px] transition-colors ${
                        String(selectedStageId) === String(stage.id)
                          ? 'border-[#296DFF] bg-blue-50/60 text-[#296DFF]'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="stage-reached"
                        checked={String(selectedStageId) === String(stage.id)}
                        onChange={() => setSelectedStageId(stage.id)}
                        className="accent-[#296DFF]"
                      />
                      <span className="truncate">{stage.name}</span>
                      {stage.pipeline_type && (
                        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500">
                          {stage.pipeline_type}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(detail?.stages || []).length === 0 && (
                    <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] italic text-slate-400">
                      Pipeline này chưa có cột
                    </p>
                  )}
                  {(detail?.stages || []).map((stage) => {
                    const templates = detail?.byStage?.[stage.id] || [];
                    const itemCount = templates.reduce((sum, t) => sum + templateItemsOf(t).length, 0);
                    const isOpen = openStages.has(stage.id);
                    return (
                      <div key={stage.id} className="overflow-hidden rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => toggleStage(stage.id)}
                          className="flex w-full items-center gap-2 bg-slate-50/70 px-3 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <span className="truncate">{stage.name}</span>
                          <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                            {itemCount} nhiệm vụ
                          </span>
                        </button>
                        {isOpen && (
                          <div className="space-y-1 px-3 py-2">
                            {itemCount === 0 && (
                              <p className="py-1 text-[11px] italic text-slate-400">Cột này chưa có nhiệm vụ mẫu</p>
                            )}
                            {templates.map((template) => templateItemsOf(template).map((item) => (
                              <label
                                key={item.id}
                                className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedItems.has(item.id)}
                                  onChange={() => toggleItem(stage, template, item)}
                                  className="mt-0.5 accent-[#296DFF]"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12px] text-slate-700">
                                    {item.title || item.name || 'Nhiệm vụ'}
                                  </span>
                                  <span className="mt-0.5 block">
                                    <RequirementChips item={item} />
                                  </span>
                                </span>
                              </label>
                            )))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <Link
            to={templatesLink}
            target="_blank"
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-[#296DFF]"
          >
            <ExternalLink className="h-3 w-3" />
            Sửa yêu cầu của nhiệm vụ
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-[#296DFF] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Thêm điều kiện
              {tab === 'task_item_done' && selectedItems.size > 0 ? ` (${selectedItems.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
