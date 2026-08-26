import { useState, useEffect } from 'react';
import api from '../lib/api';
import UnifiedTaskHistoryTimeline from './UnifiedTaskHistoryTimeline';
import { History } from 'lucide-react';

/**
 * Widget lịch sử nhiệm vụ thống nhất — nhúng vào trang chi tiết.
 * @param {{ projectId?: string, leadId?: string, source?: string, sourceId?: string }} props
 */
export default function UnifiedTaskHistoryWidget({
  projectId,
  leadId,
  source,
  sourceId,
  title = 'Lịch sử nhiệm vụ',
  refreshKey = 0,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = {};
        if (source && sourceId) {
          params.source = source;
          params.id = sourceId;
        } else if (projectId) params.project_id = projectId;
        else if (leadId) params.lead_id = leadId;
        else {
          setItems([]);
          setLoading(false);
          return;
        }
        const { data } = await api.get('/work-tasks/history', { params: { ...params, page_size: 30 } });
        if (!cancelled) setItems(data.history || []);
      } catch {
        if (!cancelled) setItems([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, leadId, source, sourceId, refreshKey]);

  if (!projectId && !leadId && !(source && sourceId)) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800 inline-flex items-center gap-2">
          <History className="h-4 w-4 text-blue-600" />
          {title}
        </h3>
      </div>
      <UnifiedTaskHistoryTimeline items={items} loading={loading} compact />
    </div>
  );
}
