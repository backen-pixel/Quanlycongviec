import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import SxCompanyPickList from './SxCompanyPickList';
import {
  orderWorkshopTypesPreferredFirst,
  preferredWorkshopTypeIdForCompany,
  workshopTypeMatchesSxKind,
  workshopTypePreferredForLeadType,
} from '../lib/sxCompanySuggestFromLeadType';

const emptyRow = () => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  companyId: '',
  workshopTypeId: '',
  workshopTypes: [],
  loading: false,
});

/**
 * Chọn nhiều cặp (công ty SX + phân loại) cho 1 deal.
 * onChange(rows) — rows: [{ companyId, workshopTypeId }]
 */
export default function SxMultiTargetPicker({
  companies = [],
  leadTypeRow = null,
  kind = null,
  accent = 'teal',
  disabled = false,
  initialRows = null,
  onChange,
  minRows = 1,
  maxRows = 5,
}) {
  const [rows, setRows] = useState(() => {
    if (Array.isArray(initialRows) && initialRows.length) {
      return initialRows.map((r) => ({
        ...emptyRow(),
        companyId: r.companyId || r.production_company_id || '',
        workshopTypeId: r.workshopTypeId || r.workshop_type_id || '',
      }));
    }
    return [emptyRow()];
  });

  const emit = useCallback((next) => {
    setRows(next);
    onChange?.(next.map((r) => ({
      companyId: r.companyId,
      workshopTypeId: r.workshopTypeId,
      production_company_id: r.companyId,
      workshop_type_id: r.workshopTypeId || null,
    })));
  }, [onChange]);

  const loadTypes = useCallback(async (rowKey, companyId) => {
    if (!companyId) return;
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, loading: true, workshopTypes: [] } : r)));
    try {
      const { data } = await api.get('/workshop/project-types', {
        params: { company_id: companyId, module: 'production' },
      });
      const list = Array.isArray(data) ? data : (data?.types || data?.data || []);
      const ordered = orderWorkshopTypesPreferredFirst(
        list,
        kind,
        preferredWorkshopTypeIdForCompany(leadTypeRow, companyId),
      );
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.key !== rowKey) return r;
          const pref = preferredWorkshopTypeIdForCompany(leadTypeRow, companyId);
          const autoType = pref && ordered.some((t) => String(t.id) === String(pref))
            ? String(pref)
            : (r.workshopTypeId || '');
          return {
            ...r,
            loading: false,
            workshopTypes: ordered,
            workshopTypeId: autoType,
          };
        });
        onChange?.(next.map((r) => ({
          companyId: r.companyId,
          workshopTypeId: r.workshopTypeId,
          production_company_id: r.companyId,
          workshop_type_id: r.workshopTypeId || null,
        })));
        return next;
      });
    } catch {
      setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, loading: false, workshopTypes: [] } : r)));
    }
  }, [kind, leadTypeRow, onChange]);

  useEffect(() => {
    rows.forEach((r) => {
      if (r.companyId && !r.workshopTypes.length && !r.loading) {
        void loadTypes(r.key, r.companyId);
      }
    });
    // chỉ hydrate lần đầu khi đã có companyId sẵn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCompany = (key, companyId) => {
    const next = rows.map((r) => (
      r.key === key
        ? { ...r, companyId, workshopTypeId: '', workshopTypes: [], loading: !!companyId }
        : r
    ));
    emit(next);
    if (companyId) void loadTypes(key, companyId);
  };

  const setType = (key, workshopTypeId) => {
    emit(rows.map((r) => (r.key === key ? { ...r, workshopTypeId } : r)));
  };

  const addRow = () => {
    if (rows.length >= maxRows || disabled) return;
    emit([...rows, emptyRow()]);
  };

  const removeRow = (key) => {
    if (rows.length <= minRows || disabled) return;
    emit(rows.filter((r) => r.key !== key));
  };

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const types = orderWorkshopTypesPreferredFirst(
          row.workshopTypes,
          kind,
          preferredWorkshopTypeIdForCompany(leadTypeRow, row.companyId),
        );
        return (
          <div key={row.key} className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-700">
                Xưởng {idx + 1}
              </span>
              {rows.length > minRows && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRow(row.key)}
                  className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa
                </button>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Công ty sản xuất *
                {(kind || leadTypeRow) ? (
                  <span className="ml-1 font-normal text-gray-500">
                    (<span className="text-red-600 font-bold">★</span> = gợi ý)
                  </span>
                ) : null}
              </label>
              <SxCompanyPickList
                companies={companies}
                value={row.companyId}
                leadTypeRow={leadTypeRow}
                kind={kind}
                accent={accent}
                disabled={disabled}
                onChange={(id) => setCompany(row.key, id)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Phân loại *</label>
              <select
                value={row.workshopTypeId}
                onChange={(e) => setType(row.key, e.target.value)}
                disabled={!row.companyId || row.loading || disabled}
                className="mt-1 w-full h-10 px-3 border rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {!row.companyId
                    ? '— Chọn công ty trước —'
                    : row.loading
                      ? 'Đang tải…'
                      : types.length === 0
                        ? '— Công ty chưa có phân loại —'
                        : '— Chọn phân loại —'}
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {workshopTypePreferredForLeadType(t.id, leadTypeRow, row.companyId)
                      || workshopTypeMatchesSxKind(t.name, kind)
                      ? `★ ${t.name}`
                      : t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
      {rows.length < maxRows && (
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-teal-300 text-teal-700 text-sm font-medium hover:bg-teal-50 disabled:opacity-40 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Thêm công ty SX
        </button>
      )}
    </div>
  );
}

/** Validate rows trước khi submit */
export function validateSxTargets(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return 'Vui lòng chọn ít nhất một công ty Sản xuất.';
  }
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r.companyId && !r.production_company_id) {
      return `Dòng ${i + 1}: chưa chọn công ty SX.`;
    }
    if (!r.workshopTypeId && !r.workshop_type_id) {
      return `Dòng ${i + 1}: chưa chọn phân loại.`;
    }
  }
  return '';
}

export function sxTargetsToApiPayload(rows) {
  return (rows || [])
    .filter((r) => r.companyId || r.production_company_id)
    .map((r) => ({
      production_company_id: r.companyId || r.production_company_id,
      workshop_type_id: r.workshopTypeId || r.workshop_type_id || null,
    }));
}
