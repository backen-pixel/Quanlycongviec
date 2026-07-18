/**
 * Gọi OpenAI Audio Transcriptions (Whisper) cho file ghi âm.
 * Ghi âm Android Call Recorder thường là 3GP (ftyp3gp4) — convert sang mp3 bằng ffmpeg-static.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { voiceBucketName } = require('./voiceStorageUpload');

const DEFAULT_MODEL = 'whisper-1';
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function voiceSttModel() {
  return String(process.env.VOICE_STT_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function voiceSttMaxBytes() {
  const n = parseInt(String(process.env.VOICE_STT_MAX_BYTES || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

function voiceSttMaxDurationSec() {
  const n = parseInt(String(process.env.VOICE_STT_MAX_DURATION_SEC || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const STT_EXT_MIME = {
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.mpeg': 'audio/mpeg',
  '.mpga': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
};

/** Tên file ASCII + đuôi hợp lệ cho OpenAI transcriptions. */
function sanitizeVoiceSttFileName(raw) {
  const base = path.basename(String(raw || 'recording.m4a'));
  let ext = path.extname(base).toLowerCase();
  if (!STT_EXT_MIME[ext]) ext = '.m4a';
  return `recording${ext}`;
}

function guessVoiceSttMime(fileName, mimeType) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (STT_EXT_MIME[ext]) return STT_EXT_MIME[ext];
  const m = mimeType != null ? String(mimeType).trim().toLowerCase() : '';
  if (m && m !== 'application/octet-stream') return m;
  return 'audio/mp4';
}

/** Android call recorder thường ghi ftyp3gp4 — OpenAI Whisper không nhận 3GP. */
function needsFfmpegTranscode(buffer) {
  if (!buffer || buffer.length < 12) return true;
  const brand = buffer.slice(4, 12).toString('latin1');
  if (brand.includes('3gp') || brand.includes('3g2')) return true;
  // ISO BMFF không rõ brand → vẫn thử convert nếu sau này fail; ở đây chỉ pre-convert 3gp
  return false;
}

function resolveFfmpegPath() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ignore */
  }
  return process.env.FFMPEG_PATH || null;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpegPath();
    if (!bin) {
      const err = new Error('Thiếu ffmpeg (cài ffmpeg-static hoặc set FFMPEG_PATH)');
      err.code = 'NO_FFMPEG';
      reject(err);
      return;
    }
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const err = new Error(`ffmpeg thoát ${code}: ${stderr.slice(-400)}`);
        err.code = 'FFMPEG_FAIL';
        reject(err);
      }
    });
  });
}

/**
 * Convert buffer (3gp/…) → mp3 để OpenAI chấp nhận.
 * @returns {Promise<{ buffer: Buffer, fileName: string, mimeType: string }>}
 */
async function ensureOpenAiFriendlyAudio(buffer, meta = {}) {
  const inputBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!needsFfmpegTranscode(inputBuf)) {
    const fileName = sanitizeVoiceSttFileName(meta.fileName || meta.storagePath || 'recording.m4a');
    return {
      buffer: inputBuf,
      fileName,
      mimeType: guessVoiceSttMime(fileName, meta.mimeType),
    };
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-stt-'));
  const inPath = path.join(tmpDir, 'in.3gp');
  const outPath = path.join(tmpDir, 'out.mp3');
  try {
    fs.writeFileSync(inPath, inputBuf);
    await runFfmpeg([
      '-y',
      '-i',
      inPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-b:a',
      '64k',
      outPath,
    ]);
    const out = fs.readFileSync(outPath);
    return { buffer: out, fileName: 'recording.mp3', mimeType: 'audio/mpeg' };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Đọc buffer audio từ Supabase Storage hoặc đường dẫn local uploads/.
 */
async function loadVoiceAudioBuffer(supabase, storagePath) {
  if (!storagePath) {
    const err = new Error('Thiếu storage_path');
    err.code = 'NO_STORAGE';
    throw err;
  }

  if (String(storagePath).startsWith('uploads/')) {
    const abs = path.resolve(path.join(__dirname, '../../', storagePath));
    const root = path.resolve(path.join(__dirname, '../../uploads/voice_recordings'));
    if (!abs.startsWith(root) || !fs.existsSync(abs)) {
      const err = new Error('Không tìm thấy file ghi âm trên đĩa');
      err.code = 'FILE_MISSING';
      throw err;
    }
    return {
      buffer: fs.readFileSync(abs),
      fileName: path.basename(abs),
    };
  }

  const bucket = voiceBucketName();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);
  if (error || !data) {
    const err = new Error(error?.message || 'Không tải được file từ storage');
    err.code = 'STORAGE_DOWNLOAD';
    throw err;
  }
  const ab = await data.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    fileName: path.basename(String(storagePath)) || 'recording.m4a',
  };
}

/**
 * @param {Buffer} buffer
 * @param {{ fileName?: string, mimeType?: string|null, language?: string, storagePath?: string }} meta
 * @returns {Promise<{ text: string, model: string, language: string }>}
 */
async function transcribeAudioBuffer(buffer, meta = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('Chưa cấu hình OPENAI_API_KEY');
    err.code = 'NO_API_KEY';
    throw err;
  }

  const prepared = await ensureOpenAiFriendlyAudio(buffer, meta);
  const maxBytes = voiceSttMaxBytes();
  if (prepared.buffer.length > maxBytes) {
    const err = new Error(`File vượt giới hạn STT (${Math.round(maxBytes / (1024 * 1024))}MB)`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const model = voiceSttModel();
  const language = String(meta.language || process.env.VOICE_STT_LANGUAGE || 'vi').slice(0, 16);
  const safeName = prepared.fileName;
  const mime = prepared.mimeType;

  const form = new FormData();
  const bytes = new Uint8Array(prepared.buffer);
  const blob =
    typeof File !== 'undefined'
      ? new File([bytes], safeName, { type: mime })
      : new Blob([bytes], { type: mime });
  if (typeof File !== 'undefined' && blob instanceof File) form.append('file', blob);
  else form.append('file', blob, safeName);
  form.append('model', model);
  if (language) form.append('language', language);
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { error: { message: raw?.slice(0, 500) || 'Phản hồi không hợp lệ' } };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `OpenAI STT HTTP ${res.status}`;
    const err = new Error(msg);
    err.code = 'OPENAI_STT';
    err.status = res.status;
    throw err;
  }

  const text = json?.text != null ? String(json.text) : '';
  return { text, model, language };
}

/**
 * Tải + STT một bản ghi voice_recordings.
 */
async function transcribeVoiceRecordingRow(supabase, row) {
  const maxDur = voiceSttMaxDurationSec();
  if (maxDur > 0 && row?.duration_sec != null) {
    const d = Number(row.duration_sec);
    if (Number.isFinite(d) && d > maxDur) {
      const err = new Error(`Thời lượng vượt giới hạn STT (${maxDur}s)`);
      err.code = 'DURATION_TOO_LONG';
      throw err;
    }
  }

  const { buffer, fileName } = await loadVoiceAudioBuffer(supabase, row.storage_path);
  return transcribeAudioBuffer(buffer, {
    fileName: row.file_name || fileName,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    language: row.transcript_language || 'vi',
  });
}

module.exports = {
  voiceSttModel,
  voiceSttMaxBytes,
  voiceSttMaxDurationSec,
  loadVoiceAudioBuffer,
  transcribeAudioBuffer,
  transcribeVoiceRecordingRow,
  ensureOpenAiFriendlyAudio,
};
