import { useEffect, useRef } from 'react';
import { pickDefaultCompanyId } from '../lib/crmCompanyFilter';

/**
 * Khi bộ lọc công ty đang trống, gán một công ty một lần.
 * Người dùng vẫn chọn lại «Tất cả» (rỗng) sau đó mà không bị ghi đè.
 */
export function useDefaultCompanyOnce(companyId, setCompanyId, companies, {
  enabled = true,
  preferredId = '',
} = {}) {
  const filledRef = useRef(Boolean(companyId));
  useEffect(() => {
    if (!enabled) return;
    if (companyId) {
      filledRef.current = true;
      return;
    }
    if (filledRef.current) return;
    const next = pickDefaultCompanyId(companies, { preferredId });
    if (!next) return;
    filledRef.current = true;
    setCompanyId(next);
  }, [enabled, companyId, companies, preferredId, setCompanyId]);
}
