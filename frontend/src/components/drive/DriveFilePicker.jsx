/**
 * DriveFilePicker — modal chọn 1 file từ Drive để gắn vào entity (lead/task/...).
 * props: { entityType, entityId, onPicked(file), onClose }
 *   - Nếu có entityType + entityId thì gọi link luôn; nếu không, chỉ trả về file.
 */
import { useEffect, useState } from 'react';
import { X, Search, Loader2, FolderOpen, ChevronRight, Link2 } from 'lucide-react';
import {
  driveListRoots, driveListRootChildren, driveListFolderChildren, driveSearch,
  driveLinkFile, driveFormatBytes,
} from '../../lib/drive';
import DriveFileIcon from './DriveFileIcon';

export default function DriveFilePicker({ entityType, entityId, onPicked, onClose }) {
  const [roots, setRoots] = useState([]);
  const [activeRoot, setActiveRoot] = useState(null);
  const [folder, setFolder] = useState(null);
  const [crumb, setCrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await driveListRoots();
      setRoots(r.roots || []);
      if (r.roots?.[0]) await openRoot(r.roots[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openRoot(root) {
    setLoading(true);
    setActiveRoot(root);
    setFolder(null);
    setCrumb([{ type: 'root', id: root.id, name: root.name }]);
    setQuery('');
    try {
      const r = await driveListRootChildren(root.id);
      setFolders(r.folders || []);
      setFiles(r.files || []);
    } finally { setLoading(false); }
  }

  async function openFolder(f) {
    setLoading(true);
    try {
      const r = await driveListFolderChildren(f.id);
      setFolder(r.folder);
      setFolders(r.folders || []);
      setFiles(r.files || []);
      setCrumb((c) => [...c, { type: 'folder', id: f.id, name: f.name }]);
    } finally { setLoading(false); }
  }

  async function jumpCrumb(idx) {
    const c = crumb[idx];
    if (c.type === 'root') {
      const root = roots.find((x) => x.id === c.id);
      if (root) return openRoot(root);
    }
    if (c.type === 'folder') {
      setLoading(true);
      const r = await driveListFolderChildren(c.id);
      setFolder(r.folder);
      setFolders(r.folders || []);
      setFiles(r.files || []);
      setCrumb((cur) => cur.slice(0, idx + 1));
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(async () => {
      try {
        const r = await driveSearch({ q: query.trim(), root_id: activeRoot?.id });
        setFolders(r.folders || []);
        setFiles(r.files || []);
      } catch (_) {}
    }, 300);
    return () => clearTimeout(t);
  }, [query, activeRoot?.id]);

  async function pick(file) {
    if (entityType && entityId) {
      try {
        setSubmitting(file.id);
        await driveLinkFile(file.id, entityType, entityId);
        onPicked?.(file);
        onClose?.();
      } catch (e) { alert(e?.response?.data?.error || e?.message); }
      finally { setSubmitting(null); }
    } else {
      onPicked?.(file);
      onClose?.();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="h-14 px-4 border-b flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-800">Chọn file từ Drive</h2>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </header>

        <div className="px-4 py-2 border-b bg-slate-50 flex items-center gap-2">
          <select
            value={activeRoot?.id || ''}
            onChange={(e) => {
              const r = roots.find((x) => x.id === e.target.value);
              if (r) openRoot(r);
            }}
            className="px-2 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:border-blue-400"
          >
            {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <nav className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-x-auto">
            {crumb.map((c, i) => (
              <span key={`${c.type}-${c.id}`} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight size={12} className="text-slate-400" />}
                <button onClick={() => jumpCrumb(i)} className="px-2 py-1 rounded hover:bg-white text-slate-600 truncate max-w-[140px]">
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm..."
              className="pl-7 pr-2 py-1.5 w-44 text-sm border rounded-lg bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="animate-spin mr-2" size={18} /> Đang tải...
            </div>
          ) : (
            <>
              {folders.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openFolder(f)}
                      className="text-left flex items-center gap-2 px-2 py-1.5 border rounded-lg hover:border-blue-400 hover:bg-blue-50"
                    >
                      <DriveFileIcon isFolder size={20} />
                      <span className="text-sm truncate">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 px-2 py-2 border rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                      onClick={() => pick(f)}
                    >
                      <DriveFileIcon mime={f.mime_type} size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-[11px] text-slate-400">{driveFormatBytes(f.size_bytes)}</p>
                      </div>
                      <button
                        disabled={submitting === f.id}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
                      >
                        <Link2 size={12} /> Gắn
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {folders.length === 0 && files.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <FolderOpen className="mx-auto mb-2" size={36} />
                  <p className="text-sm">Trống</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
