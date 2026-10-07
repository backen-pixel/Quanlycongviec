import '../index.css';
import { useToolInfo } from '../helpers.js';
import { FounderCard, FounderError } from '../founder-card.js';
export default function FounderView() {
  const { output, isPending } = useToolInfo<'get_founder_evidence'>();
  if (isPending) return <p role="status">Đang đọc dữ liệu theo quyền của bạn…</p>;
  if (!output || output.outcome === 'ERROR') return <FounderError />;
  return <div><FounderCard result={output} /></div>;
}
