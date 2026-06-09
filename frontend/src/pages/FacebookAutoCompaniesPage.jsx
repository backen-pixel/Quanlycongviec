import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Loader2, Power, Play, RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import { isAdminLike } from '../lib/adminRole';
import { useAuth } from '../lib/auth';
import {
  useBatchAutoAll,
  setMaster,
  toggleBatchAuto,
  triggerPipelineNow,
  loadStatusAll,
} from '../hooks/useBatchAutoRun';

const GLOBAL_KEY = '__global__';

function fmtTime(ts) {
  if (!ts) return '--';
  try {
    return new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return '--';
  }
}

function StatusBadge({ st }) {
  if (st.running) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
        <Loader2 className="h-3 w-3 animate-spin" /> Đang chạy · vòng {st.cycleCount || 0}
      </span>
    );
  }
  if (st.enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
        ⏳ Đã bật (chờ master / chu kỳ)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
      ⏹️ Tắt
    </span>
  );
}

function CompanyCard({ st, name, masterEnabled, busy, onToggle, onRunNow }) {
  const kpi = st.kpi || {};
  const lastLog = Array.isArray(st.logs) && st.logs.length ? st.logs[st.logs.length - 1] : null;
  const isGlobal = st.company_key === GLOBAL_KEY || st.company_id == null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 truncate">
              {isGlobal ? '🌐 Toàn hệ thống' : `🏢 ${name || 'Công ty'}`}
            </span>
          </div>
          <div className="mt-1"><StatusBadge st={st} /></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRunNow}
            disabled={busy || !masterEnabled || st.running}
            title={!masterEnabled ? 'Bật công tắc tổng trước' : 'Chạy ngay 1 vòng'}
            className="px-2.5 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition"
          >
            <Play size={12} /> Chạy
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy || !masterEnabled}
            title={!masterEnabled ? 'Bật công tắc tổng trước' : st.enabled ? 'Tắt auto công ty này' : 'Bật auto công ty này'}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              st.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                st.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-purple-50 rounded-lg p-2">
          <div className="text-base font-bold text-purple-700">{kpi.leadPhones || 0}</div>
          <div className="text-[10px] text-purple-600">Lead</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2">
          <div className="text-base font-bold text-amber-700">{kpi.contactPhones || 0}</div>
          <div className="text-[10px] text-amber-600">SĐT quét</div>
        </div>
        <div className="bg-green-50 rounded-lg p-2">
          <div className="text-base font-bold text-green-700">{kpi.messagesSynced || 0}</div>
          <div className="text-[10px] text-green-600">Tin đồng bộ</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="text-base font-bold text-gray-700">{kpi.contactsProcessed || 0}</div>
          <div className="text-[10px] text-gray-500">Contact</div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 flex items-center justify-between">
        <span>Engine: <strong className="text-gray-700">{st.pipelineConfig?.engine || '—'}</strong></span>
        <span>Cập nhật: {fmtTime(st.lastUpdatedAt)}</span>
      </div>

      {lastLog && (
        <div
          className={`text-[11px] font-mono px-2 py-1.5 rounded-lg truncate ${
            lastLog.status === 'error'
              ? 'bg-red-50 text-red-600'
              : lastLog.status === 'ok'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-50 text-gray-600'
          }`}
          title={lastLog.text}
        >
          {lastLog.text}
        </div>
      )}
    </div>
  );
}

export function FacebookAutoCompaniesPanel({ embedded = false }) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const all = useBatchAutoAll();
  const [companies, setCompanies] = useState([]);
  const [masterSaving, setMasterSaving] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    api
      .get('/companies?for_module=crm')
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, []);

  const nameById = useMemo(() => {
    const m = {};
    companies.forEach((c) => { m[String(c.id)] = c.short_name || c.name || 'Công ty'; });
    return m;
  }, [companies]);

  const rows = useMemo(() => {
    const list = [...(all.companies || [])];
    list.sort((a, b) => {
      const ra = a.running ? 0 : a.enabled ? 1 : 2;
      const rb = b.running ? 0 : b.enabled ? 1 : 2;
      if (ra !== rb) return ra - rb;
      return String(nameById[a.company_id] || a.company_key).localeCompare(String(nameById[b.company_id] || b.company_key));
    });
    return list;
  }, [all.companies, nameById]);

  const onToggleMaster = useCallback(async () => {
    setMasterSaving(true);
    try {
      await setMaster(!all.master_enabled);
    } finally {
      setMasterSaving(false);
    }
  }, [all.master_enabled]);

  const onToggleCompany = useCallback(async (st) => {
    const cid = st.company_id || null;
    setBusyKey(st.company_key);
    try {
      await toggleBatchAuto(cid);
    } finally {
      setBusyKey(null);
    }
  }, []);

  const onRunNow = useCallback(async (st) => {
    const cid = st.company_id || null;
    setBusyKey(st.company_key);
    try {
      await triggerPipelineNow(cid);
    } finally {
      setBusyKey(null);
    }
  }, []);

  const runningCount = rows.filter((r) => r.running).length;
  const enabledCount = rows.filter((r) => r.enabled).length;

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          Trang này chỉ dành cho quản trị.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          {!embedded && (
            <Link to="/crm/facebook" className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-1">
              <ArrowLeft size={12} /> Facebook
            </Link>
          )}
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-600" /> Auto Facebook theo công ty
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Mỗi công ty chạy độc lập trên các page có <code className="text-[10px]">default_company_id</code> của công ty đó.
            Đang chạy: <strong>{runningCount}</strong> · Đã bật: <strong>{enabledCount}</strong> · Tổng: <strong>{rows.length}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadStatusAll()}
            className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} /> Làm mới
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-gray-200" title="Công tắc tổng: tắt sẽ dừng auto của tất cả công ty">
            <Power size={15} className={all.master_enabled ? 'text-indigo-600' : 'text-gray-400'} />
            <span className="text-xs font-semibold text-gray-700">Công tắc tổng</span>
            <button
              type="button"
              onClick={onToggleMaster}
              disabled={masterSaving}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                all.master_enabled ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  all.master_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-xs font-medium ${all.master_enabled ? 'text-indigo-600' : 'text-gray-400'}`}>
              {all.master_enabled ? 'BẬT' : 'TẮT'}
            </span>
          </div>
        </div>
      </div>

      {!all.master_enabled && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          Công tắc tổng đang TẮT — không công ty nào chạy auto. Bật để cho phép các công ty đã bật chạy lại.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          Chưa có công ty nào được cấu hình auto. Vào tab Facebook → bật auto cho công ty (theo bộ lọc công ty) để xuất hiện ở đây.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((st) => (
            <CompanyCard
              key={st.company_key}
              st={st}
              name={nameById[st.company_id]}
              masterEnabled={all.master_enabled}
              busy={busyKey === st.company_key}
              onToggle={() => onToggleCompany(st)}
              onRunNow={() => onRunNow(st)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FacebookAutoCompaniesPage() {
  return <FacebookAutoCompaniesPanel />;
}
