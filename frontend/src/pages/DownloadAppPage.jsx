import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Download, Loader2, RefreshCw, Smartphone, AlertCircle, CheckCircle2, Package,
} from 'lucide-react';
import api from '../lib/api';
import { resolveApiOrigin } from '../lib/apiOrigin';
import { getModuleAppDownloadConfig } from '../lib/moduleAppDownload';

function formatBytes(n) {
  if (!n) return '—';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

function formatDateVN(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function apkFilename(info, appKey) {
  if (!info?.version) return `${appKey || 'app'}-release.apk`;
  const code = info.versionCode != null ? `-code${info.versionCode}` : '';
  return `${appKey}-${info.version}${code}-release.apk`;
}

const ACCENT = {
  blue: {
    ring: 'ring-blue-100',
    bg: 'bg-blue-600',
    bgSoft: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    btn: 'bg-blue-600 hover:bg-blue-700',
  },
  emerald: {
    ring: 'ring-emerald-100',
    bg: 'bg-emerald-600',
    bgSoft: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  orange: {
    ring: 'ring-orange-100',
    bg: 'bg-orange-600',
    bgSoft: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    btn: 'bg-orange-600 hover:bg-orange-700',
  },
};

function resolveDownloadModule(pathname) {
  if (pathname.startsWith('/sx/')) return 'sx';
  if (pathname.startsWith('/vc/')) return 'vc';
  return 'crm';
}

export default function DownloadAppPage() {
  const { pathname } = useLocation();
  const module = resolveDownloadModule(pathname);
  const config = getModuleAppDownloadConfig(module);
  const accent = ACCENT[config?.accent || 'blue'] || ACCENT.blue;

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!config?.appKey) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/app-updates/latest', { params: { app: config.appKey } });
      setInfo(data);
    } catch (e) {
      setInfo(null);
      setError(e.response?.data?.error || e.message || 'Không tải được thông tin bản phát hành');
    } finally {
      setLoading(false);
    }
  }, [config?.appKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadHref = useMemo(() => {
    if (!info?.downloadUrl) return '';
    const url = String(info.downloadUrl);
    if (/^https?:\/\//i.test(url)) return url;
    const base = resolveApiOrigin();
    return base ? `${base}${url.startsWith('/') ? url : `/${url}`}` : url;
  }, [info?.downloadUrl]);

  if (!config) {
    return (
      <div className="max-w-lg mx-auto p-8 text-center text-gray-500">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
        <p>Không tìm thấy cấu hình app cho module này.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className={`rounded-2xl border ${accent.border} bg-white shadow-sm overflow-hidden`}>
        <div className={`px-6 py-8 ${accent.bgSoft} border-b ${accent.border}`}>
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl ${accent.bg} text-white flex items-center justify-center text-3xl shadow-md shrink-0`}>
              {config.emoji}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black text-gray-900">{config.title}</h1>
              <p className="text-sm text-gray-600 mt-1">{config.subtitle}</p>
              <p className="text-xs text-gray-400 mt-2 font-mono">{config.packageName}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center py-10 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm mt-3">Đang kiểm tra bản phát hành…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !info?.available ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-4 text-sm text-amber-800">
              <p className="font-semibold">Chưa có bản APK trên server</p>
              <p className="mt-1 text-amber-700">
                Admin cần upload bản phát hành tại trang <strong>Cập nhật App</strong> và bật trạng thái active.
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-xl border ${accent.border} ${accent.bgSoft} px-4 py-4 flex items-center gap-3`}>
                <CheckCircle2 className={`h-6 w-6 ${accent.text} shrink-0`} />
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bản mới nhất</p>
                  <p className="text-xl font-black text-gray-900">
                    v{info.version}
                    {info.versionCode != null && (
                      <span className="text-sm font-bold text-gray-500 ml-2">(code {info.versionCode})</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase">Dung lượng</p>
                  <p className="font-bold text-gray-800 mt-0.5">{formatBytes(info.size)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase">Phát hành</p>
                  <p className="font-bold text-gray-800 mt-0.5">{formatDateVN(info.publishedAt)}</p>
                </div>
              </div>

              {info.releaseNotes ? (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Ghi chú phiên bản</p>
                  <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {info.releaseNotes}
                  </div>
                </div>
              ) : null}

              <a
                href={downloadHref}
                download={apkFilename(info, config.appKey)}
                className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-white font-bold text-base shadow-sm transition-colors ${accent.btn}`}
              >
                <Download className="h-5 w-5" />
                Tải APK đầy đủ
              </a>

              <p className="text-xs text-gray-500 leading-relaxed flex gap-2">
                <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{config.installHint}</span>
              </p>
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Nguồn: Cập nhật App (server)
            </p>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
