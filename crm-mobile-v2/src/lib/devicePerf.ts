/**
 * Phân tầng hiệu năng thiết bị — máy đời thấp (RAM thấp / Android cũ)
 * dùng buffer nhỏ hơn, ít song song API, FlatList “nhẹ” hơn.
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type PerfTier = 'low' | 'mid' | 'high';

let cachedTier: PerfTier | null = null;

/** RAM (GB). expo-device trả bytes; emulator thường thiếu → coi mid. */
function memoryGb(): number {
  const bytes = Device.totalMemory;
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return 0;
  return bytes / (1024 * 1024 * 1024);
}

export function getPerfTier(): PerfTier {
  if (cachedTier) return cachedTier;

  const gb = memoryGb();
  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version) || 0;

  // Android: < ~3.5GB hoặc API ≤ 28 (Android 9) → low
  if (Platform.OS === 'android') {
    if ((gb > 0 && gb < 3.5) || (api > 0 && api <= 28)) {
      cachedTier = 'low';
      return cachedTier;
    }
    if ((gb > 0 && gb < 5.5) || (api > 0 && api <= 30)) {
      cachedTier = 'mid';
      return cachedTier;
    }
  } else if (gb > 0 && gb < 3) {
    cachedTier = 'low';
    return cachedTier;
  }

  cachedTier = 'high';
  return cachedTier;
}

/** Số card Deadline giữ trong RAM theo tầng máy. */
export function getDeadlineMaxBuffer(): number {
  const tier = getPerfTier();
  if (tier === 'low') return 100;
  if (tier === 'mid') return 200;
  return 400;
}

export type DeadlinePerfLimits = {
  tier: PerfTier;
  firstPaint: number;
  bgSync: number;
  stageConcurrency: number;
  countConcurrency: number;
  countPage: number;
  countMaxRows: number;
  progressEvery: number;
  /** Trễ trước khi quét badge cột (ms) — nhường first-paint + drain. */
  countsDelayMs: number;
  /** Máy yếu: chỉ tải tab đang xem trước, tab kia sau. */
  parallelKinds: boolean;
  listInitial: number;
  listBatch: number;
  listWindow: number;
};

export function getDeadlinePerfLimits(): DeadlinePerfLimits {
  const tier = getPerfTier();
  if (tier === 'low') {
    return {
      tier,
      firstPaint: 40,
      bgSync: 120,
      stageConcurrency: 2,
      countConcurrency: 1,
      countPage: 300,
      countMaxRows: 2500,
      progressEvery: 200,
      countsDelayMs: 120,
      parallelKinds: false,
      listInitial: 5,
      listBatch: 4,
      listWindow: 3,
    };
  }
  if (tier === 'mid') {
    return {
      tier,
      firstPaint: 60,
      bgSync: 160,
      stageConcurrency: 3,
      countConcurrency: 2,
      countPage: 500,
      countMaxRows: 6000,
      progressEvery: 180,
      countsDelayMs: 80,
      parallelKinds: true,
      listInitial: 6,
      listBatch: 6,
      listWindow: 5,
    };
  }
  return {
    tier,
    firstPaint: 80,
    bgSync: 200,
    stageConcurrency: 4,
    countConcurrency: 3,
    countPage: 800,
    countMaxRows: 8000,
    progressEvery: 120,
    countsDelayMs: 40,
    parallelKinds: true,
    listInitial: 8,
    listBatch: 8,
    listWindow: 5,
  };
}

/** Giới hạn Tin nhắn / avatar — máy yếu tránh decode ảnh full-res. */
export type MessengerPerfLimits = {
  tier: PerfTier;
  /** Không tải avatar remote (chỉ chữ cái) — giảm RAM decode mạnh. */
  skipRemoteAvatars: boolean;
  onlineStripMax: number;
  listInitial: number;
  listBatch: number;
  listWindow: number;
};

export function getMessengerPerfLimits(): MessengerPerfLimits {
  const tier = getPerfTier();
  if (tier === 'low') {
    return {
      tier,
      skipRemoteAvatars: true,
      onlineStripMax: 8,
      listInitial: 6,
      listBatch: 4,
      listWindow: 3,
    };
  }
  if (tier === 'mid') {
    return {
      tier,
      skipRemoteAvatars: false,
      onlineStripMax: 12,
      listInitial: 8,
      listBatch: 6,
      listWindow: 5,
    };
  }
  return {
    tier,
    skipRemoteAvatars: false,
    onlineStripMax: 20,
    listInitial: 12,
    listBatch: 10,
    listWindow: 7,
  };
}
