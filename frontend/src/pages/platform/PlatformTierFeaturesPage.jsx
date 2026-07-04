import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Puzzle, Check, X } from 'lucide-react';
import { TIER_ORDER, TIER_LABELS, TIER_COLORS, FEATURE_LABELS } from '../../lib/platformConstants';

export default function PlatformTierFeaturesPage() {
  const navigate = useNavigate();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/platform/tier-features')
      .then(({ data }) => setFeatures(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const allFeatureKeys = [...new Set(features.map((f) => f.feature_key))];
  const orderedFeatureKeys = Object.keys(FEATURE_LABELS).filter((k) => allFeatureKeys.includes(k));
  const remaining = allFeatureKeys.filter((k) => !orderedFeatureKeys.includes(k));
  const finalKeys = [...orderedFeatureKeys, ...remaining];

  const matrix = {};
  features.forEach((f) => {
    if (!matrix[f.feature_key]) matrix[f.feature_key] = {};
    matrix[f.feature_key][f.tier] = f.enabled;
  });

  const toggle = async (featureKey, tier) => {
    const current = matrix[featureKey]?.[tier] ?? false;
    const key = `${featureKey}:${tier}`;
    setSavingKey(key);
    try {
      await api.patch('/platform/tier-features', {
        feature_key: featureKey,
        tier,
        enabled: !current,
      });
      setFeatures((prev) => {
        const idx = prev.findIndex((f) => f.feature_key === featureKey && f.tier === tier);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], enabled: !current };
          return next;
        }
        return [...prev, { feature_key: featureKey, tier, enabled: !current }];
      });
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi cập nhật');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-purple-600" />
          Tính năng theo gói
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Nhấn ô để bật/tắt tính năng mặc định cho từng tier. Override riêng tại chi tiết tenant.</p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Đang tải...</div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-4 font-semibold text-gray-700 w-[240px]">Tính năng</th>
                  {TIER_ORDER.map((tier) => (
                    <th key={tier} className="text-center px-4 py-4">
                      <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${TIER_COLORS[tier]}`}>
                        {TIER_LABELS[tier]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {finalKeys.map((key) => (
                  <tr key={key} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-800">{FEATURE_LABELS[key] || key}</td>
                    {TIER_ORDER.map((tier) => {
                      const enabled = matrix[key]?.[tier] ?? false;
                      const busy = savingKey === `${key}:${tier}`;
                      return (
                        <td key={tier} className="text-center px-4 py-3.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggle(key, tier)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                              enabled ? 'bg-teal-100 hover:bg-teal-200' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                            title={enabled ? 'Tắt' : 'Bật'}
                          >
                            {enabled ? (
                              <Check className="h-4 w-4 text-teal-600" />
                            ) : (
                              <X className="h-4 w-4 text-gray-300" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800">
        <strong>Lưu ý:</strong> Thay đổi ở đây chỉ áp dụng cho tenant mới hoặc khi sync lại features.
        Override từng HST tại{' '}
        <button type="button" onClick={() => navigate('/platform/tenants')} className="underline font-medium cursor-pointer">
          chi tiết tenant → tab Tính năng
        </button>.
      </div>
    </div>
  );
}
