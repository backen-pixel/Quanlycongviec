import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Mốc «đã xem bình luận» theo từng luồng, lưu NGAY TRÊN MÁY (không ghi lên máy chủ, không phát sự kiện «đã xem» cho người khác).
 * Khoá = id deal (`lead:<id>`); giá trị = `created_at` của bình luận mới nhất người dùng đã mở xem (giờ máy chủ, tránh lệch đồng hồ).
 * Dùng cho huy hiệu «N mới» ở danh sách nhiệm vụ quá hạn. Không đồng bộ với «đã xem» trên web / thiết bị khác.
 */
const STORAGE_KEY = 'sx:commentSeen:v1';

let cache: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;

async function load(): Promise<Record<string, string>> {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        cache = parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
      } catch {
        cache = {};
      }
      return cache;
    })();
  }
  return loading;
}

export function commentSeenKey(leadId: string): string {
  return `lead:${leadId}`;
}

/** Toàn bộ mốc đã xem (đọc một lần, giữ trong bộ nhớ). */
export async function getCommentSeenMap(): Promise<Record<string, string>> {
  return load();
}

/** Ghi nhận đã xem tới bình luận có `createdAt` (chỉ tiến lên, không lùi). */
export async function markCommentsSeen(leadId: string, createdAt: string | null | undefined): Promise<void> {
  if (!leadId || !createdAt) return;
  const map = await load();
  const key = commentSeenKey(leadId);
  const prev = map[key];
  if (prev && prev >= createdAt) return;
  map[key] = createdAt;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* bộ nhớ đầy / bị chặn: giữ trong RAM, lần sau tính lại */ }
}
