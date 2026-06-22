/**
 * Panel gửi ảnh Drive trong Messenger — duyệt thư mục giống trang Drive, chỉ đóng bằng nút X.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Loader2, Send, X } from 'lucide-react';
import {
  fetchFacebookImageSendSources,
  sendFacebookDriveFolder,
  sendFacebookImageSet,
} from '../../lib/facebookImageSets';
import { driveEnsureCompanyImages } from '../../lib/drive';
import MessengerDriveBrowser, { FB_IMAGE_DRIVE_PANEL_ATTR } from './MessengerDriveBrowser';

export { FB_IMAGE_DRIVE_PANEL_ATTR };

export default function FacebookImageSetPicker({
  open,
  onClose,
  contactId,
  companyId = null,
  companyQs = '',
  disabled = false,
  onMessagesSent,
  variant = 'sidebar',
}) {
  const [configuredSets, setConfiguredSets] = useState([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [sending, setSending] = useState(false);

  const effectiveCompanyId = useMemo(() => {
    if (companyId) return companyId;
    if (companyQs) {
      const m = companyQs.match(/company_id=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }, [companyId, companyQs]);

  const loadSets = useCallback(async () => {
    setLoadingSets(true);
    try {
      const cid = effectiveCompanyId;
      if (cid) {
        try { await driveEnsureCompanyImages(cid, 'crm'); } catch { /* ignore */ }
      }
      const data = await fetchFacebookImageSendSources(companyQs);
      setConfiguredSets(data?.configured_sets || []);
    } catch {
      setConfiguredSets([]);
    }
    setLoadingSets(false);
  }, [companyQs, effectiveCompanyId]);

  useEffect(() => {
    if (open) loadSets();
  }, [open, loadSets]);

  const handleSendSet = async (set) => {
    if (!contactId || sending || disabled) return;
    const count = set.image_count ?? 0;
    if (!count) {
      alert('Thư mục Drive của bộ này chưa có ảnh.');
      return;
    }
    if (!window.confirm(`Gửi ${count} ảnh từ bộ «${set.name}» cho khách?`)) return;

    setSending(true);
    try {
      const result = await sendFacebookImageSet(contactId, set.id, companyQs);
      const msgs = result?.messages || [];
      if (msgs.length) onMessagesSent?.(msgs, result);
      if (result?.failed?.length) {
        alert(`Đã gửi ${result.sent} ảnh. ${result.failed.length} ảnh lỗi.`);
      }
      onClose?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gửi bộ ảnh');
    }
    setSending(false);
  };

  const handleSendFolder = async ({ folderId, rootId, label, count, fileIds }) => {
    if (!contactId || sending || disabled) return;
    if (!count) {
      alert('Chưa chọn ảnh nào để gửi.');
      return;
    }
    if (!window.confirm(`Gửi ${count} ảnh từ «${label}» cho khách?`)) return;

    setSending(true);
    try {
      const result = await sendFacebookDriveFolder(
        contactId,
        { folderId, rootId, label, fileIds },
        companyQs,
      );
      const msgs = result?.messages || [];
      if (msgs.length) onMessagesSent?.(msgs, result);
      if (result?.failed?.length) {
        alert(`Đã gửi ${result.sent} ảnh. ${result.failed.length} ảnh lỗi.`);
      }
      onClose?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi gửi ảnh');
    }
    setSending(false);
  };

  if (!open) return null;

  const panelBody = (
    <div
      className="flex flex-col h-full min-h-0"
      {...{ [FB_IMAGE_DRIVE_PANEL_ATTR]: '' }}
    >
      <div className="px-3 py-2 border-b border-blue-100/80 bg-white flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Image className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-xs font-semibold text-gray-900 truncate">Kho ảnh · Gửi khách</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 shrink-0"
          title="Đóng panel Drive"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      </div>

      <MessengerDriveBrowser
        companyId={effectiveCompanyId}
        companyQs={companyQs}
        disabled={disabled}
        sending={sending}
        onSend={handleSendFolder}
      />

      {configuredSets.length > 0 && (
        <div className="shrink-0 border-t border-gray-100 bg-gray-50/80 px-2 py-2 max-h-[120px] overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">
            Bộ đã cấu hình
          </p>
          {loadingSets ? (
            <p className="text-[10px] text-gray-400 flex items-center gap-1 px-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
            </p>
          ) : (
            <div className="space-y-1">
              {configuredSets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => handleSendSet(set)}
                  disabled={disabled || sending || !(set.image_count > 0)}
                  className="w-full text-left px-2 py-1 rounded-md border border-gray-100 bg-white text-[10px] hover:border-blue-200 disabled:opacity-40 flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-gray-900 truncate">{set.name}</span>
                  <span className="shrink-0 text-blue-600 inline-flex items-center gap-0.5">
                    <Send className="h-3 w-3" /> {set.image_count ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/30 p-3">
        <div
          className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md h-[min(80vh,640px)] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Kho ảnh gửi khách"
          onClick={(e) => e.stopPropagation()}
        >
          {panelBody}
        </div>
      </div>
    );
  }

  return (
    <aside
      className="w-[min(100%,340px)] sm:w-[320px] shrink-0 border-l border-blue-100 bg-white flex flex-col shadow-inner min-h-0 h-full"
      aria-label="Kho ảnh gửi khách"
      {...{ [FB_IMAGE_DRIVE_PANEL_ATTR]: '' }}
    >
      {panelBody}
    </aside>
  );
}

/** Nút bật panel bộ ảnh — dùng trong thanh nhập tin. */
export function FacebookImageSetToggleButton({ open, onToggle, disabled, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`p-2.5 rounded-xl cursor-pointer transition disabled:opacity-40 ${
        open ? 'text-blue-700 bg-blue-100 ring-2 ring-blue-300/60' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
      } ${className}`}
      title="Mở kho ảnh Drive"
    >
      <Image size={20} />
    </button>
  );
}
