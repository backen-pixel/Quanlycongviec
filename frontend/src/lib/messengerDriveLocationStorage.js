/** Nhớ thư mục Drive + ảnh đã chọn lần trước (theo công ty) trong panel Messenger. */
const KEY = 'fb.messenger.drive.lastLocation';

export function loadMessengerDriveLocation(companyId) {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const row = data[String(companyId)];
    if (!row?.rootId) return null;
    return {
      rootId: String(row.rootId),
      folderId: row.folderId ? String(row.folderId) : null,
      folderName: row.folderName || null,
      selectedFileIds: Array.isArray(row.selectedFileIds)
        ? row.selectedFileIds.map(String).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}

export function saveMessengerDriveLocation(companyId, { rootId, folderId, folderName, selectedFileIds }) {
  if (!companyId || !rootId) return;
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[String(companyId)] = {
      rootId: String(rootId),
      folderId: folderId ? String(folderId) : null,
      folderName: folderName || null,
      selectedFileIds: Array.isArray(selectedFileIds)
        ? selectedFileIds.map(String).filter(Boolean)
        : [],
      updatedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}
