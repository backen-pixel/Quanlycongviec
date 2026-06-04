/** Luôn nổi trên modal/toast trong app (z-[9999]). */
export const CALL_OVERLAY_Z_INDEX = 2147483646;

export function callOverlayZ(extra = 0) {
  return { zIndex: CALL_OVERLAY_Z_INDEX + extra };
}
