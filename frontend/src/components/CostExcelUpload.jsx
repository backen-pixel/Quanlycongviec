import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../lib/api';
import { doSoTien } from './GiaVonExcelModal';
import { costTypeModuleShort } from '../lib/costTypeModules';
import { formatVND } from '../lib/utils';

function chuanHoa(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const AMOUNT_HEADERS = [
  'thanh tien', 'thanh tien (vnd)', 'so tien', 'chi phi', 'gia von', 'tong tien',
  'amount', 'cost', 'total', 'gia', 'tien', 'thanh_tien',
];

function pickAmountColumn(header) {
  const idx = header.findIndex((h) => AMOUNT_HEADERS.includes(chuanHoa(h)));
  if (idx >= 0) return idx;
  return header.findIndex((h) => {
    const k = chuanHoa(h);
    return AMOUNT_HEADERS.some((t) => k.includes(t));
  });
}

export function sumExcelMoney(fileBuffer) {
  const wb = XLSX.read(fileBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return { amount: 0, rowCount: 0 };
  const header = (rows[0] || []).map((c) => String(c || ''));
  let col = pickAmountColumn(header);
  const body = rows.slice(1).filter((r) => (r || []).some((c) => String(c).trim() !== ''));
  if (col < 0) {
    // Không có tiêu đề tiền → cộng số ở cột cuối có nhiều số.
    const counts = [];
    body.forEach((r) => {
      (r || []).forEach((c, i) => {
        if (doSoTien(c) != null) counts[i] = (counts[i] || 0) + 1;
      });
    });
    let best = -1;
    let bestN = 0;
    counts.forEach((n, i) => { if (n > bestN) { bestN = n; best = i; } });
    col = best;
  }
  let amount = 0;
  let rowCount = 0;
  if (col >= 0) {
    body.forEach((r) => {
      const n = doSoTien(r?.[col]);
      if (n != null) {
        amount += n;
        rowCount += 1;
      }
    });
  }
  return { amount, rowCount };
}

export default function CostExcelUpload({ projectId, costTypes, uploads, onUploaded }) {
  const inputRef = useRef(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [pendingType, setPendingType] = useState(null);
  const byType = new Map((uploads || []).map((u) => [String(u.cost_type_id), u]));
  const types = (costTypes || []).filter((t) => t.is_active !== false);

  if (!types.length) return null;

  const pickFile = (type) => {
    setPendingType(type);
    setError('');
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const type = pendingType;
    setPendingType(null);
    if (!file || !type || !projectId) return;
    if (!/\.(xlsx?|csv)$/i.test(file.name)) {
      setError('Chỉ nhận file .xlsx / .xls / .csv');
      return;
    }
    setBusyId(type.id);
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const { amount, rowCount } = sumExcelMoney(buf);
      await api.post(`/projects/${projectId}/cost-excel`, {
        cost_type_id: type.id,
        amount,
        row_count: rowCount,
        file_name: file.name,
      });
      onUploaded?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Không đọc được Excel');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-2">
        {types.map((t) => {
          const up = byType.get(String(t.id));
          const busy = busyId === t.id;
          return (
            <div key={t.id} className="rounded-lg border border-slate-200 px-3 py-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {t.name}
                  <span className="ml-1 text-[10px] font-medium text-gray-400">{costTypeModuleShort(t.module_key)}</span>
                </p>
                {up ? (
                  <p className="text-xs text-teal-700 mt-0.5">
                    Đã có: {formatVND(up.amount || 0)} · {up.file_name || 'file Excel'}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 mt-0.5">Chưa có file — chọn Excel để nộp</p>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => pickFile(t)}
                className="h-8 px-2 rounded-lg border text-xs font-semibold text-teal-700 inline-flex items-center gap-1 shrink-0 bg-white hover:bg-teal-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (up ? <Upload className="h-3.5 w-3.5" /> : <FileSpreadsheet className="h-3.5 w-3.5" />)}
                {up ? 'Đổi file' : 'Chọn Excel'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
