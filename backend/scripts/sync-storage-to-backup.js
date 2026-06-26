#!/usr/bin/env node
/**
 * Đồng bộ Supabase Storage primary → backup (incremental theo path + size).
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_BACKUP_URL, SUPABASE_BACKUP_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/sync-storage-to-backup.js
 *   node scripts/sync-storage-to-backup.js --bucket attachments
 *   node scripts/sync-storage-to-backup.js --dry-run
 *   node scripts/sync-storage-to-backup.js --since-days 7
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const BUCKETS = (process.env.STORAGE_SYNC_BUCKETS || 'attachments,app-releases,ghi-am')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const CONCURRENCY = Math.max(1, parseInt(process.env.STORAGE_SYNC_CONCURRENCY || '6', 10));
const dryRun = process.argv.includes('--dry-run');
const sinceDays = (() => {
  const arg = process.argv.find((a) => a.startsWith('--since-days='));
  if (!arg) return null;
  const n = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();
const bucketFilter = (() => {
  const i = process.argv.indexOf('--bucket');
  return i >= 0 ? process.argv[i + 1] : null;
})();

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`Thiếu ${name} trong backend/.env`);
  return process.env[name];
}

const primary = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const backup = createClient(requireEnv('SUPABASE_BACKUP_URL'), requireEnv('SUPABASE_BACKUP_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
          updated_at: item.updated_at || item.created_at || null,
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

async function backupHasSameFile(bucket, file) {
  const folder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
  const name = file.path.includes('/') ? file.path.slice(file.path.lastIndexOf('/') + 1) : file.path;
  const { data, error } = await backup.storage.from(bucket).list(folder, { limit: 1000, search: name });
  if (error) return false;
  const hit = (data || []).find((x) => x.name === name);
  if (!hit) return false;
  if (file.size == null) return true;
  const bSize = hit.metadata?.size ?? hit.metadata?.contentLength;
  return bSize != null && String(bSize) === String(file.size);
}

async function copyOne(bucket, file) {
  if (sinceDays && file.updated_at) {
    const cutoff = Date.now() - sinceDays * 86400000;
    if (new Date(file.updated_at).getTime() < cutoff) return 'skip_old';
  }
  if (await backupHasSameFile(bucket, file)) return 'skip_exists';

  if (dryRun) {
    console.log(`[dry-run] would copy ${bucket}/${file.path}`);
    return 'copied';
  }

  const { data, error: dlErr } = await primary.storage.from(bucket).download(file.path);
  if (dlErr) throw new Error(`download ${file.path}: ${dlErr.message}`);

  const buf = Buffer.from(await data.arrayBuffer());
  const { error: upErr } = await backup.storage.from(bucket).upload(file.path, buf, {
    contentType: file.mimetype || data.type || 'application/octet-stream',
    upsert: true,
  });
  if (upErr) throw new Error(`upload ${file.path}: ${upErr.message}`);
  return 'copied';
}

async function runPool(items, worker) {
  let i = 0;
  const results = { copied: 0, skip_exists: 0, skip_old: 0, errors: 0 };
  async function next() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      try {
        const r = await worker(item);
        results[r] = (results[r] || 0) + 1;
        if ((results.copied + results.skip_exists) % 50 === 0 && results.copied > 0) {
          process.stdout.write(`\r  … ${results.copied} copied, ${results.skip_exists} skipped`);
        }
      } catch (e) {
        results.errors += 1;
        console.error(`\n  ✗ ${item.path}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => next()));
  return results;
}

async function syncBucket(bucket) {
  console.log(`\n[${bucket}] list primary…`);
  await ensureBucket(backup, bucket);
  const files = await listFolder(primary, bucket);
  console.log(`[${bucket}] ${files.length} objects`);

  const stats = await runPool(files, (file) => copyOne(bucket, file));
  console.log(`\n[${bucket}] copied=${stats.copied} skip_exists=${stats.skip_exists} skip_old=${stats.skip_old || 0} errors=${stats.errors}`);
  return stats;
}

async function main() {
  const buckets = bucketFilter ? [bucketFilter] : BUCKETS;
  console.log('[storage-sync] primary → backup', dryRun ? '(dry-run)' : '', sinceDays ? `(since ${sinceDays}d)` : '(full)');

  let total = { copied: 0, skip_exists: 0, skip_old: 0, errors: 0 };
  for (const b of buckets) {
    const s = await syncBucket(b);
    for (const k of Object.keys(total)) total[k] += s[k] || 0;
  }
  console.log('\n[storage-sync] Done:', total);
  if (total.errors) process.exit(1);
}

main().catch((e) => {
  console.error('[storage-sync]', e.message);
  process.exit(1);
});
