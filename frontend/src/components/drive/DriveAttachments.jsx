/**
 * DriveAttachments — embed vào trang detail (lead/task/project) để hiện file Drive đã gắn.
 * Có nút "Chọn từ Drive" mở picker. Khi user click file → mở preview.
 *
 * props: { entityType: 'lead'|'task'|'project'|..., entityId, className }
 */
import { useCallback, useEffect, useState } from 'react';
import { Link2, FileText, Download, Trash2, Eye } from 'lucide-react';
import {
  driveLinksByEntity, driveUnlinkFile, drivePreview, driveOpenDownload, driveFormatBytes,
} from '../../lib/drive';
import DriveFileIcon from './DriveFileIcon';
import DriveFilePicker from './DriveFilePicker';
import PreviewModal from './PreviewModal';

export default function DriveAttachments({ entityType, entityId, className = '' }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [previewing, setPreviewing] = useState(null);

  const reload = useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    try {
      const r = await driveLinksByEntity(entityType, entityId);
      setLinks(r.links || []);
    } finally { setLoading(false); }
  }, [entityType, entityId]);

  useEffect(() => { void reload(); }, [reload]);

  async function unlink(linkId) {
    if (!confirm('Bỏ gắn file này?')) return;
    try {
      await driveUnlinkFile(linkId);
      setLinks((cur) => cur.filter((l) => l.id !== linkId));
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  async function preview(file) {
    try {
      const meta = await drivePreview(file.id);
      setPreviewing({ ...file, preview: meta });
    } catch (e) { alert(e?.response?.data?.error || e?.message); }
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Link2 size={16} className="text-blue-600" /> File từ Drive ({links.length})
        </h3>
        <button
          onClick={() => setPicking(true)}
          className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
        >
          <Link2 size={12} /> Chọn từ Drive
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 py-4 text-center">Đang tải...</p>
      ) : links.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">Chưa gắn file nào từ Drive</p>
      ) : (
        <ul className="space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-2 py-2 hover:bg-slate-50 rounded-lg group">
              <DriveFileIcon mime={l.file?.mime_type} size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 truncate" title={l.file?.name}>{l.file?.name}</p>
                <p className="text-[10px] text-slate-400">{driveFormatBytes(l.file?.size_bytes)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => preview(l.file)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Xem trước">
                  <Eye size={13} />
                </button>
                <button onClick={() => driveOpenDownload(l.file.id, l.file.name)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Tải">
                  <Download size={13} />
                </button>
                <button onClick={() => unlink(l.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded" title="Bỏ gắn">
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <DriveFilePicker
          entityType={entityType}
          entityId={entityId}
          onPicked={() => reload()}
          onClose={() => setPicking(false)}
        />
      )}
      {previewing && (
        <PreviewModal
          item={previewing}
          onClose={() => setPreviewing(null)}
          onDownload={() => driveOpenDownload(previewing.id, previewing.name)}
        />
      )}
    </div>
  );
}
