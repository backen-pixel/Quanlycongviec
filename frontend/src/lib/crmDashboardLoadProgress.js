/** Thời gian trượt 0 → STALL nếu API chưa xong */
const CREEP_MS = 1500;
/** % tối đa tự chạy trước khi chờ API (tránh nhảy 100% khi chưa xong) */
const STALL_PCT = 88;
/** Thời gian chạy STALL → 100 sau khi API sẵn sàng */
const FINISH_MS = 520;
/** Lerp mượt khi đang chờ API */
const LERP_CREEP = 0.11;
/** Lerp nhanh hơn khi API xong — đảm bảo kịp lên 100% trước khi ẩn loader */
const LERP_FINISH = 0.34;
/** Tối thiểu hiển thị loader (load nhanh vẫn mượt) */
const MIN_TOTAL_MS = 1200;
/** Bắt đầu giai đoạn kết thúc khi đã qua MIN_TOTAL và creep đủ cao */
const MIN_CREEP_BEFORE_FINISH = STALL_PCT * 0.82;

function easeOut(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 2.6;
}

function creepProgress(elapsedMs) {
  return easeOut(elapsedMs / CREEP_MS) * STALL_PCT;
}

/**
 * Điều khiển thanh % CRM: luôn chạy mượt 0→100, không phụ thuộc nhảy theo từng API.
 * @param {(value: number) => void} setProgress
 */
export function createCrmLoadProgressController(setProgress) {
  let seq = 0;
  let rafId = null;
  let displayed = 0;
  let startedAt = 0;
  let apiReadyAt = null;
  let finishPhaseAt = null;
  let pendingOnDone = null;

  const cancelFrame = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const complete = () => {
    cancelFrame();
    setProgress(100);
    displayed = 100;
    const done = pendingOnDone;
    pendingOnDone = null;
    window.setTimeout(() => {
      setProgress(0);
      displayed = 0;
      done?.();
    }, 320);
  };

  const tick = (now, mySeq) => {
    if (mySeq !== seq) return;

    const elapsed = now - startedAt;
    const creep = creepProgress(elapsed);
    let target = creep;

    if (apiReadyAt != null) {
      const canFinish = elapsed >= MIN_TOTAL_MS && creep >= MIN_CREEP_BEFORE_FINISH;
      if (!canFinish) {
        target = creep;
      } else {
        if (finishPhaseAt == null) finishPhaseAt = now;
        const finishElapsed = now - finishPhaseAt;
        const finishT = easeOut(finishElapsed / FINISH_MS);
        target = STALL_PCT + finishT * (100 - STALL_PCT);
      }
    }

    const inFinishPhase = apiReadyAt != null && finishPhaseAt != null;
    const lerp = inFinishPhase ? LERP_FINISH : LERP_CREEP;
    displayed += (target - displayed) * lerp;
    if (target - displayed < 0.08) displayed = target;

    setProgress(Math.round(displayed));

    if (inFinishPhase) {
      const finishElapsed = now - finishPhaseAt;
      if (finishElapsed >= FINISH_MS || displayed >= 99.5) {
        complete();
        return;
      }
    }

    rafId = requestAnimationFrame((t) => tick(t, mySeq));
  };

  return {
    start() {
      if (pendingOnDone) {
        const done = pendingOnDone;
        pendingOnDone = null;
        done();
      }
      seq += 1;
      const mySeq = seq;
      cancelFrame();
      displayed = 0;
      startedAt = performance.now();
      apiReadyAt = null;
      finishPhaseAt = null;
      pendingOnDone = null;
      setProgress(0);
      rafId = requestAnimationFrame((now) => {
        if (mySeq !== seq) return;
        startedAt = now;
        tick(now, mySeq);
      });
    },

    finish(onDone) {
      pendingOnDone = onDone;
      if (apiReadyAt == null) apiReadyAt = performance.now();
    },

    reset() {
      if (pendingOnDone) {
        const done = pendingOnDone;
        pendingOnDone = null;
        done();
      }
      seq += 1;
      cancelFrame();
      displayed = 0;
      apiReadyAt = null;
      finishPhaseAt = null;
      pendingOnDone = null;
      setProgress(0);
    },

    dispose() {
      seq += 1;
      cancelFrame();
      pendingOnDone = null;
    },
  };
}
