import { useState, useEffect } from 'react';
import api from '../lib/api';
import { formatDateTime } from '../lib/utils';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';

export default function FacebookLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/facebook/webhook-logs');
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">📡 Facebook Webhook Logs</h2>
        <button onClick={loadLogs} disabled={loading} className="px-3 py-1.5 text-sm bg-white border rounded-lg flex items-center gap-2 hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
            <tr>
              <th className="p-3">Thời gian</th>
              <th className="p-3">Page ID</th>
              <th className="p-3">Status</th>
              <th className="p-3">Payload (Preview)</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="p-3 whitespace-nowrap">{formatDateTime(log.processed_at)}</td>
                <td className="p-3">{log.page_id}</td>
                <td className="p-3">
                  {log.status === 'success' ? <span className="text-green-600 flex items-center gap-1"><CheckCircle size={14} /> OK</span> : 
                   log.status === 'error' ? <span className="text-red-600 flex items-center gap-1"><XCircle size={14} /> Lỗi</span> : 'Nhận'}
                </td>
                <td className="p-3 max-w-sm truncate text-gray-500 font-mono">
                  {JSON.stringify(log.payload)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
