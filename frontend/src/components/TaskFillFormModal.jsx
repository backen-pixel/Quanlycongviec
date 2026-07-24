import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Loader2, Upload, FileText, CheckCircle2, HelpCircle, Link2, Calendar, Trash2, Film, FileImage } from 'lucide-react';
import api from '../lib/api';
import { compressImage } from '../lib/compressImage';
import { publicFileUrl, getFileOpenAnchorProps } from '../lib/publicFileUrl';
import { TASK_ATTACHMENT_FILE_ACCEPT } from '../lib/attachmentFileIcon';
import {
  normalizeFormConfig,
  normalizeFormData,
  validateFormValues,
  groupFormFields,
  FIELD_GROUP_META,
  SURVEY_LINKED_FIELD_IDS,
  buildSurveyPrefill,
  pickSurveyEvent,
  dateInputToEventIso,
  resolveLeadSiteAddress,
  resolveSurveyAddress,
  leadBudgetInMillions,
  getDimensionSchemaForCabinet,
  resolveCabinetTypeId,
  CABINET_TYPE_OPTIONS,
  DEFAULT_DIMENSION_KEYS,
} from '../lib/taskFillForm';
import { formatDateTime, formatVND } from '../lib/utils';

/** Chuỗi nhập tiền (triệu): `.` = ngăn nghìn, `,` = thập phân (kiểu VN). */
function parseMoneyMillionsInput(raw) {
  let s = String(raw ?? '').replace(/[^\d,.\-]/g, '').trim();
  if (!s || s === '-' || s === '.' || s === ',') return '';
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : '';
}

/** Hiển thị số triệu có dấu ngăn cách: 1250 → "1.250" */
function formatMoneyMillionsDisplay(val) {
  if (val === '' || val == null) return '';
  const n = Number(val);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

function fileMetaName(file) {
  return String(file?.file_name || file?.name || file?.file_url || file?.preview_url || '');
}

function isImageFileMeta(file) {
  const mime = String(file?.mime_type || file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(fileMetaName(file));
}

function isVideoFileMeta(file) {
  const mime = String(file?.mime_type || file?.type || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i.test(fileMetaName(file));
}

function detectFileKind(file) {
  if (isImageFileMeta(file)) return 'image';
  if (isVideoFileMeta(file)) return 'video';
  return 'file';
}

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeUploadRow(up, file) {
  if (!up || typeof up !== 'object') return null;
  // Một số endpoint bọc { data }, { file }, { uploaded: [...] }
  const row = up.file_url || up.url
    ? up
    : (up.file || up.data || (Array.isArray(up.uploaded) ? up.uploaded[0] : null) || (Array.isArray(up.files) ? up.files[0] : null) || up);
  if (!row || typeof row !== 'object') return null;
  const file_url = row.file_url || row.url || row.publicUrl || row.public_url || null;
  if (!file_url || String(file_url).startsWith('data:')) return null;
  return {
    file_url,
    file_name: row.original_name || row.file_name || file?.name || 'File',
    file_size: row.file_size || row.size || file?.size || 0,
    mime_type: row.mime_type || row.content_type || file?.type || '',
  };
}

async function uploadOneRawFile(file) {
  const isImage = file.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name || '');
  if (isImage) {
    const compressed = await compressImage(file);
    const formData = new FormData();
    // Chỉ append 1 field — tránh upload trùng (files + file)
    formData.append('files', compressed);
    const { data: uploadRes } = await api.post('/upload', formData);
    const rows = uploadRes?.uploaded || uploadRes?.files || (Array.isArray(uploadRes) ? uploadRes : [uploadRes]);
    const list = Array.isArray(rows) ? rows : [rows];
    return list.find((r) => r && (r.file_url || r.url)) || null;
  }
  const isLarge = file.size > 10 * 1024 * 1024 || file.type?.startsWith('video/');
  const endpoint = isLarge ? '/upload/stream' : '/upload/single';
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post(endpoint, formData);
  return data;
}

/** Lấy map fieldId → file[] từ form_data (luôn là mảng). */
function pickFileMapFromValues(values, fields) {
  const map = {};
  for (const f of fields || []) {
    if (f.type !== 'file') continue;
    const v = values?.[f.id];
    if (v == null || v === '') {
      map[f.id] = [];
    } else {
      map[f.id] = (Array.isArray(v) ? v : [v]).filter((x) => x && typeof x === 'object');
    }
  }
  return map;
}

/** Gộp values thường + fileMap (file luôn ưu tiên từ fileMap). */
function mergeFormValues(values, fileMap) {
  const next = { ...(values || {}) };
  for (const [fieldId, list] of Object.entries(fileMap || {})) {
    next[fieldId] = Array.isArray(list) ? list : (list ? [list] : []);
  }
  return next;
}

/** Thẻ xem trước ảnh / video / file — luôn hiện tên, không ẩn khi lỗi tải. */
function MediaPreviewTile({ file, onRemove }) {
  const kind = detectFileKind(file);
  const candidates = [
    file?.preview_url,
    file?.file_url ? publicFileUrl(file.file_url) : '',
  ].filter(Boolean);
  const [srcIdx, setSrcIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = !failed ? (candidates[srcIdx] || '') : '';
  const openHref = file.file_url ? publicFileUrl(file.file_url) : (file.preview_url || '');
  const openProps = openHref ? getFileOpenAnchorProps(openHref, { fileName: file.file_name }) : null;
  const showMedia = !!src && (kind === 'image' || kind === 'video');

  const onMediaError = () => {
    if (srcIdx + 1 < candidates.length) setSrcIdx((i) => i + 1);
    else setFailed(true);
  };

  const fallback = (
    <div className="flex flex-col items-center justify-center gap-1 w-full h-full p-2 text-center bg-slate-50">
      {kind === 'image' ? (
        <FileImage className="h-7 w-7 text-violet-500" />
      ) : kind === 'video' ? (
        <Film className="h-7 w-7 text-purple-600" />
      ) : (
        <FileText className="h-7 w-7 text-emerald-600" />
      )}
      <span className="text-[10px] text-gray-800 font-medium line-clamp-2 break-all">
        {file.file_name || 'File'}
      </span>
      {file.file_size ? (
        <span className="text-[9px] text-gray-500">{formatBytes(file.file_size)}</span>
      ) : null}
    </div>
  );

  const body = !showMedia
    ? fallback
    : kind === 'image' ? (
      <img
        key={src}
        src={src}
        alt={file.file_name || 'Ảnh'}
        className="w-full h-full object-cover"
        onError={onMediaError}
      />
    ) : (
      <video
        key={src}
        src={src}
        className="w-full h-full object-cover bg-black"
        muted
        playsInline
        preload="metadata"
        onError={onMediaError}
      />
    );

  return (
    <div className="relative rounded-lg border-2 border-orange-200 overflow-hidden bg-white aspect-square min-h-[96px] shadow-sm">
      {openProps ? (
        <a {...openProps} className="block w-full h-full" title="Mở file">
          {body}
        </a>
      ) : (
        <div className="w-full h-full">{body}</div>
      )}
      {kind === 'video' && showMedia && (
        <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/60 text-white text-[9px] flex items-center gap-0.5 pointer-events-none">
          <Film className="h-2.5 w-2.5" /> Video
        </span>
      )}
      {file._pending && (
        <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center gap-1 pointer-events-none z-[5]">
          <Loader2 className="h-5 w-5 text-white animate-spin" />
          <span className="text-[9px] text-white">Đang tải…</span>
        </div>
      )}
      {!file._pending && file.file_url && (
        <span className={`absolute top-1 ${kind === 'video' && showMedia ? 'left-14' : 'left-1'} px-1 py-0.5 rounded bg-emerald-600/90 text-white text-[8px] pointer-events-none`}>
          Đã up
        </span>
      )}
      <button
        type="button"
        title="Xóa"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove?.(); }}
        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-600 cursor-pointer z-10"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-5 pb-1.5 pointer-events-none">
        <p className="text-[9px] text-white truncate font-medium">{file.file_name || 'File'}</p>
        {file.file_size ? (
          <p className="text-[8px] text-white/80">{formatBytes(file.file_size)}</p>
        ) : null}
      </div>
    </div>
  );
}

function FieldLabel({ field, linkHint }) {
  return (
    <div className="flex items-start gap-1">
      <span className="text-xs font-semibold text-gray-800 flex-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
        {linkHint && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-1 py-0.5 rounded">
            <Link2 className="h-2.5 w-2.5" /> {linkHint}
          </span>
        )}
      </span>
      {field.help_text ? (
        <span className="relative inline-flex group/tip shrink-0 mt-0.5">
          <HelpCircle className="h-3.5 w-3.5 text-gray-400 hover:text-orange-600 cursor-help" />
          <span className="pointer-events-none absolute right-0 bottom-full mb-1 z-50 w-64 max-w-[70vw] rounded-lg bg-gray-900 text-white text-[11px] leading-snug px-2.5 py-2 opacity-0 group-hover/tip:opacity-100 transition-opacity shadow-xl">
            {field.help_text}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function SectionHeader({ groupKey }) {
  const meta = FIELD_GROUP_META[groupKey];
  if (!meta) return null;
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${meta.className}`}>
      Nhóm {groupKey} — {meta.label}
      <span className="font-normal opacity-80 ml-1">· {meta.hint}</span>
    </div>
  );
}

function fieldLinkHint(fieldId) {
  if (fieldId === SURVEY_LINKED_FIELD_IDS.address) return 'Sự kiện / Lead';
  if (fieldId === SURVEY_LINKED_FIELD_IDS.date) return 'Sự kiện KS';
  if (fieldId === SURVEY_LINKED_FIELD_IDS.surveyor) return 'Sự kiện KS';
  return null;
}

/**
 * Popup điền form — schema từ task.form_config.
 * Prefill + đồng bộ: địa chỉ ↔ lead.install_address; ngày/NV ↔ crm_events site_visit.
 */
export default function TaskFillFormModal({
  leadId,
  task,
  onClose,
  onSaved,
}) {
  const config = normalizeFormConfig(task?.form_config);
  // Ẩn field đã bỏ khỏi phiếu (preset cũ còn next_action)
  let visibleFields = (config.fields || []).filter((f) => f.id !== 'next_action');
  // Nâng cấp form khảo sát cũ: thêm Loại tủ + kích thước theo layout
  const hasCabinetType = visibleFields.some((f) => f.id === 'cabinet_type');
  const roughIdx = visibleFields.findIndex((f) => f.id === 'rough_size' || f.type === 'dimensions');
  if (!hasCabinetType && roughIdx >= 0) {
    const insertAt = Math.max(0, visibleFields.findIndex((f) => f.id === 'project_type') + 1)
      || Math.max(0, roughIdx);
    visibleFields = [
      ...visibleFields.slice(0, insertAt),
      {
        id: 'cabinet_type',
        type: 'single_select',
        label: 'Loại tủ',
        required: true,
        group: 'A',
        help_text: 'I / L / II / C — quyết định ô kích thước.',
        options: CABINET_TYPE_OPTIONS,
      },
      ...visibleFields.slice(insertAt),
    ];
  }
  visibleFields = visibleFields.map((f) => {
    if (f.type !== 'dimensions') return f;
    if (f.by_cabinet_type) return f;
    if (f.id === 'rough_size' || visibleFields.some((x) => x.id === 'cabinet_type')) {
      return { ...f, by_cabinet_type: true, layout_field_id: f.layout_field_id || 'cabinet_type' };
    }
    return f;
  });
  const configView = { ...config, fields: visibleFields };
  const existing = normalizeFormData(task?.form_data);
  // values = text/select/… ; fileMap = riêng cho field file (không bị prefill lead ghi đè)
  const [values, setValues] = useState(() => {
    const init = { ...existing.values };
    for (const f of visibleFields) {
      if (f.type === 'file') delete init[f.id];
    }
    return init;
  });
  const [fileMap, setFileMap] = useState(() => pickFileMapFromValues(existing.values, visibleFields));
  const [saving, setSaving] = useState(false);
  const [loadingLink, setLoadingLink] = useState(true);
  const [uploadingField, setUploadingField] = useState(null);
  const [leadInfo, setLeadInfo] = useState(null);
  const [surveyEvent, setSurveyEvent] = useState(null);
  const [linkNote, setLinkNote] = useState('');
  const fileInputRefs = useRef({});
  const fileMapRef = useRef(fileMap);
  fileMapRef.current = fileMap;

  useEffect(() => {
    let cancelled = false;
    const saved = normalizeFormData(task?.form_data);
    const nextValues = { ...saved.values };
    for (const f of visibleFields) {
      if (f.type === 'file') delete nextValues[f.id];
    }
    setValues(nextValues);
    // Chỉ nạp file từ DB nếu user chưa chọn/up local trong session này
    setFileMap((prev) => {
      const hasLocal = Object.values(prev || {}).some((list) =>
        (list || []).some((f) => f?.preview_url || f?._pending || f?.local_id),
      );
      if (hasLocal) return prev;
      return pickFileMapFromValues(saved.values, visibleFields);
    });

    (async () => {
      if (!leadId) {
        setLoadingLink(false);
        return;
      }
      setLoadingLink(true);
      try {
        const [leadRes, evRes] = await Promise.all([
          api.get(`/crm/leads/${leadId}/detail`).catch(() => api.get(`/crm/leads/${leadId}`).catch(() => ({ data: null }))),
          api.get('/events', { params: { lead_id: leadId, type: 'site_visit', limit: 30 } }).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        const leadRaw = leadRes.data?.lead || leadRes.data || null;
        const lead = leadRaw?.id ? leadRaw : (leadRes.data?.id ? leadRes.data : null);
        let events = evRes.data?.events || (Array.isArray(evRes.data) ? evRes.data : []);
        if (!Array.isArray(events)) events = [];
        if (!events.length) {
          try {
            const evAll = await api.get('/events', { params: { lead_id: leadId, limit: 40 } });
            events = (evAll.data?.events || []).filter((e) => (
              e.event_type === 'site_visit'
              || e.event_type_ref?.slug === 'site_visit'
              || /khảo sát|khao sat/i.test(String(e.event_type_ref?.name || e.title || ''))
            ));
          } catch { /* ignore */ }
        }
        const linkedId = saved.linked_event_id;
        const ev = (linkedId && events.find((e) => String(e.id) === String(linkedId)))
          || pickSurveyEvent(events);
        setLeadInfo(lead);
        setSurveyEvent(ev || null);
        let addr = '';
        // Prefill CHỈ text liên kết — tuyệt đối không đụng fileMap
        setValues((prev) => {
          const prefilled = buildSurveyPrefill({
            lead,
            event: ev,
            existingValues: prev,
            forceLinked: !String(prev?.[SURVEY_LINKED_FIELD_IDS.address] || '').trim(),
          });
          for (const f of visibleFields) {
            if (f.type === 'file') delete prefilled[f.id];
          }
          addr = prefilled[SURVEY_LINKED_FIELD_IDS.address] || '';
          return prefilled;
        });
        if (ev) {
          setLinkNote(
            `KS: ${formatDateTime(ev.start_time)}`
            + `${ev.assignee?.full_name ? ` · ${ev.assignee.full_name}` : ''}`
            + `${addr ? ` · ${addr}` : ''}`,
          );
        } else if (addr) {
          setLinkNote(`Địa chỉ từ lead/KH: ${addr}`);
        } else if (lead) {
          setLinkNote('Chưa có địa chỉ trên lead/sự kiện — nhập tay; lưu sẽ ghi lên lead + tạo/cập nhật sự kiện KS.');
        } else {
          setLinkNote('Không tải được lead — kiểm tra quyền / id.');
        }
      } catch {
        if (!cancelled) setLinkNote('');
      } finally {
        if (!cancelled) setLoadingLink(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ reload khi đổi task/lead
  }, [task?.id, leadId]);

  const setFieldValue = (fieldId, value) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const clearForm = () => {
    Object.values(fileMapRef.current || {}).forEach((list) => {
      (list || []).forEach((f) => {
        if (f?.preview_url?.startsWith?.('blob:')) {
          try { URL.revokeObjectURL(f.preview_url); } catch { /* ignore */ }
        }
      });
    });
    setFileMap(pickFileMapFromValues({}, visibleFields));
    setValues({});
  };

  const handleFilePick = async (field, fileList) => {
    // fileList nên là File[] đã snapshot; vẫn Array.from phòng khi gọi trực tiếp
    const files = (Array.isArray(fileList) ? fileList : Array.from(fileList || [])).filter(Boolean);
    if (!files.length) return;
    const fieldId = field.id;
    const allowMulti = field.multiple !== false; // mặc định cho phép nhiều
    setUploadingField(fieldId);
    const batchIds = [];
    try {
      for (const file of files) {
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        batchIds.push(localId);
        const kindHint = detectFileKind({ mime_type: file.type, file_name: file.name });
        const localPreview = (kindHint === 'image' || kindHint === 'video')
          ? URL.createObjectURL(file)
          : '';
        const pending = {
          local_id: localId,
          file_url: '',
          preview_url: localPreview || undefined,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || (kindHint === 'image' ? 'image/jpeg' : kindHint === 'video' ? 'video/mp4' : ''),
          _pending: true,
        };

        setFileMap((prev) => {
          const arr = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
          if (allowMulti) return { ...prev, [fieldId]: [...arr, pending] };
          arr.forEach((f) => {
            if (f?.preview_url?.startsWith?.('blob:')) {
              try { URL.revokeObjectURL(f.preview_url); } catch { /* ignore */ }
            }
          });
          return { ...prev, [fieldId]: [pending] };
        });

        let up;
        try {
          up = await uploadOneRawFile(file);
        } catch (uploadErr) {
          // Gỡ đúng pending lỗi, giữ file đã up trước đó
          setFileMap((prev) => {
            const arr = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
            const doomed = arr.find((f) => f?.local_id === localId);
            if (doomed?.preview_url?.startsWith?.('blob:')) {
              try { URL.revokeObjectURL(doomed.preview_url); } catch { /* ignore */ }
            }
            return { ...prev, [fieldId]: arr.filter((f) => f?.local_id !== localId) };
          });
          throw uploadErr;
        }

        const meta = normalizeUploadRow(up, file);
        if (!meta?.file_url) {
          setFileMap((prev) => {
            const arr = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
            const doomed = arr.find((f) => f?.local_id === localId);
            if (doomed?.preview_url?.startsWith?.('blob:')) {
              try { URL.revokeObjectURL(doomed.preview_url); } catch { /* ignore */ }
            }
            return { ...prev, [fieldId]: arr.filter((f) => f?.local_id !== localId) };
          });
          throw new Error('Upload không trả về file_url');
        }

        const done = {
          ...meta,
          local_id: localId,
          preview_url: localPreview || undefined,
          mime_type: meta.mime_type || file.type || pending.mime_type,
        };
        setFileMap((prev) => {
          const arr = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
          const next = arr.map((f) => (f?.local_id === localId ? done : f));
          if (!next.some((f) => f?.local_id === localId)) next.push(done);
          return { ...prev, [fieldId]: next };
        });
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Upload file lỗi');
    } finally {
      setUploadingField(null);
    }
  };

  const removeFileAt = (field, fileOrIdx) => {
    const fieldId = field.id;
    setFileMap((prev) => {
      const list = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      let target;
      let next;
      if (typeof fileOrIdx === 'object' && fileOrIdx) {
        target = fileOrIdx;
        next = list.filter((f) => f !== target && f?.local_id !== target.local_id);
      } else {
        target = list[fileOrIdx];
        next = list.filter((_, i) => i !== fileOrIdx);
      }
      if (target?.preview_url?.startsWith?.('blob:')) {
        try { URL.revokeObjectURL(target.preview_url); } catch { /* ignore */ }
      }
      return { ...prev, [fieldId]: next };
    });
  };

  /** Đồng bộ địa chỉ lead + sự kiện khảo sát khi lưu phiếu. */
  const syncLeadAndSurveyEvent = async (vals) => {
    const ids = SURVEY_LINKED_FIELD_IDS;
    const address = String(vals[ids.address] || '').trim();
    const dateStr = String(vals[ids.date] || '').trim();
    const surveyor = String(vals[ids.surveyor] || '').trim();
    let eventId = surveyEvent?.id || existing.linked_event_id || null;
    let assigneeId = surveyEvent?.assignee_id || existing.linked_assignee_id || null;

    // Giữ assignee nếu tên khớp; nếu form trống tên thì giữ assignee cũ
    if (surveyor && surveyEvent?.assignee?.full_name
      && surveyor.toLowerCase() !== String(surveyEvent.assignee.full_name).toLowerCase()) {
      // Tên đổi tay — không đổi assignee_id (tránh gán nhầm); vẫn lưu text trong form
    }

    if (address && leadId) {
      const current = resolveLeadSiteAddress(leadInfo);
      if (address !== current) {
        try {
          await api.put(`/crm/leads/${leadId}`, { install_address: address });
        } catch { /* không chặn lưu form */ }
      }
    }

    // Ngân sách (triệu) → estimated_value VND
    const budgetRaw = vals.budget;
    if (budgetRaw !== '' && budgetRaw != null && leadId) {
      const millions = Number(budgetRaw);
      if (Number.isFinite(millions) && millions >= 0) {
        const estimated = Math.round(millions * 1e6);
        const currentEst = Number(leadInfo?.estimated_value) || 0;
        if (estimated !== currentEst) {
          try {
            await api.put(`/crm/leads/${leadId}`, { estimated_value: estimated });
          } catch { /* ignore */ }
        }
      }
    }

    if (dateStr || address || surveyor) {
      const startIso = dateInputToEventIso(dateStr, surveyEvent?.start_time) || surveyEvent?.start_time;
      if (eventId) {
        const patch = {};
        if (address) patch.location = address;
        if (startIso) {
          patch.start_time = startIso;
          // end = +1h nếu trước đó có end, hoặc +1h từ start
          const endBase = surveyEvent?.end_time
            ? dateInputToEventIso(dateStr, surveyEvent.end_time)
            : (startIso ? new Date(new Date(startIso).getTime() + 3600000).toISOString() : null);
          if (endBase) patch.end_time = endBase;
        }
        if (Object.keys(patch).length) {
          try {
            const { data } = await api.put(`/events/${eventId}`, patch);
            const updated = data?.event || data;
            if (updated?.id) {
              setSurveyEvent(updated);
              eventId = updated.id;
              assigneeId = updated.assignee_id || assigneeId;
            }
          } catch { /* ignore */ }
        }
      } else if (startIso && leadId) {
        try {
          const leadTitle = leadInfo?.title || leadInfo?.customer?.full_name || leadInfo?.code || '';
          const { data } = await api.post('/events', {
            event_type: 'site_visit',
            title: leadTitle ? `Khảo sát — ${leadTitle}` : 'Khảo sát công trình',
            lead_id: leadId,
            customer_id: leadInfo?.customer_id || leadInfo?.customer?.id || null,
            location: address || null,
            start_time: startIso,
            end_time: new Date(new Date(startIso).getTime() + 3600000).toISOString(),
            assignee_id: leadInfo?.assigned_to || leadInfo?.lead_owner_id || null,
            status: 'planned',
            module: 'crm',
          });
          const created = data?.event || data;
          if (created?.id) {
            eventId = created.id;
            assigneeId = created.assignee_id || assigneeId;
            setSurveyEvent(created);
          }
        } catch { /* ignore — form vẫn lưu */ }
      }
    }

    return { linked_event_id: eventId || null, linked_assignee_id: assigneeId || null };
  };

  const handleSave = async () => {
    if (uploadingField) {
      alert('Đang upload file — vui lòng đợi xong rồi lưu.');
      return;
    }
    const stillPending = Object.values(fileMap).some((list) =>
      (list || []).some((f) => f?._pending),
    );
    if (stillPending) {
      alert('Còn file đang tải — đợi xong hoặc xóa file lỗi rồi lưu.');
      return;
    }
    const merged = mergeFormValues(values, fileMap);
    const check = validateFormValues(configView, merged);
    if (!check.ok) {
      alert(check.error);
      return;
    }
    // Bỏ blob preview / pending / local_id khỏi payload lưu
    const cleanValues = { ...check.values };
    for (const [k, v] of Object.entries(cleanValues)) {
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && ('file_url' in x || 'preview_url' in x || 'file_name' in x))) {
        cleanValues[k] = v
          .filter((f) => f?.file_url && !f._pending)
          .map(({ preview_url: _p, _pending: _x, local_id: _l, ...rest }) => rest);
      } else if (v && typeof v === 'object' && !Array.isArray(v) && ('file_url' in v || 'file_name' in v)) {
        const { preview_url: _p, _pending: _x, local_id: _l, ...rest } = v;
        cleanValues[k] = rest.file_url ? rest : null;
      }
    }
    setSaving(true);
    try {
      const linkMeta = await syncLeadAndSurveyEvent(cleanValues);
      const { data } = await api.put(`/crm/leads/${leadId}/tasks/${task.id}`, {
        form_data: {
          values: cleanValues,
          submitted_at: new Date().toISOString(),
          ...linkMeta,
        },
      });
      const updated = data?.task || data;
      const fileFields = configView.fields.filter((f) => f.type === 'file');
      const items = [];
      let existingUrls = new Set();
      try {
        const { data: atts } = await api.get(`/crm/leads/${leadId}/tasks/${task.id}/attachments`);
        existingUrls = new Set((atts || []).map((a) => a.file_url).filter(Boolean));
      } catch { /* ignore */ }
      for (const f of fileFields) {
        const v = cleanValues[f.id];
        const list = Array.isArray(v) ? v : (v ? [v] : []);
        for (const file of list) {
          if (file?.file_url && !existingUrls.has(file.file_url)) {
            items.push({
              name: `${f.label}: ${(file.file_name || 'File').replace(/\.[^.]+$/, '')}`.slice(0, 200),
              doc_type: 'other',
              file_url: file.file_url,
              file_name: file.file_name,
              file_size: file.file_size,
              mime_type: file.mime_type,
            });
          }
        }
      }
      if (items.length) {
        try {
          await api.post(`/crm/leads/${leadId}/tasks/${task.id}/attachments/bulk`, { items });
        } catch { /* ignore */ }
      }
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Lỗi lưu form');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field) => {
    if (field.type === 'button') {
      return (
        <button
          key={field.id}
          type="button"
          onClick={() => {
            if (field.button_action === 'clear') clearForm();
          }}
          className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
        >
          {field.button_label || field.label || 'Nút'}
        </button>
      );
    }

    const val = values[field.id];
    const linkHint = fieldLinkHint(field.id);
    return (
      <div key={field.id} className="space-y-1.5">
        <FieldLabel field={field} linkHint={linkHint} />

        {field.type === 'text' && (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={val ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value)}
              placeholder={field.placeholder}
              className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
            {field.id === SURVEY_LINKED_FIELD_IDS.address && (
              <button
                type="button"
                title="Lấy lại từ sự kiện KS hoặc lead"
                onClick={() => {
                  const addr = resolveSurveyAddress({ lead: leadInfo, event: surveyEvent });
                  if (addr) setFieldValue(field.id, addr);
                  else alert('Chưa có địa chỉ trên sự kiện khảo sát hoặc lead/KH.');
                }}
                className="h-9 px-2 shrink-0 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-semibold hover:bg-sky-100 cursor-pointer"
              >
                Lấy lại
              </button>
            )}
          </div>
        )}
        {field.type === 'number' && field.id === 'budget' && (() => {
          const hasBudget = val !== '' && val != null && Number.isFinite(Number(val));
          const vnd = hasBudget ? Math.round(Number(val) * 1e6) : null;
          return (
            <div className="space-y-1">
              <div className="flex gap-1.5 items-center">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatMoneyMillionsDisplay(val)}
                    onChange={(e) => {
                      const parsed = parseMoneyMillionsInput(e.target.value);
                      setFieldValue(field.id, parsed === '' ? '' : parsed);
                    }}
                    placeholder={field.placeholder || '80'}
                    className="w-full h-9 pl-3 pr-14 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400 tabular-nums"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-500 pointer-events-none">
                    triệu
                  </span>
                </div>
                <button
                  type="button"
                  title="Lấy từ giá trị ước tính trên lead"
                  onClick={() => {
                    const b = leadBudgetInMillions(leadInfo);
                    if (b !== '') setFieldValue(field.id, b);
                    else alert('Lead chưa có estimated_value — nhập tay.');
                  }}
                  className="h-9 px-2 shrink-0 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[10px] font-semibold hover:bg-sky-100 cursor-pointer"
                >
                  Lấy lại
                </button>
              </div>
              <p className="text-[10px] text-gray-500">
                {vnd != null
                  ? <>≈ <span className="font-semibold text-emerald-700">{formatVND(vnd)}</span></>
                  : 'Nhập số triệu — tự format (vd: 1.250)'}
              </p>
            </div>
          );
        })()}
        {field.type === 'number' && field.id !== 'budget' && (
          <div className="flex gap-1.5">
            <input
              type="number"
              value={val ?? ''}
              onChange={(e) => setFieldValue(field.id, e.target.value === '' ? '' : e.target.value)}
              placeholder={field.placeholder || 'Nhập số...'}
              className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        )}
        {field.type === 'date' && (
          <input
            type="date"
            value={val ?? ''}
            onChange={(e) => setFieldValue(field.id, e.target.value)}
            className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
          />
        )}
        {field.type === 'textarea' && (
          <textarea
            value={val ?? ''}
            onChange={(e) => setFieldValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400 resize-y min-h-[72px]"
          />
        )}
        {field.type === 'dimensions' && (() => {
          const layoutFieldId = field.by_cabinet_type ? (field.layout_field_id || 'cabinet_type') : null;
          const linkedCabinet = layoutFieldId ? resolveCabinetTypeId(values[layoutFieldId]) : '';
          const dim = (val && typeof val === 'object')
            ? val
            : { unit: field.unit || 'm', layout: linkedCabinet || '' };
          const layoutId = linkedCabinet || resolveCabinetTypeId(dim.layout) || '';
          const schema = field.by_cabinet_type
            ? getDimensionSchemaForCabinet(layoutId)
            : DEFAULT_DIMENSION_KEYS;
          const unit = dim.unit || field.unit || 'm';
          const setDim = (key, v) => setFieldValue(field.id, {
            ...dim,
            unit,
            layout: layoutId || dim.layout || '',
            [key]: v,
          });
          const pickLayoutInline = (nextLayout) => {
            setFieldValue(field.id, {
              ...dim,
              unit,
              layout: nextLayout,
            });
            // Nếu form chưa có field cabinet_type riêng thì vẫn lưu layout trên KT
            if (layoutFieldId && !configView.fields.some((f) => f.id === layoutFieldId)) {
              /* no-op */
            } else if (layoutFieldId && !values[layoutFieldId]) {
              setFieldValue(layoutFieldId, nextLayout);
            }
          };
          const cols = schema.length <= 3 ? 'grid-cols-3' : (schema.length === 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3');
          return (
            <div className="space-y-2">
              {field.by_cabinet_type && !linkedCabinet && (
                <div className="space-y-1">
                  <p className="text-[10px] text-amber-700">Chọn loại tủ để hiện đúng ô kích thước:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CABINET_TYPE_OPTIONS.filter((o) => !o.is_other).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          if (layoutFieldId && configView.fields.some((f) => f.id === layoutFieldId)) {
                            setFieldValue(layoutFieldId, o.id);
                          }
                          pickLayoutInline(o.id);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer ${
                          layoutId === o.id
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {field.by_cabinet_type && linkedCabinet && (
                <p className="text-[10px] text-gray-500">
                  Theo loại tủ:{' '}
                  <span className="font-semibold text-gray-800">
                    {CABINET_TYPE_OPTIONS.find((o) => o.id === linkedCabinet)?.label || linkedCabinet}
                  </span>
                </p>
              )}
              <div className={`grid ${cols} gap-2`}>
                {schema.map((d) => (
                  <label key={d.key} className="block">
                    <span className="text-[10px] text-gray-500">{d.label} ({unit})</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={dim[d.key] ?? ''}
                      onChange={(e) => setDim(d.key, e.target.value)}
                      placeholder="—"
                      className="mt-0.5 w-full h-9 px-2 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })()}
        {field.type === 'single_select' && (() => {
          const otherOpt = (field.options || []).find((o) => o.is_other);
          const selectedId = val && typeof val === 'object' ? val.id : val;
          const otherText = val && typeof val === 'object' ? (val.other || '') : '';
          const showOther = otherOpt && String(selectedId) === String(otherOpt.id);
          return (
            <div className="space-y-1.5">
              {(field.options || []).map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-lg border border-gray-100 hover:bg-orange-50/50">
                  <input
                    type="radio"
                    name={`ff_${field.id}`}
                    checked={String(selectedId) === String(opt.id)}
                    onChange={() => {
                      if (opt.is_other) {
                        setFieldValue(field.id, { id: opt.id, other: otherText || '' });
                      } else {
                        setFieldValue(field.id, opt.id);
                      }
                      // Đồng bộ layout vào field kích thước phụ thuộc
                      if (field.id === 'cabinet_type' || field.id === 'layout') {
                        const dimField = configView.fields.find((f) => f.type === 'dimensions' && (f.by_cabinet_type || f.layout_field_id === field.id));
                        if (dimField) {
                          const cur = values[dimField.id];
                          const base = (cur && typeof cur === 'object') ? cur : { unit: dimField.unit || 'm' };
                          setFieldValue(dimField.id, { ...base, layout: opt.is_other ? 'other' : opt.id });
                        }
                      }
                    }}
                    className="accent-orange-600"
                  />
                  {opt.label}
                </label>
              ))}
              {showOther && (
                <input
                  type="text"
                  value={otherText}
                  onChange={(e) => setFieldValue(field.id, { id: otherOpt.id, other: e.target.value })}
                  placeholder="Ghi rõ loại / nội dung khác…"
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg border border-violet-200 bg-violet-50/40 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
              )}
            </div>
          );
        })()}
        {field.type === 'multi_select' && (
          <div className="space-y-1.5">
            {(field.options || []).map((opt) => {
              const arr = Array.isArray(val) ? val : [];
              const checked = arr.includes(opt.id);
              return (
                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-lg border border-gray-100 hover:bg-orange-50/50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? arr.filter((x) => x !== opt.id) : [...arr, opt.id];
                      setFieldValue(field.id, next);
                    }}
                    className="accent-orange-600"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
        {field.type === 'checklist' && (() => {
          const ck = (val && typeof val === 'object' && !Array.isArray(val))
            ? val
            : { ids: Array.isArray(val) ? val : [], other: '' };
          const ids = (Array.isArray(ck.ids) ? ck.ids : []).map(String);
          const otherOpt = (field.options || []).find((o) => o.is_other)
            || (field.options || []).find((o) => /^(khác|other)$/i.test(String(o.label || '')));
          const showOther = otherOpt && ids.includes(String(otherOpt.id));
          return (
            <div className="space-y-1.5">
              {(field.options || []).map((opt) => {
                const isOther = !!opt.is_other || /^(khác|other)$/i.test(String(opt.label || ''));
                const checked = ids.includes(String(opt.id));
                return (
                  <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer select-none p-2 rounded-lg border border-gray-100 hover:bg-orange-50/50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const nextIds = checked
                          ? ids.filter((x) => x !== String(opt.id))
                          : [...ids, String(opt.id)];
                        setFieldValue(field.id, {
                          ids: nextIds,
                          other: isOther && !checked ? (ck.other || '') : (isOther ? '' : (ck.other || '')),
                        });
                      }}
                      className="accent-orange-600"
                    />
                    {opt.label}
                  </label>
                );
              })}
              {showOther && (
                <input
                  type="text"
                  value={ck.other || ''}
                  onChange={(e) => setFieldValue(field.id, { ...ck, ids, other: e.target.value })}
                  placeholder="Ghi rõ vấn đề khác…"
                  autoFocus
                  className="w-full h-9 px-3 rounded-lg border border-violet-200 bg-violet-50/40 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                />
              )}
            </div>
          );
        })()}
        {field.type === 'file' && (() => {
          const list = (fileMap[field.id] || []).filter(
            (f) => f && (f.file_url || f.preview_url || f.file_name || f._pending),
          );
          const busy = uploadingField === field.id;
          const accept = TASK_ATTACHMENT_FILE_ACCEPT;
          const allowMulti = field.multiple !== false;
          return (
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRefs.current[field.id]?.click()}
                className="w-full h-10 rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/50 text-sm text-orange-800 hover:bg-orange-50 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Đang tải...</>
                ) : (
                  <><Upload className="h-4 w-4" /> {allowMulti ? 'Thêm ảnh / video / file' : (list.length ? 'Thay file' : 'Chọn ảnh / video / file')}</>
                )}
              </button>
              <p className="text-[10px] text-gray-500">Hỗ trợ ảnh, video (mp4/mov…), PDF, Office, ZIP…</p>
              <input
                ref={(el) => { fileInputRefs.current[field.id] = el; }}
                type="file"
                multiple={allowMulti}
                accept={accept}
                className="hidden"
                onChange={(e) => {
                  // Bắt buộc Array.from TRƯỚC khi clear — FileList là live, clear sẽ làm rỗng
                  const picked = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (picked.length) handleFilePick(field, picked);
                }}
              />
              {list.length > 0 ? (
                <div className="space-y-1.5 rounded-xl border border-orange-100 bg-orange-50/40 p-2">
                  <p className="text-[11px] font-semibold text-orange-900">
                    Đã thêm {list.length} mục (ảnh / video / file)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {list.map((file, idx) => (
                      <MediaPreviewTile
                        key={file.local_id || `${file.file_url || file.preview_url || file.file_name || 'f'}-${idx}`}
                        file={file}
                        onRemove={() => removeFileAt(field, file)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-gray-400 text-center py-2 border border-dashed border-gray-200 rounded-lg">
                  Chưa có file — bấm nút phía trên để chọn
                </p>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  if (!task) return null;

  const grouped = groupFormFields(configView.fields);
  const hasGroups = grouped.A.length || grouped.B.length || grouped.C.length;
  const sections = hasGroups
    ? [
        ...(grouped.A.length ? [{ key: 'A', fields: grouped.A }] : []),
        ...(grouped.B.length ? [{ key: 'B', fields: grouped.B }] : []),
        ...(grouped.C.length ? [{ key: 'C', fields: grouped.C }] : []),
        ...(grouped.other.length ? [{ key: null, fields: grouped.other }] : []),
      ]
    : [{ key: null, fields: configView.fields }];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{config.title}</h3>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{task.title}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              <span className="text-red-500">*</span> bắt buộc · hover <HelpCircle className="h-3 w-3 inline text-gray-400" /> để xem gợi ý
            </p>
            {loadingLink ? (
              <p className="text-[10px] text-sky-600 mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang lấy lead & sự kiện khảo sát…
              </p>
            ) : linkNote ? (
              <p className="text-[10px] text-sky-700 mt-1 flex items-start gap-1">
                <Calendar className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{linkNote}</span>
              </p>
            ) : null}
            {existing.submitted_at && (
              <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Đã lưu {formatDateTime(existing.submitted_at)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {configView.fields.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              Form chưa có trường. Ở bộ mẫu bấm «Mẫu khảo sát» để nạp preset.
            </p>
          ) : (
            sections.map((sec) => (
              <div key={sec.key || 'other'} className="space-y-3">
                {sec.key && <SectionHeader groupKey={sec.key} />}
                {sec.fields.map(renderField)}
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between gap-2 shrink-0">
          <p className="text-[10px] text-gray-500 hidden sm:block max-w-[200px]">
            Lưu sẽ cập nhật địa chỉ lead + sự kiện khảo sát
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || configView.fields.filter((f) => f.type !== 'button').length === 0}
              className="h-9 px-5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu form
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
