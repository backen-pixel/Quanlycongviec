import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { draftStatusLabel, generateDraft, isDraftEnabled, recordDraft } from '../lib/aiReplyDrafts';

/**
 * Pilot-only helper above the Messenger reply box. It fills the reply box with an AI draft that
 * staff must read and edit; it never sends. Hidden unless the server says this user is in the pilot.
 */
export default function AiDraftBar({ leadId, reply, setReply, draftRef, disabled }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [active, setActive] = useState(false);

  useEffect(() => {
    let alive = true;
    isDraftEnabled().then(ok => { if (alive) setEnabled(ok); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setActive(Boolean(draftRef.current)); }, [reply, draftRef]);

  if (!enabled || !leadId) return null;

  const generate = async () => {
    if (busy || disabled) return;
    setBusy(true); setNote('');
    const result = await generateDraft(leadId);
    setBusy(false);
    if (result.status !== 'GENERATED') { setNote(draftStatusLabel(result.status)); return; }
    if (reply.trim() && !window.confirm('Thay nội dung đang soạn bằng bản nháp AI?')) return;
    draftRef.current = { leadId, draftId: result.draft_id, revision: 1, text: result.text };
    setReply(result.text);
    setActive(true);
    setNote('Bản nháp AI — cần đọc và sửa trước khi gửi.');
  };

  const discard = async () => {
    const draft = draftRef.current;
    if (!draft) return;
    draftRef.current = null;
    setActive(false); setNote('');
    if (reply === draft.text) setReply('');
    await recordDraft('rejected', draft.draftId, draft);
  };

  return (
    <div className="flex items-center gap-2 px-3 pt-2 text-xs">
      <button type="button" onClick={generate} disabled={busy || disabled}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40 cursor-pointer">
        <Sparkles size={13} /> {busy ? 'Đang soạn…' : 'Soạn nháp bằng AI'}
      </button>
      {active && (
        <button type="button" onClick={discard}
          className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 cursor-pointer">Bỏ bản nháp</button>
      )}
      {note && <span className="text-amber-700">{note}</span>}
    </div>
  );
}
