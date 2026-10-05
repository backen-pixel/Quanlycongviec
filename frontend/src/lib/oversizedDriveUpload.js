import { uploadFilesBatch } from '../components/FileUpload';
import {
  driveEnsureAnyoneLink,
  driveEnsurePersonalRoot,
  driveUploadFile,
  driveUploadToEntity,
} from './drive';
import { MESSENGER_MAX_FILE_BYTES, MESSENGER_MAX_FILE_MB } from './messengerUploadLimits';

export function partitionByDirectLimit(files) {
  const direct = [];
  const oversized = [];
  for (const file of Array.from(files || []).filter(Boolean)) {
    if ((file.size || 0) > MESSENGER_MAX_FILE_BYTES) oversized.push(file);
    else direct.push(file);
  }
  return { direct, oversized };
}

export function driveShareText(file) {
  const name = file?.name || 'File';
  const url = file?.google_view_url;
  return url ? `${name}\n${url}` : name;
}

export function driveShareBody(files) {
  return (files || []).map(driveShareText).filter(Boolean).join('\n\n');
}

export function commentAttachmentFromDriveFile(file) {
  const url = file?.google_view_url || '';
  return {
    file_url: url,
    url,
    file_name: file?.name || 'File Drive',
    name: file?.name || 'File Drive',
    mime_type: file?.mime_type || 'application/octet-stream',
    type: file?.mime_type || 'application/octet-stream',
    file_size: file?.size_bytes || 0,
    size: file?.size_bytes || 0,
    is_drive: true,
    drive_file_id: file?.id || null,
    google_view_url: url || null,
  };
}

async function withShareLink(fileRow) {
  if (!fileRow?.id) throw new Error('Drive không trả về file');
  const shared = await driveEnsureAnyoneLink(fileRow.id);
  return { ...fileRow, google_view_url: shared?.url || fileRow.google_view_url || null };
}

/**
 * File lớn hơn giới hạn đính kèm trực tiếp: lưu Google Drive và lấy link xem.
 * Có entity thì vào thư mục hồ sơ; không thì vào Drive cá nhân.
 */
export async function storeOversizedOnDrive(files, { entityType, entityId, onProgress } = {}) {
  const list = Array.from(files || []).filter(Boolean);
  const rows = [];
  for (const file of list) {
    const report = (payload) => {
      const stats = payload && typeof payload === 'object' ? payload : { percent: payload };
      const pct = Number(stats.percent) || 0;
      onProgress?.({
        fileName: file.name,
        fileSize: file.size,
        percent: pct,
        bytesPerSec: stats.bytesPerSec || 0,
        remainingSec: stats.remainingSec ?? null,
        loadedBytes: stats.loadedBytes,
        totalBytes: stats.totalBytes || file.size,
        statusText: pct >= 99 ? 'Đã gửi xong, đang lưu Google Drive…' : '',
      });
    };
    let data;
    if (entityType && entityId) {
      data = await driveUploadToEntity(file, {
        entity_type: entityType,
        entity_id: entityId,
        onProgress: report,
      });
    } else {
      const ensured = await driveEnsurePersonalRoot();
      const rootId = ensured?.root?.id;
      if (!rootId) throw new Error('Không tạo được Drive cá nhân để lưu file lớn');
      data = await driveUploadFile(file, { root_id: rootId, onProgress: report });
    }
    onProgress?.({
      fileName: file.name,
      fileSize: file.size,
      percent: 99,
      statusText: 'Đang tạo link xem…',
    });
    rows.push(await withShareLink(data?.file));
  }
  return rows;
}

/** Đính kèm bình luận: file ≤ giới hạn giữ upload thường; file lớn hơn lưu Drive và trả dòng link. */
export async function uploadMixedCommentFiles(fileList, { entityType, entityId, onProgress } = {}) {
  const { direct, oversized } = partitionByDirectLimit(fileList);
  const uploaded = [];
  const shareLines = [];
  if (direct.length) {
    uploaded.push(...await uploadFilesBatch(direct, { onProgress, track: true }));
  }
  if (oversized.length) {
    if (!entityType || !entityId) {
      const names = oversized.map((f) => f.name).join(', ');
      throw new Error(`File trên ${MESSENGER_MAX_FILE_MB} MB cần hồ sơ để lưu Drive: ${names}`);
    }
    const rows = await storeOversizedOnDrive(oversized, { entityType, entityId, onProgress });
    for (const row of rows) {
      uploaded.push(commentAttachmentFromDriveFile(row));
      shareLines.push(driveShareText(row));
    }
  }
  return { uploaded, shareText: shareLines.filter(Boolean).join('\n') };
}
