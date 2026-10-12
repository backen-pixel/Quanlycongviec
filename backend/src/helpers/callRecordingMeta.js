'use strict';

// Metadata recovered from a call recording when the phone app sends none:
//  - call start from the recorder's file name (Samsung: "<number or name>_YYMMDD_HHMMSS.m4a", local time);
//  - duration from the MP4/M4A/3GP 'moov/mvhd' box.
// Pure helpers: never throw on bad input, return null instead.
const fs = require('fs');

const VN_OFFSET_MS = 7 * 3600000; // Asia/Ho_Chi_Minh, no DST
const MIN_FILE_TIME_MS = Date.UTC(2015, 0, 1);
const MAX_FUTURE_MS = 2 * 86400000;
// "..._261007_203408.m4a", "...-20261007-203408.m4a", "... 261007 203408.3gp"
const FILE_TIME = /(?:^|[_\-\s])(\d{8}|\d{6})[_\-\s](\d{6})\s*$/;
const MAX_DURATION_SEC = 86400;
const MAX_MOOV_BYTES = 32 * 1024 * 1024;

/**
 * Call start encoded at the end of a recorder file name, read as Vietnam local time.
 * @param {string} fileName
 * @param {{ nowMs?: number }} [opts] values after now + 2 days or before 2015 are rejected
 * @returns {Date|null}
 */
function parseRecordingFileTime(fileName, { nowMs = Date.now() } = {}) {
  if (fileName == null) return null;
  const base = String(fileName).split(/[\\/]/).pop().trim();
  const stem = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const m = FILE_TIME.exec(stem);
  if (!m) return null;
  const date = m[1];
  const year = date.length === 8 ? Number(date.slice(0, 4)) : 2000 + Number(date.slice(0, 2));
  const rest = date.slice(date.length - 4);
  const month = Number(rest.slice(0, 2));
  const day = Number(rest.slice(2, 4));
  const hour = Number(m[2].slice(0, 2));
  const minute = Number(m[2].slice(2, 4));
  const second = Number(m[2].slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const localMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(localMs);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null; // e.g. 31/02
  const ms = localMs - VN_OFFSET_MS;
  if (ms < MIN_FILE_TIME_MS || (Number.isFinite(nowMs) && ms > nowMs + MAX_FUTURE_MS)) return null;
  return new Date(ms);
}

/** Size and header length of the box at `pos`, or null when it does not fit in `end`. */
function boxAt(buf, pos, end) {
  if (pos + 8 > end) return null;
  let size = buf.readUInt32BE(pos);
  const type = buf.toString('latin1', pos + 4, pos + 8);
  let header = 8;
  if (size === 1) {
    if (pos + 16 > end) return null;
    const big = buf.readBigUInt64BE(pos + 8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(big);
    header = 16;
  } else if (size === 0) {
    size = end - pos; // box runs to the end
  }
  if (size < header) return null;
  return { type, size, header };
}

function findChild(buf, start, end, type) {
  let pos = start;
  while (pos + 8 <= end) {
    const box = boxAt(buf, pos, end);
    if (!box) return null;
    if (box.type === type) return { start: pos + box.header, end: Math.min(pos + box.size, end), full: pos + box.size <= end };
    pos += box.size;
  }
  return null;
}

/**
 * Duration in seconds from the 'moov/mvhd' box of an MP4 / M4A / 3GP file (versions 0 and 1).
 * `buffer` may be the whole file or any buffer whose top-level boxes include 'moov'.
 * @returns {number|null}
 */
function parseMp4DurationSec(buffer) {
  try {
    if (!buffer || typeof buffer.length !== 'number' || buffer.length < 16) return null;
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const moov = findChild(buf, 0, buf.length, 'moov');
    if (!moov) return null;
    const mvhd = findChild(buf, moov.start, moov.end, 'mvhd');
    if (!mvhd) return null;
    const p = mvhd.start;
    const version = buf[p];
    let timescale;
    let duration;
    if (version === 0) {
      if (p + 20 > mvhd.end) return null;
      timescale = buf.readUInt32BE(p + 12);
      const raw = buf.readUInt32BE(p + 16);
      if (raw === 0xffffffff) return null; // unknown
      duration = raw;
    } else if (version === 1) {
      if (p + 32 > mvhd.end) return null;
      timescale = buf.readUInt32BE(p + 20);
      const raw = buf.readBigUInt64BE(p + 24);
      if (raw === 0xffffffffffffffffn || raw > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      duration = Number(raw);
    } else {
      return null;
    }
    if (!timescale || !duration) return null;
    const sec = duration / timescale;
    if (!Number.isFinite(sec) || sec <= 0 || sec >= MAX_DURATION_SEC) return null;
    return Math.round(sec * 1000) / 1000;
  } catch {
    return null;
  }
}

/**
 * Same as parseMp4DurationSec for a file on disk, reading only the top-level box headers and the
 * 'moov' box (the moov atom often sits at the end of phone recordings).
 * @returns {Promise<number|null>}
 */
async function readMp4DurationSecFromFile(filePath) {
  let fh;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const { size: fileSize } = await fh.stat();
    const head = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= fileSize) {
      const { bytesRead } = await fh.read(head, 0, 16, pos);
      if (bytesRead < 8) return null;
      const small = head.readUInt32BE(0);
      const box = small === 0 ? { type: head.toString('latin1', 4, 8), size: fileSize - pos }
        : boxAt(head, 0, bytesRead);
      if (!box) return null;
      const size = box.size;
      if (box.type === 'moov') {
        const len = Math.min(size, fileSize - pos);
        if (len > MAX_MOOV_BYTES) return null;
        const moov = Buffer.alloc(len);
        await fh.read(moov, 0, len, pos);
        return parseMp4DurationSec(moov);
      }
      pos += size;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

module.exports = { parseRecordingFileTime, parseMp4DurationSec, readMp4DurationSecFromFile };
