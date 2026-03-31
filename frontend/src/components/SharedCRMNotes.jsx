import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Share2, FileText, Image, MessageSquare, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';

const STAGE_LABELS = {
  consulting: { label: 'Tư vấn', icon: '💬' },
  deal_new: { label: 'Nhiệm vụ Deal mới', icon: '📋' },
  deal_quote_contract: { label: 'Báo giá & Hợp đồng', icon: '📄' },
  deal_ordering: { label: 'Tiến hành đặt hàng', icon: '🛒' },
  deal_schedule: { label: 'Hẹn ngày lắp đặt', icon: '📅' },
  deal_shipping: { label: 'Đặt Vận chuyển', icon: '🚛' },
  deal_notes: { label: 'Ghi chú khác', icon: '📝' },
};

const ATT_ICONS = { image: Image, drawing: FileText, task_note: MessageSquare, other: FileText };

export default function SharedCRMNotes({ projectId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    api.get(`/crm/project/${projectId}/shared-notes`)
      .then(r => setNotes(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return null;
  if (!notes.length) return null;

  return (
    <div className="border border-green-200 rounded-xl overflow-hidden bg-green-50/50">
      <button onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 cursor-pointer transition-colors">
        {expanded ? <ChevronDown className="h-4 w-4 text-green-600" /> : <ChevronRight className="h-4 w-4 text-green-600" />}
        <Share2 className="h-4 w-4 text-green-600" />
        <span className="text-sm font-semibold text-green-800">Ghi chú từ Kinh doanh</span>
        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{notes.length} nhiệm vụ</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {notes.map(task => {
            const stage = STAGE_LABELS[task.stage_slug] || { label: task.stage_slug, icon: '📋' };
            const AttIcon = ATT_ICONS;
            return (
              <div key={task.id} className="bg-white rounded-lg border border-green-200 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{stage.icon}</span>
                  <span className="text-xs font-semibold text-gray-800">{task.title}</span>
                  <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{stage.label}</span>
                  {task.assignee && (
                    <span className="text-[10px] text-gray-500 ml-auto">👤 {task.assignee.full_name}</span>
                  )}
                </div>

                {/* Notes text */}
                {task.notes && (
                  <p className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2 mb-2">{task.notes}</p>
                )}

                {/* Attachments */}
                {task.attachments?.length > 0 && (
                  <div className="space-y-1">
                    {task.attachments.map(att => {
                      const Icon = ATT_ICONS[att.doc_type] || FileText;
                      return (
                        <div key={att.id} className="flex items-start gap-2 py-1 px-2 rounded bg-gray-50">
                          <Icon className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-700 truncate">{att.name}</p>
                            {att.notes && <p className="text-[10px] text-gray-500 line-clamp-2">{att.notes}</p>}
                            {att.file_url && !att.mime_type?.startsWith('image/') && (
                              <a href={att.file_url} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 hover:underline">{att.file_name || 'Mở file'}</a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {task.attachments.filter(a => a.mime_type?.startsWith('image/')).map(att => (
                      <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={att.file_url} alt={att.name} className="max-h-40 rounded-lg border border-gray-200 object-contain hover:opacity-90" />
                      </a>
                    ))}
                  </div>
                )}

                {!task.notes && !task.attachments?.length && (
                  <p className="text-[10px] text-gray-400 italic">Không có nội dung</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
