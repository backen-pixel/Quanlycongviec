'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const M = require('../src/helpers/callRecordingMeta');

const NOW = Date.parse('2026-10-12T10:00:00Z');
const iso = (name) => {
  const d = M.parseRecordingFileTime(name, { nowMs: NOW });
  return d ? d.toISOString() : null;
};

test('parseRecordingFileTime: Samsung and tolerated variants, Vietnam local time', () => {
  assert.equal(iso('Ghi âm cuộc gọi 0385197809_261007_203408.m4a'), '2026-10-07T13:34:08.000Z');
  assert.equal(iso('Call recording Anh Hùng Tủ Bếp_261007_203408.m4a'), '2026-10-07T13:34:08.000Z');
  assert.equal(iso('0385197809_20261007_203408.m4a'), '2026-10-07T13:34:08.000Z');
  assert.equal(iso('0385197809-261007-203408.3gp'), '2026-10-07T13:34:08.000Z');
  assert.equal(iso('0385197809 261007 203408.amr'), '2026-10-07T13:34:08.000Z');
  assert.equal(iso('261007_203408'), '2026-10-07T13:34:08.000Z'); // no extension
  assert.equal(iso('/sdcard/Recordings/Call/x_261007_000005.m4a'), '2026-10-06T17:00:05.000Z'); // crosses UTC day
});

test('parseRecordingFileTime: bad or implausible names are rejected', () => {
  for (const bad of [null, undefined, '', 'recording.m4a', 'Ghi âm cuộc gọi 0385197809.m4a',
    'x_261307_203408.m4a', // month 13
    'x_260231_203408.m4a', // 31 Feb
    'x_261007_246000.m4a', // hour 24
    'x_261007_206100.m4a', // minute 61
    'x_261020_203408.m4a', // future (> now + 2 days)
    'x_140101_000000.m4a', // before 2015
    'x_261007_203408_extra.m4a', // time not at the end
    '0385197809261007_203408.m4a', // date glued to the number
    'x_2610071_203408.m4a']) {
    assert.equal(M.parseRecordingFileTime(bad, { nowMs: NOW }), null, String(bad));
  }
});

const box = (type, payload) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
};
function mvhdV0(timescale, duration) {
  const p = Buffer.alloc(100);
  p[0] = 0;
  p.writeUInt32BE(timescale, 12);
  p.writeUInt32BE(duration, 16);
  return box('mvhd', p);
}
function mvhdV1(timescale, duration) {
  const p = Buffer.alloc(112);
  p[0] = 1;
  p.writeUInt32BE(timescale, 20);
  p.writeBigUInt64BE(BigInt(duration), 24);
  return box('mvhd', p);
}
const ftyp = box('ftyp', Buffer.from('M4A \0\0\0\0isomM4A ', 'latin1'));
const mdat = box('mdat', Buffer.alloc(500, 7));

test('parseMp4DurationSec: mvhd v0 and v1, moov before or after mdat', () => {
  // moov after mdat (typical phone recording), trak box before mvhd inside moov
  const v0 = Buffer.concat([ftyp, mdat, box('moov', Buffer.concat([box('udta', Buffer.alloc(4)), mvhdV0(44100, 44100 * 125)]))]);
  assert.equal(M.parseMp4DurationSec(v0), 125);
  const v1 = Buffer.concat([ftyp, box('moov', mvhdV1(1000, 37500)), mdat]);
  assert.equal(M.parseMp4DurationSec(v1), 37.5);
  // 64-bit largesize mdat
  const large = Buffer.alloc(16 + 10);
  large.writeUInt32BE(1, 0); large.write('mdat', 4, 'latin1'); large.writeBigUInt64BE(26n, 8);
  assert.equal(M.parseMp4DurationSec(Buffer.concat([ftyp, large, box('moov', mvhdV0(8000, 8000 * 61))])), 61);
});

test('parseMp4DurationSec: invalid input returns null', () => {
  assert.equal(M.parseMp4DurationSec(null), null);
  assert.equal(M.parseMp4DurationSec(Buffer.alloc(4)), null);
  assert.equal(M.parseMp4DurationSec(Buffer.from('#!AMR\n'.repeat(10))), null);
  assert.equal(M.parseMp4DurationSec(Buffer.concat([ftyp, mdat])), null); // no moov
  assert.equal(M.parseMp4DurationSec(Buffer.concat([ftyp, box('moov', mvhdV0(0, 100))])), null); // timescale 0
  assert.equal(M.parseMp4DurationSec(Buffer.concat([ftyp, box('moov', mvhdV0(1000, 0xffffffff))])), null); // unknown
  assert.equal(M.parseMp4DurationSec(Buffer.concat([ftyp, box('moov', mvhdV0(1, 90000))])), null); // > 1 day
  const truncated = Buffer.concat([ftyp, box('moov', mvhdV1(1000, 5000))]).subarray(0, 60);
  assert.equal(M.parseMp4DurationSec(truncated), null);
  const corrupt = Buffer.concat([ftyp, mdat]); corrupt.writeUInt32BE(3, ftyp.length); // box size < header
  assert.equal(M.parseMp4DurationSec(corrupt), null);
});

test('readMp4DurationSecFromFile reads the moov box from disk; missing file is null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-meta-'));
  try {
    const f = path.join(dir, 'a.m4a');
    fs.writeFileSync(f, Buffer.concat([ftyp, mdat, box('moov', mvhdV1(48000, 48000 * 42))]));
    assert.equal(await M.readMp4DurationSecFromFile(f), 42);
    const g = path.join(dir, 'b.m4a');
    fs.writeFileSync(g, Buffer.concat([ftyp, mdat]));
    assert.equal(await M.readMp4DurationSecFromFile(g), null);
    assert.equal(await M.readMp4DurationSecFromFile(path.join(dir, 'missing.m4a')), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('STT worker fills only missing duration / call time; upload route module loads', () => {
  const { missingCallMeta } = require('../src/jobs/voiceSttWorker');
  const name = 'Ghi âm cuộc gọi 0385197809_261007_203408.m4a';
  assert.deepEqual(missingCallMeta({ file_name: name, duration_sec: null, call_started_at: null }, { duration_sec: 61.2 }),
    { duration_sec: 61.2, call_started_at: '2026-10-07T13:34:08.000Z' });
  assert.deepEqual(missingCallMeta({ file_name: name, duration_sec: 10, call_started_at: '2026-10-07T13:00:00Z' },
    { duration_sec: 61.2 }), {});
  assert.deepEqual(missingCallMeta({ file_name: 'recording.m4a', duration_sec: null }, { duration_sec: null }), {});
  assert.ok(require('../src/routes/voiceRecordings'));
});
