import JSZip from 'jszip';
import {
  buildCrmTaskDocumentSections,
  buildCrmLeadDocTaskSections,
  DEAL_STAGES,
  SX_ORDER_STAGES,
} from './crmTaskDocumentTree';
import { publicFileUrl } from './publicFileUrl';

function sanitizePathSegment(name, fallback = 'Khac') {
  const s = String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  return s || fallback;
}

function uniqueZipPath(usedPaths, basePath) {
  if (!usedPaths.has(basePath)) {
    usedPaths.add(basePath);
    return basePath;
  }
  const dot = basePath.lastIndexOf('.');
  const hasExt = dot > basePath.lastIndexOf('/');
  const stem = hasExt ? basePath.slice(0, dot) : basePath;
  const ext = hasExt ? basePath.slice(dot) : '';
  let i = 2;
  let candidate = `${stem} (${i})${ext}`;
  while (usedPaths.has(candidate)) {
    i += 1;
    candidate = `${stem} (${i})${ext}`;
  }
  usedPaths.add(candidate);
  return candidate;
}

function isNoteArtifact(a) {
  const dt = a?.doc_type;
  return dt === 'task_note' || dt === 'task_inline_note' || dt === 'checklist_inline_note';
}

async function fetchFileBlob(url) {
  const fullUrl = publicFileUrl(url);
  if (!fullUrl) return null;

  if (fullUrl.startsWith('data:')) {
    try {
      const res = await fetch(fullUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(fullUrl, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.blob();
}

function noteTextContent(item) {
  const parts = [
    item.name || item.file_name || null,
    item.notes || null,
    item.file_url && !/^https?:\/\//i.test(String(item.file_url || '')) ? item.file_url : null,
  ].filter(Boolean);
  return parts.join('\n\n') || '(trống)';
}

function noteFileName(item) {
  const base = sanitizePathSegment(item.name || item.file_name || 'Ghi chu');
  return base.toLowerCase().endsWith('.txt') ? base : `${base}.txt`;
}

function fileEntryName(item) {
  return sanitizePathSegment(item.file_name || item.name || `file_${item.id || Date.now()}`);
}

async function addItemToZip(zip, folderPath, item, usedPaths) {
  const isNote = isNoteArtifact(item);
  const hasFile = !!item.file_url && !isNote;

  if (isNote || (!hasFile && (item.notes || item.name))) {
    const path = uniqueZipPath(usedPaths, `${folderPath}/${noteFileName(item)}`);
    zip.file(path, noteTextContent(item));
    return true;
  }

  if (!hasFile) return false;

  const blob = await fetchFileBlob(item.file_url);
  if (!blob) return false;

  const path = uniqueZipPath(usedPaths, `${folderPath}/${fileEntryName(item)}`);
  zip.file(path, blob);

  if (item.notes) {
    const notePath = uniqueZipPath(
      usedPaths,
      `${folderPath}/${sanitizePathSegment(item.name || item.file_name || 'Ghi chu')}_ghi_chu.txt`,
    );
    zip.file(notePath, item.notes);
  }
  return true;
}

function buildStaticStageLabels() {
  const map = {};
  for (const s of [...DEAL_STAGES, ...SX_ORDER_STAGES]) {
    map[s.slug] = s.label;
  }
  return map;
}

function countZipItems({ sections, manualDocs, orphanSections }) {
  let n = 0;
  for (const stage of sections) {
    for (const task of stage.tasks) {
      for (const ck of task.checklistGroups) {
        n += ck.artifacts.length;
      }
    }
  }
  n += manualDocs.length;
  for (const stage of orphanSections) {
    for (const task of stage.tasks) {
      for (const ck of task.checklistGroups) {
        n += ck.docs.length;
      }
    }
  }
  return n;
}

/**
 * Tải ZIP tài liệu deal/lead — cấu trúc:
 * {Deal}/ → {Giai đoạn}/ → {Nhiệm vụ}/ → {Checklist}/ → file & ghi chú
 */
export async function downloadCrmLeadDocumentsZip({
  dealLabel,
  tasks = [],
  artifacts = [],
  manualDocs = [],
  orphanSyncedDocs = [],
  pipelineStages = [],
  leadCurrentStageId = null,
  leadType = 'lead',
  onProgress,
}) {
  const root = sanitizePathSegment(dealLabel, 'Deal');
  const zip = new JSZip();
  const usedPaths = new Set();

  const { sections } = buildCrmTaskDocumentSections({
    tasks,
    artifacts,
    pipelineStages,
    leadCurrentStageId,
    leadType,
  });

  const taskMetaMap = Object.fromEntries(
    (tasks || []).map((t) => [
      t.id,
      {
        title: t.title,
        stage_slug: t.stage_slug,
        order_index: t.order_index,
        checklist: t.checklist,
      },
    ]),
  );

  const slugLabelMap = Object.fromEntries(
    (pipelineStages || []).flatMap((s) => {
      const entries = [[String(s.id), s.name]];
      if (s.canonical_slug) entries.push([String(s.canonical_slug), s.name]);
      return entries;
    }),
  );

  const { sections: orphanSections } = buildCrmLeadDocTaskSections(
    orphanSyncedDocs,
    taskMetaMap,
    slugLabelMap,
    buildStaticStageLabels(),
  );

  const total = countZipItems({ sections, manualDocs, orphanSections });
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(done, total);
  };

  for (const stage of sections) {
    const stagePath = `${root}/${sanitizePathSegment(stage.stageLabel, 'Giai doan')}`;
    for (const task of stage.tasks) {
      const taskPath = `${stagePath}/${sanitizePathSegment(task.taskTitle, 'Nhiem vu')}`;
      for (const ckGroup of task.checklistGroups) {
        const ckFolder = ckGroup.checklistTitle
          ? `${taskPath}/${sanitizePathSegment(ckGroup.checklistTitle, 'Checklist')}`
          : `${taskPath}/Nhiệm vụ`;
        for (const artifact of ckGroup.artifacts) {
          await addItemToZip(zip, ckFolder, artifact, usedPaths);
          tick();
        }
      }
    }
  }

  for (const stage of orphanSections) {
    const stagePath = `${root}/${sanitizePathSegment(stage.stageLabel, 'Giai doan')}`;
    for (const task of stage.tasks) {
      const taskPath = `${stagePath}/${sanitizePathSegment(task.taskTitle, 'Nhiem vu')}`;
      for (const ckGroup of task.checklistGroups) {
        const ckFolder = ckGroup.checklistTitle
          ? `${taskPath}/${sanitizePathSegment(ckGroup.checklistTitle, 'Checklist')}`
          : `${taskPath}/Nhiệm vụ`;
        for (const doc of ckGroup.docs) {
          await addItemToZip(zip, ckFolder, doc, usedPaths);
          tick();
        }
      }
    }
  }

  const manualPath = `${root}/Tài liệu Lead`;
  for (const doc of manualDocs) {
    await addItemToZip(zip, manualPath, doc, usedPaths);
    tick();
  }

  if (total === 0) {
    throw new Error('Không có tài liệu để tải');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${root}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
