import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Settings, Plus, Trash2, Save, GripVertical, ChevronRight, Trophy, XCircle, Eye, EyeOff, MessageCircle, Loader2 } from 'lucide-react';

/** Hai mẫu theo tài liệu Zalo / ví dụ template ngắn — ID chỉ để thử form; OA thật cần template_id của bạn */
const ZALO_TEST_PRESETS = [
  {
    key: 'won566121',
    label: 'Deal Thắng (566121 — mặc định)',
    phone: '84987654321',
    templateId: '566121',
    templateJson: `{
  "ten_san_pham": "Tủ bếp nhôm cánh kính",
  "order_code": "BG-002",
  "date": "13/04/2026",
  "ten_khach_hang": "Tên"
}`,
  },
  {
    key: 'won565773',
    label: 'Mẫu 3 biến (565773)',
    phone: '84987654321',
    templateId: '565773',
    templateJson: `{
  "ten_san_pham": "Tủ bếp acrylic",
  "order_code": "DEAL-0001",
  "ten_khach_hang": "Nguyễn Văn A"
}`,
  },
  {
    key: 'doc',
    label: 'Mẫu tài liệu Zalo',
    phone: '84987654321',
    templateId: '7895417a7d3f9461cd2e',
    templateJson: `{
  "ky": "1",
  "thang": "4/2020",
  "start_date": "20/03/2020",
  "end_date": "20/04/2020",
  "customer": "Nguyễn Thị Hoàng Anh",
  "cid": "PE010299485",
  "address": "VNG Campus, TP.HCM",
  "amount": "100",
  "total": "100000"
}`,
  },
];

const ZALO_TEST_DEFAULT = ZALO_TEST_PRESETS[0];

/** Key gửi lên Zalo — value rỗng; server điền từ deal. Lưu qua API, dùng cho nút «Gửi Zalo» trên chi tiết deal. */
const DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY = `{
  "ten_san_pham": "",
  "order_code": "",
  "date": "",
  "ten_khach_hang": ""
}`;

const COLORS = ['#94A3B8','#3B82F6','#8B5CF6','#F59E0B','#F97316','#10B981','#EF4444','#EC4899','#06B6D4','#6366F1'];
const ICONS = ['🆕','📞','💬','📋','📧','⏳','🤝','💰','📝','✅','❌','🎯','🔥','⭐','🏆'];

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('lead');
  const [adding, setAdding] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#94A3B8', icon: '🆕', is_won: false, is_lost: false, send_zalo_on_enter: false, sync_role: '' });

  const [zaloSettings, setZaloSettings] = useState(null);
  const [zaloLoading, setZaloLoading] = useState(false);
  const [zaloTestPhone, setZaloTestPhone] = useState(ZALO_TEST_DEFAULT.phone);
  const [zaloTestJson, setZaloTestJson] = useState(ZALO_TEST_DEFAULT.templateJson);
  const [zaloTestToken, setZaloTestToken] = useState('');
  const [zaloTestTemplateId, setZaloTestTemplateId] = useState(ZALO_TEST_DEFAULT.templateId);
  const [zaloTestSending, setZaloTestSending] = useState(false);
  const [zaloTestResult, setZaloTestResult] = useState(null);

  const [pipelines, setPipelines] = useState([]);
  /** Lỗi tải /crm/pipelines (VD thiếu bảng trên Supabase) */
  const [pipelinesLoadError, setPipelinesLoadError] = useState(null);
  const [zaloPlId, setZaloPlId] = useState('');
  const [zaloPlDetail, setZaloPlDetail] = useState(null);
  const [zaloPlTemplateId, setZaloPlTemplateId] = useState('');
  const [zaloPlMergeJson, setZaloPlMergeJson] = useState('{}');
  const [zaloPlSaving, setZaloPlSaving] = useState(false);
  const [zaloStructureJson, setZaloStructureJson] = useState(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/crm/pipeline-stages', { params: { all: 'true' } });
      setStages(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadZalo = async () => {
    setZaloLoading(true);
    try {
      const { data } = await api.get('/crm/zalo-notify-settings');
      setZaloSettings(data || {});
      const ts = data?.template_structure;
      if (ts && typeof ts === 'object' && !Array.isArray(ts) && Object.keys(ts).length > 0) {
        setZaloStructureJson(JSON.stringify(ts, null, 2));
      } else {
        setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
      }
    } catch {
      setZaloSettings({ enabled: false, template_id: '', sending_mode: '1', has_token: false, merge_template_data: {}, template_structure: null });
      setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
    }
    setZaloLoading(false);
  };
  useEffect(() => { loadZalo(); }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get('/crm/pipelines');
        if (cancel) return;
        const list = Array.isArray(data) ? data : [];
        setPipelinesLoadError(null);
        setPipelines(list);
        setZaloPlId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id || '';
        });
      } catch (e) {
        if (cancel) return;
        const d = e.response?.data;
        const code = d?.code;
        const msg = d?.error || e.message || 'Không tải được danh sách pipeline';
        setPipelines([]);
        setPipelinesLoadError(
          code === 'CRM_PIPELINES_TABLE_MISSING'
            ? { code, message: msg }
            : { code: code || 'UNKNOWN', message: msg },
        );
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!zaloPlId) {
      setZaloPlDetail(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get(`/crm/pipelines/${zaloPlId}`);
        if (cancel) return;
        setZaloPlDetail(data || null);
      } catch {
        if (!cancel) setZaloPlDetail(null);
      }
    })();
    return () => { cancel = true; };
  }, [zaloPlId]);

  useEffect(() => {
    if (!zaloPlDetail) return;
    setZaloPlTemplateId(zaloPlDetail.zalo_template_id != null ? String(zaloPlDetail.zalo_template_id) : '');
    const m = zaloPlDetail.zalo_merge_template_data;
    const obj = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    setZaloPlMergeJson(JSON.stringify(obj, null, 2));
  }, [zaloPlDetail]);

  const savePipelineZalo = async () => {
    if (!zaloPlId) return;
    let merge = {};
    try {
      merge = zaloPlMergeJson.trim() ? JSON.parse(zaloPlMergeJson) : {};
      if (typeof merge !== 'object' || merge === null || Array.isArray(merge)) {
        throw new Error('merge phải là object JSON (không phải mảng)');
      }
    } catch (e) {
      alert(e.message || 'JSON không hợp lệ');
      return;
    }
    setZaloPlSaving(true);
    try {
      await api.put(`/crm/pipelines/${zaloPlId}`, {
        zalo_template_id: zaloPlTemplateId.trim() || null,
        zalo_merge_template_data: merge,
      });
      const { data } = await api.get(`/crm/pipelines/${zaloPlId}`);
      setZaloPlDetail(data || null);
      alert('Đã lưu Zalo cho pipeline này');
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    } finally {
      setZaloPlSaving(false);
    }
  };

  const saveZaloMaster = async (patch) => {
    try {
      const { data } = await api.put('/crm/zalo-notify-settings', patch);
      setZaloSettings(data);
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu Zalo');
      loadZalo();
    }
  };

  const saveZaloForm = async () => {
    let template_structure;
    try {
      const raw = zaloStructureJson.trim();
      if (!raw) {
        template_structure = null;
      } else {
        const parsed = JSON.parse(raw);
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Cấu trúc template phải là object JSON (không phải mảng)');
        }
        template_structure = Object.keys(parsed).length ? parsed : null;
      }
    } catch (e) {
      alert(e.message || 'JSON cấu trúc template không hợp lệ');
      return;
    }
    try {
      const body = {
        enabled: !!zaloSettings?.enabled,
        template_id: zaloSettings?.template_id || '',
        sending_mode: zaloSettings?.sending_mode || '1',
        merge_template_data: zaloSettings?.merge_template_data || {},
        template_structure,
      };
      if (zaloTestToken.trim()) body.access_token = zaloTestToken.trim();
      const { data } = await api.put('/crm/zalo-notify-settings', body);
      setZaloSettings(data);
      const ts = data?.template_structure;
      if (ts && typeof ts === 'object' && !Array.isArray(ts) && Object.keys(ts).length > 0) {
        setZaloStructureJson(JSON.stringify(ts, null, 2));
      } else {
        setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY);
      }
      setZaloTestToken('');
      alert('Đã lưu cấu hình Zalo OA');
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const applyZaloTestPreset = (preset) => {
    setZaloTestPhone(preset.phone);
    setZaloTestTemplateId(preset.templateId);
    setZaloTestJson(preset.templateJson);
    setZaloTestResult(null);
  };

  const runZaloTest = async () => {
    let template_data;
    try {
      template_data = JSON.parse(zaloTestJson || '{}');
    } catch {
      return alert('template_data không phải JSON hợp lệ');
    }
    setZaloTestSending(true);
    setZaloTestResult(null);
    try {
      const { data } = await api.post('/crm/zalo-notify-test', {
        phone: zaloTestPhone.trim(),
        template_data,
        ...(zaloTestToken.trim() ? { access_token: zaloTestToken.trim() } : {}),
        ...(zaloTestTemplateId.trim() ? { template_id: zaloTestTemplateId.trim() } : {}),
      });
      setZaloTestResult(data);
    } catch (e) {
      setZaloTestResult({ ok: false, error: e.response?.data?.error || e.message });
    }
    setZaloTestSending(false);
  };

  const toggleZaloColumn = async (stage) => {
    if (stage.pipeline_type !== 'deal') return;
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { send_zalo_on_enter: !stage.send_zalo_on_enter });
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
  };

  const filtered = stages.filter(s => s.pipeline_type === activeType).sort((a, b) => a.order_index - b.order_index);
  const otherType = activeType === 'lead' ? 'deal' : 'lead';
  const otherFiltered = stages.filter(s => s.pipeline_type === otherType).sort((a, b) => a.order_index - b.order_index);

  const startAdd = (type) => {
    setAdding(type);
    setEditId(null);
    setForm({ name: '', color: COLORS[filtered.length % COLORS.length], icon: '🆕', is_won: false, is_lost: false, send_zalo_on_enter: false, sync_role: '' });
  };

  const startEdit = (stage) => {
    setEditId(stage.id);
    setAdding(null);
    setForm({
      name: stage.name,
      color: stage.color,
      icon: stage.icon || '',
      is_won: stage.is_won,
      is_lost: stage.is_lost,
      send_zalo_on_enter: !!stage.send_zalo_on_enter,
      sync_role: stage.sync_role || '',
    });
  };

  const saveNew = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      await api.post('/crm/pipeline-stages', { ...form, pipeline_type: adding });
      setAdding(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const saveEdit = async () => {
    if (!form.name.trim()) return alert('Nhập tên giai đoạn');
    try {
      await api.put(`/crm/pipeline-stages/${editId}`, form);
      setEditId(null);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const del = async (id) => {
    if (!confirm('Xóa giai đoạn này?')) return;
    try {
      await api.delete(`/crm/pipeline-stages/${id}`);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi'); }
  };

  const toggleActive = async (stage) => {
    try {
      await api.put(`/crm/pipeline-stages/${stage.id}`, { is_active: !stage.is_active });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const moveStage = async (stage, dir) => {
    const list = filtered.slice();
    const idx = list.findIndex(s => s.id === stage.id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === list.length - 1)) return;
    [list[idx], list[idx + dir]] = [list[idx + dir], list[idx]];
    const reorder = list.map((s, i) => ({ id: s.id, order_index: i + 1 }));
    try {
      await api.put('/crm/pipeline-stages-reorder', { stages: reorder });
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const renderPipeline = (type, list) => (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm ${type === 'lead' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            {type === 'lead' ? '🎯' : '💰'}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Pipeline {type === 'lead' ? 'Lead' : 'Deal'}</h2>
            <p className="text-[10px] text-gray-500">{list.length} giai đoạn</p>
          </div>
        </div>
        <button onClick={() => startAdd(type)}
          className="h-8 px-3 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> Thêm
        </button>
      </div>

      {/* Pipeline Visual */}
      <div className="p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {list.map((s, i) => (
            <div key={s.id} className="flex items-center shrink-0">
              <div
                onClick={() => startEdit(s)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:scale-105 border-2 ${
                  !s.is_active ? 'opacity-40 border-dashed' : 'border-transparent'
                } ${editId === s.id ? 'ring-2 ring-blue-500' : ''}`}
                style={{ backgroundColor: s.color + '20', color: s.color, borderColor: editId === s.id ? '#3B82F6' : s.is_active ? 'transparent' : s.color }}
              >
                {s.icon && <span className="mr-1">{s.icon}</span>}
                {s.name}
                {s.is_won && <Trophy className="inline h-3 w-3 ml-1" />}
                {s.is_lost && <XCircle className="inline h-3 w-3 ml-1" />}
              </div>
              {i < list.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 mx-0.5 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stages List */}
      <div className="border-t">
        {list.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 ${!s.is_active ? 'opacity-50' : ''}`}>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveStage(s, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▲</button>
              <button onClick={() => moveStage(s, 1)} disabled={i === list.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-20 cursor-pointer text-[10px]">▼</button>
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: s.color }}>
              {s.order_index}
            </div>
            <span className="text-lg shrink-0">{s.icon || '📋'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
              <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                {s.is_won && <span className="text-emerald-600 font-bold">✅ Thắng</span>}
                {s.is_lost && <span className="text-red-500 font-bold">❌ Thua/Mất</span>}
                {!s.is_active && <span className="text-orange-500">Ẩn</span>}
                {s.sync_role === 'vc_delivery' && <span className="text-blue-600 font-medium">🚚 Vận chuyển (VC→CRM)</span>}
                {s.sync_role === 'vc_installation' && <span className="text-amber-700 font-medium">🔧 Lắp đặt (VC→CRM)</span>}
                {s.sync_role === 'vc_customer_care' && <span className="text-teal-700 font-medium">🤝 CSKH (VC→CRM)</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {s.pipeline_type === 'deal' && (
                <button
                  type="button"
                  onClick={() => toggleZaloColumn(s)}
                  className={`h-7 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer border ${
                    s.send_zalo_on_enter
                      ? 'bg-sky-100 text-sky-800 border-sky-300'
                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-sky-200'
                  }`}
                  title="Khi deal kéo vào cột này: gửi tin Zalo OA (khuyến nghị chỉ bật trên cột tên «Hoàn thành»; cần bật OA + token/template)"
                >
                  <MessageCircle className="h-3 w-3" />
                  Zalo
                </button>
              )}
              <button onClick={() => toggleActive(s)} className="p-1.5 rounded hover:bg-gray-100 cursor-pointer" title={s.is_active ? 'Ẩn' : 'Hiện'}>
                {s.is_active ? <Eye className="h-3.5 w-3.5 text-gray-400" /> : <EyeOff className="h-3.5 w-3.5 text-orange-400" />}
              </button>
              <button onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600 cursor-pointer">
                <Save className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => del(s.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {adding === type && (
        <div className="p-4 border-t bg-blue-50/50">
          <StageForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => setAdding(null)} pipelineType={type} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cài đặt Pipeline</h1>
            <p className="text-sm text-gray-500">Quản lý giai đoạn cho Lead và Deal</p>
          </div>
        </div>
      </div>

      {/* Zalo OA — bật/tắt + test gửi tin */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-sky-900 flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Zalo OA — tin qua SĐT
          </h2>
          {zaloLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
          ) : (
            <label className="flex items-center gap-2 text-xs font-medium text-sky-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!zaloSettings?.enabled}
                onChange={(e) => {
                  saveZaloMaster({ enabled: e.target.checked });
                }}
                className="rounded border-sky-400"
              />
              Bật gửi Zalo khi deal vào cột đã tích «Zalo»
            </label>
          )}
        </div>
        <p className="text-[11px] text-sky-800 leading-relaxed">
          Lưu <strong>access_token</strong> từ Zalo Cloud. <strong>template_id</strong> là mẫu “tin qua SĐT” của OA bạn — để trống thì hệ thống dùng mặc định <strong>566121</strong> (biến{' '}
          <code className="text-[10px] bg-white/80 px-0.5 rounded">ten_san_pham</code>,{' '}
          <code className="text-[10px] bg-white/80 px-0.5 rounded">order_code</code>,{' '}
          <code className="text-[10px] bg-white/80 px-0.5 rounded">date</code>,{' '}
          <code className="text-[10px] bg-white/80 px-0.5 rounded">ten_khach_hang</code> — tự lấy từ deal/khách khi deal vào cột <strong>Hoàn thành</strong>). Ở pipeline <strong>Deal</strong>, thêm cột tên «Hoàn thành» (nếu chưa có), rồi bấm <strong>Zalo</strong> trên đúng cột đó để bật tự gửi (mỗi deal + cột tối đa một lần gửi thành công). Chế độ <strong>3</strong> chỉ khi OA được whitelist vượt hạn mức.
        </p>
        <div className="rounded-lg border border-sky-200 bg-white/90 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Cấu trúc template_data (key = biến OA)</label>
            <button
              type="button"
              onClick={() => setZaloStructureJson(DEFAULT_ZALO_TEMPLATE_STRUCTURE_DISPLAY)}
              className="text-[10px] px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 cursor-pointer"
            >
              Mặc định 4 biến
            </button>
          </div>
          <p className="text-[10px] text-sky-800 leading-relaxed">
            Chỉnh các <strong>key</strong> cho khớp template trên Zalo Cloud. Nút <strong>Gửi Zalo</strong> trên chi tiết deal đọc cấu hình này từ server — không cần chỉnh trình duyệt. Xóa hết nội dung ô rồi lưu = dùng lại mặc định 4 biến phía server.
          </p>
          <textarea
            value={zaloStructureJson}
            onChange={(e) => setZaloStructureJson(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full font-mono text-[11px] border border-sky-200 rounded-lg px-2 py-1.5 bg-white"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Template ID</label>
            <input
              value={zaloSettings?.template_id || ''}
              onChange={(e) => setZaloSettings((p) => ({ ...(p || {}), template_id: e.target.value }))}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
              placeholder="566121 hoặc ID mẫu OA — để trống = 566121"
            />
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Chế độ gửi</label>
            <select
              value={zaloSettings?.sending_mode || '1'}
              onChange={(e) => setZaloSettings((p) => ({ ...(p || {}), sending_mode: e.target.value }))}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
            >
              <option value="1">1 — Gửi thường</option>
              <option value="3">3 — Vượt hạn mức (OA whitelist)</option>
            </select>
            <label className="text-[10px] font-semibold text-sky-800 uppercase">Access token (để trống nếu giữ token đã lưu)</label>
            <input
              type="password"
              value={zaloTestToken}
              onChange={(e) => setZaloTestToken(e.target.value)}
              className="w-full h-8 px-2 rounded-lg border border-sky-200 text-xs bg-white"
              placeholder={zaloSettings?.has_token ? '•••• đã lưu — nhập mới để thay' : 'Dán access_token'}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={saveZaloForm}
              className="h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 cursor-pointer"
            >
              Lưu cấu hình Zalo
            </button>
            <p className="text-[10px] text-sky-700">Token đã lưu: {zaloSettings?.has_token ? 'Có' : 'Chưa'}</p>
          </div>
          <div className="space-y-2 bg-white/80 rounded-lg p-3 border border-sky-100">
            <p className="text-[10px] font-bold text-gray-700 uppercase">Gửi thử API</p>
            <div className="flex flex-wrap gap-1.5">
              {ZALO_TEST_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyZaloTestPreset(p)}
                  className="text-[10px] px-2 py-1 rounded-md border border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              value={zaloTestPhone}
              onChange={(e) => setZaloTestPhone(e.target.value)}
              className="w-full h-8 px-2 rounded border text-xs"
              placeholder="SĐT (VD 0987654321 hoặc 84987654321)"
            />
            <input
              value={zaloTestTemplateId}
              onChange={(e) => setZaloTestTemplateId(e.target.value)}
              className="w-full h-8 px-2 rounded border text-xs"
              placeholder="Template ID (tuỳ chọn, mặc định lấy từ cấu hình)"
            />
            <textarea
              value={zaloTestJson}
              onChange={(e) => setZaloTestJson(e.target.value)}
              rows={8}
              className="w-full px-2 py-1.5 rounded border text-[11px] font-mono leading-snug"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={zaloTestSending}
              onClick={runZaloTest}
              className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 cursor-pointer disabled:opacity-50 flex items-center gap-1"
            >
              {zaloTestSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Gửi thử
            </button>
            {zaloTestResult && (
              <>
                <pre className="text-[10px] bg-gray-900 text-green-200 p-2 rounded overflow-x-auto max-h-40">
                  {JSON.stringify(zaloTestResult, null, 2)}
                </pre>
                {!zaloTestResult.ok && zaloTestResult.hint_vi && (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 leading-snug">
                    {zaloTestResult.hint_vi}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-violet-600" />
          Zalo OA theo từng pipeline CRM
        </h2>
        {pipelinesLoadError && (
          <div
            className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
              pipelinesLoadError.code === 'CRM_PIPELINES_TABLE_MISSING'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <p className="font-semibold mb-1">
              {pipelinesLoadError.code === 'CRM_PIPELINES_TABLE_MISSING'
                ? 'Chưa có bảng crm_pipelines trên database'
                : 'Không tải pipeline'}
            </p>
            <p className="whitespace-pre-wrap">{pipelinesLoadError.message}</p>
          </div>
        )}
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Deal có trường <strong>pipeline</strong>: khi gửi Zalo (deal ở cột «Hoàn thành»), hệ thống lấy{' '}
          <strong>template_id</strong> và <strong>merge_template_data</strong> của pipeline đó; nếu để trống thì dùng cấu hình chung ở khối «Zalo OA — tin qua SĐT» phía trên. Merge của pipeline <strong>ghi đè</strong> key trùng với merge chung.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-[11px] text-gray-700 min-w-[220px] flex-1">
            <span className="font-semibold">Chọn pipeline</span>
            <select
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              value={zaloPlId}
              onChange={(e) => setZaloPlId(e.target.value)}
            >
              {pipelines.length === 0 && <option value="">— Chưa có pipeline —</option>}
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.company?.name ? ` — ${p.company.name}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {zaloPlId && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="text-gray-700 font-semibold">Template ID (riêng pipeline)</span>
              <input
                value={zaloPlTemplateId}
                onChange={(e) => setZaloPlTemplateId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                placeholder="VD 566121 — để trống: dùng template chung / mặc định"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="text-gray-700 font-semibold">merge_template_data (JSON object, tùy chọn)</span>
              <textarea
                value={zaloPlMergeJson}
                onChange={(e) => setZaloPlMergeJson(e.target.value)}
                rows={6}
                className="w-full font-mono text-[11px] border border-gray-200 rounded-lg px-2 py-1.5"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              disabled={zaloPlSaving}
              onClick={savePipelineZalo}
              className="h-9 px-4 rounded-lg bg-violet-700 text-white text-sm font-medium hover:bg-violet-800 disabled:opacity-50 cursor-pointer"
            >
              {zaloPlSaving ? 'Đang lưu…' : 'Lưu Zalo cho pipeline này'}
            </button>
          </div>
        )}
      </div>

      {/* Edit Form (floating) */}
      {editId && (
        <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-lg">
          <h3 className="text-sm font-bold text-gray-800 mb-3">✏️ Sửa giai đoạn</h3>
          <StageForm
            form={form}
            setForm={setForm}
            onSave={saveEdit}
            onCancel={() => setEditId(null)}
            pipelineType={stages.find((s) => s.id === editId)?.pipeline_type || 'lead'}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderPipeline('lead', stages.filter(s => s.pipeline_type === 'lead').sort((a, b) => a.order_index - b.order_index))}
          {renderPipeline('deal', stages.filter(s => s.pipeline_type === 'deal').sort((a, b) => a.order_index - b.order_index))}
        </div>
      )}
    </div>
  );
}

function StageForm({ form, setForm, onSave, onCancel, pipelineType = 'lead' }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Tên giai đoạn *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full h-8 px-3 border rounded-lg text-sm" placeholder="VD: Đang tư vấn" />
        </div>
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">Icon</label>
          <div className="flex flex-wrap gap-1">
            {ICONS.map(ic => (
              <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
                className={`w-7 h-7 rounded text-sm cursor-pointer ${form.icon === ic ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-gray-50 hover:bg-gray-100'}`}>
                {ic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-medium text-gray-500 block mb-1">Màu</label>
        <div className="flex gap-1.5">
          {COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
              className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_won} onChange={e => setForm(f => ({ ...f, is_won: e.target.checked, is_lost: false }))}
            className="rounded" />
          <Trophy className="h-3.5 w-3.5 text-emerald-500" /> Giai đoạn Thắng
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={form.is_lost} onChange={e => setForm(f => ({ ...f, is_lost: e.target.checked, is_won: false }))}
            className="rounded" />
          <XCircle className="h-3.5 w-3.5 text-red-500" /> Giai đoạn Thua/Mất
        </label>
        {pipelineType === 'deal' && (
          <label className="flex items-center gap-2 text-xs cursor-pointer text-sky-800 bg-sky-50 px-2 py-1 rounded-lg border border-sky-200">
            <input
              type="checkbox"
              checked={!!form.send_zalo_on_enter}
              onChange={(e) => setForm((f) => ({ ...f, send_zalo_on_enter: e.target.checked }))}
              className="rounded border-sky-400"
            />
            <MessageCircle className="h-3.5 w-3.5" /> Tự gửi Zalo OA khi deal vào cột này (nên dùng cho cột «Hoàn thành»)
          </label>
        )}
      </div>

      {pipelineType === 'deal' && !form.is_won && !form.is_lost && (
        <div>
          <label className="text-[10px] font-medium text-gray-500 block mb-1">
            Vai trò đồng bộ từ Vận chuyển & Lắp đặt (sync_role)
          </label>
          <select
            value={form.sync_role || ''}
            onChange={(e) => setForm((f) => ({ ...f, sync_role: e.target.value }))}
            className="w-full h-8 px-2 border rounded-lg text-xs bg-white"
          >
            <option value="">— Không đồng bộ —</option>
            <option value="vc_delivery">🚚 Nhận deal khi VC chuyển sang «Vận chuyển thành công»</option>
            <option value="vc_installation">🔧 Nhận deal khi VC chuyển sang «Lắp đặt thành công»</option>
            <option value="vc_customer_care">🤝 Nhận deal khi VC chuyển sang «Chăm sóc KH / Bảo hành»</option>
          </select>
          <p className="text-[10px] text-gray-400 mt-1">
            Khi cột VC pipeline được đánh dấu đồng bộ, hệ thống tìm cột CRM có sync_role tương ứng và cập nhật deal.
          </p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="h-8 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs cursor-pointer">Hủy</button>
        <button onClick={onSave} className="h-8 px-4 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 cursor-pointer flex items-center gap-1">
          <Save className="h-3.5 w-3.5" /> Lưu
        </button>
      </div>
    </div>
  );
}
