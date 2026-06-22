/**
 * Kho ảnh chung công ty trên Google Drive — upload & quản lý thư mục con (bộ ảnh FB).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderPlus, Image, Loader2, RefreshCw, Upload } from 'lucide-react';
import {
  driveCreateFolder,
  driveEnsureCompanyImages,
  driveFileThumbnailUrl,
  driveGetCompanyImages,
  driveUploadFile,
} from '../../lib/drive';
import { isImageMime } from '../drive/DriveFileViews';

export default function CompanyImagesDrivePanel({ companyId, companyName, onFolderCreated }) {
  const [loading, setLoading] = useState(true);
  const [ensuring, setEnsuring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [root, setRoot] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setRoot(null);
      setFolders([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await driveGetCompanyImages(companyId, 'crm');
      if (data.root) {
        setRoot(data.root);
        setFolders(data.folders || []);
        setFiles(data.files || []);
      } else {
        const ensured = await driveEnsureCompanyImages(companyId, 'crm');
        setRoot(ensured.root || null);
        const children = ensured.children || {};
        setFolders(children.folders || []);
        setFiles((children.files || []).filter((f) => isImageMime(f.mime_type, f.name)));
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được kho ảnh');
      setRoot(null);
      setFolders([]);
      setFiles([]);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEnsure = async () => {
    if (!companyId) return;
    setEnsuring(true);
    setError(null);
    try {
      const data = await driveEnsureCompanyImages(companyId, 'crm');
      setRoot(data.root || null);
      const children = data.children || {};
      setFolders(children.folders || []);
      setFiles((children.files || []).filter((f) => isImageMime(f.mime_type, f.name)));
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tạo được kho ảnh');
    }
    setEnsuring(false);
  };

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length || !root?.id) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        if (!file.type.startsWith('image/') && !isImageMime(file.type, file.name)) continue;
        await driveUploadFile(file, { root_id: root.id, name: file.name });
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Lỗi upload');
    }
    setUploading(false);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !root?.id) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const folder = await driveCreateFolder({ name, root_id: root.id });
      setNewFolderName('');
      await load();
      onFolderCreated?.(folder);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tạo được thư mục');
    }
    setCreatingFolder(false);
  };

  if (!companyId) {
    return (
      <p className="text-xs text-gray-500 py-2">Chọn công ty để quản lý kho ảnh chung.</p>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Image className="h-4 w-4 text-blue-600" />
            Kho ảnh chung {companyName ? `· ${companyName}` : ''}
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl">
            Mỗi công ty một thư mục <strong>_Kho ảnh chung</strong> trên Drive CRM. Tạo thư mục con cho từng bộ ảnh, upload hình vào đó rồi gán vào bộ gửi Facebook bên dưới.
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="h-8 px-2.5 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          {!root && (
            <button
              type="button"
              onClick={handleEnsure}
              disabled={ensuring}
              className="h-8 px-3 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {ensuring ? 'Đang tạo…' : 'Tạo kho ảnh'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải kho ảnh…
        </div>
      ) : root ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-8 px-3 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Đang tải lên…' : 'Upload ảnh vào kho'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên thư mục bộ ảnh mới"
                className="h-8 flex-1 min-w-0 px-2.5 text-xs border border-gray-200 rounded-lg bg-white"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="h-8 px-2.5 text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-40 inline-flex items-center gap-1"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Tạo thư mục
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-gray-700 mb-1.5">Thư mục bộ ảnh ({folders.length})</p>
              {folders.length === 0 ? (
                <p className="text-gray-400 italic">Chưa có thư mục con — tạo thư mục cho từng bộ (vd: Cửa gỗ, Tủ bếp…).</p>
              ) : (
                <ul className="space-y-1 max-h-36 overflow-y-auto">
                  {folders.map((f) => (
                    <li key={f.id} className="px-2 py-1 rounded-md bg-white border border-gray-100 truncate" title={f.name}>
                      📁 {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1.5">Ảnh ở thư mục gốc ({files.length})</p>
              {files.length === 0 ? (
                <p className="text-gray-400 italic">Ảnh upload trực tiếp vào kho (không qua thư mục con).</p>
              ) : (
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
                  {files.slice(0, 12).map((f) => (
                    <div key={f.id} className="w-10 h-10 rounded-md overflow-hidden border border-gray-100 bg-gray-50" title={f.name}>
                      <img src={driveFileThumbnailUrl(f.id)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {files.length > 12 && (
                    <span className="text-[10px] text-gray-400 self-center">+{files.length - 12}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 py-2">
          Chưa có kho ảnh cho công ty này. Bấm <strong>Tạo kho ảnh</strong> để tạo thư mục <em>_Kho ảnh chung</em> trên Google Drive.
        </p>
      )}
    </div>
  );
}
