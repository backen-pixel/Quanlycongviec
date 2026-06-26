/**
 * Kiểm tra + đồng bộ Supabase Storage buckets giữa primary ↔ backup.
 */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const BUCKETS = (process.env.STORAGE_SYNC_BUCKETS || 'attachments,app-releases,ghi-am')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CONCURRENCY = Math.max(1, parseInt(process.env.STORAGE_SYNC_CONCURRENCY || '6', 10));

function clients() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!config.supabaseBackupUrl || !config.supabaseBackupServiceKey) {
    throw new Error('Thiếu SUPABASE_BACKUP_URL / SUPABASE_BACKUP_SERVICE_ROLE_KEY');
  }
  const opts = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    primary: createClient(config.supabaseUrl, config.supabaseServiceKey, opts),
    backup: createClient(config.supabaseBackupUrl, config.supabaseBackupServiceKey, opts),
  };
}

function clientFor(side, { primary, backup }) {
  return side === 'backup' ? backup : primary;
}

async function ensureBucket(client, bucket) {
  const { data } = await client.storage.getBucket(bucket);
  if (data) return;
  const { error } = await client.storage.createBucket(bucket, { public: true });
  if (error && !/already exists/i.test(error.message)) throw error;
}

async function listFolder(client, bucket, prefix = '') {
  const out = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const isFile = item.metadata != null || item.id != null;
      if (isFile && item.name !== '.emptyFolderPlaceholder') {
        out.push({
          path,
          size: item.metadata?.size ?? item.metadata?.contentLength ?? null,
          mimetype: item.metadata?.mimetype || item.metadata?.contentType || 'application/octet-stream',
        });
      } else {
        const nested = await listFolder(client, bucket, path);
        out.push(...nested);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function destHasSameFile(destClient, bucket, file) {
  const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
  const name = file.path.includes('/') ? file.path.slice(file.path.lastIndexOf('/') + 1) : file.path;
  const { data, error } = await destClient.storage.from(bucket).list(folder, { limit: 1000, search: name });
  if (error) return false;
  const hit = (data || []).find((x) => x.name === name);
  if (!hit) return false;
  if (file.size == null) return true;
  const bSize = hit.metadata?.size ?? hit.metadata?.contentLength;
  return bSize != null && String(bSize) === String(file.size);
}

/**
 * Kiểm tra file trên `from` đã có đủ trên `to` chưa (theo bucket).
 * @param {'primary'|'backup'} from
 * @param {'primary'|'backup'} to
 */
async function verifyStorageSync(from, to) {
  const { primary, backup } = clients();
  const srcClient = clientFor(from, { primary, backup });
  const destClient = clientFor(to, { primary, backup });

  const rows = [];
  for (const bucket of BUCKETS) {
    let sourceCount = null;
    let missingOnDest = null;
    let error = null;
    try {
      const files = await listFolder(srcClient, bucket);
      sourceCount = files.length;
      let missing = 0;
      for (const file of files) {
        if (!(await destHasSameFile(destClient, bucket, file))) missing += 1;
      }
      missingOnDest = missing;
    } catch (e) {
      error = e.message;
    }
    rows.push({
      bucket,
      source: from,
      dest: to,
      source_count: sourceCount,
      missing_on_dest: missingOnDest,
      ok: sourceCount != null && missingOnDest === 0,
      error,
    });
  }

  return {
    checked_at: new Date().toISOString(),
    from,
    to,
    buckets: BUCKETS,
    rows,
    all_ok: rows.every((r) => r.ok),
  };
}

async function copyOne(srcClient, destClient, bucket, file) {
  if (await destHasSameFile(destClient, bucket, file)) return 'skip_exists';

  const { data, error: dlErr } = await srcClient.storage.from(bucket).download(file.path);
  if (dlErr) throw new Error(`download ${file.path}: ${dlErr.message}`);

  const buf = Buffer.from(await data.arrayBuffer());
  const { error: upErr } = await destClient.storage.from(bucket).upload(file.path, buf, {
    contentType: file.mimetype || data.type || 'application/octet-stream',
    upsert: true,
  });
  if (upErr) throw new Error(`upload ${file.path}: ${upErr.message}`);
  return 'copied';
}

async function runPool(items, worker) {
  let i = 0;
  const results = { copied: 0, skip_exists: 0, errors: 0 };
  async function next() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        const r = await worker(item);
        results[r] = (results[r] || 0) + 1;
      } catch {
        results.errors += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => next()));
  return results;
}

/**
 * Đồng bộ file bucket từ `from` sang `to`.
 * @param {{ from: 'primary'|'backup', to: 'primary'|'backup', onLog?: (line: string) => void }} opts
 */
async function runStorageSync({ from, to, onLog } = {}) {
  if (from !== 'primary' && from !== 'backup') throw new Error('from phải là primary hoặc backup');
  if (to !== 'primary' && to !== 'backup') throw new Error('to phải là primary hoặc backup');
  if (from === to) return { ok: true, skipped: true };

  const log = (line) => {
    if (onLog) onLog(String(line));
  };

  const { primary, backup } = clients();
  const srcClient = clientFor(from, { primary, backup });
  const destClient = clientFor(to, { primary, backup });

  log(`[storage] Đồng bộ bucket ${from} → ${to}…`);

  const totals = { copied: 0, skip_exists: 0, errors: 0 };
  for (const bucket of BUCKETS) {
    log(`[storage] Bucket «${bucket}» — liệt kê file nguồn…`);
    await ensureBucket(destClient, bucket);
    const files = await listFolder(srcClient, bucket);
    log(`[storage] ${bucket}: ${files.length} objects`);

    const stats = await runPool(files, async (file) => {
      try {
        const r = await copyOne(srcClient, destClient, bucket, file);
        if (r === 'copied' && process.env.STORAGE_SYNC_VERBOSE === '1') {
          log(`[storage] ✓ ${bucket}/${file.path}`);
        }
        return r;
      } catch (e) {
        log(`[storage] ✗ ${bucket}/${file.path}: ${e.message}`);
        throw e;
      }
    });

    for (const k of Object.keys(totals)) totals[k] += stats[k] || 0;
    log(`[storage] ${bucket}: copied=${stats.copied} skip=${stats.skip_exists} errors=${stats.errors}`);
  }

  log(`[storage] Hoàn tất: copied=${totals.copied} skip=${totals.skip_exists} errors=${totals.errors}`);
  if (totals.errors > 0) {
    throw new Error(`Đồng bộ storage lỗi ${totals.errors} file`);
  }

  const verify = await verifyStorageSync(from, to);
  return { ok: verify.all_ok, verify, stats: totals };
}

async function summarizeBucketViaApi(client, bucketName) {
  const files = await listFolder(client, bucketName);
  let sizeBytes = 0;
  for (const f of files) {
    if (f.size != null) sizeBytes += Number(f.size) || 0;
  }
  return {
    name: bucketName,
    object_count: files.length,
    size_bytes: sizeBytes,
  };
}

module.exports = {
  verifyStorageSync,
  runStorageSync,
  getStorageBuckets: () => [...BUCKETS],
  summarizeBucketViaApi,
};
