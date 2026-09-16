/**
 * TAB "TRỢ LÝ HƯỚNG DẪN" trong màn hình AI Bot — chỉnh các núm chạy động của CopilotKit.
 *
 * ĐỂ RIÊNG MỘT TỆP, KHÔNG VIẾT VÀO AiChatBotSettingsPage.jsx. Hai lý do:
 *
 * 1. Đây là một trợ lý KHÁC hẳn con bot trong chat — khác backend, khác model, khác kho kiến
 *    thức. Chúng chỉ tình cờ được chỉnh ở cùng một màn hình. Trộn vào tệp 3.000 dòng kia là sớm
 *    muộn có người sửa nhầm phần này khi định sửa phần kia.
 * 2. Tệp cha chỉ phải thêm đúng một nút tab và một dòng render — bề mặt đụng vào bot cũ gần bằng 0.
 *
 * FORM DỰNG TỪ LƯỢC ĐỒ DO SERVER TRẢ, không cắm cứng danh sách núm ở đây. Thêm một núm trong
 * `backend/src/helpers/guideSettings.js` là màn hình tự mọc thêm ô, kèm đúng khoảng hợp lệ và
 * lời giải thích của nó. Khoảng hợp lệ cũng do server giữ — đặt ở đây thì ai gọi thẳng API vẫn
 * nhét được số vô lý vào.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2, Save, RotateCcw, AlertTriangle, Info, Coins, Brain,
  Lightbulb, Gauge, Repeat, CheckCircle2, Cpu, ShieldCheck, Palette, BookOpen,
} from 'lucide-react';
import api from '../lib/api';
import { setMascotSet } from '../features/guide/lib/mascotSprite';

/** Biểu tượng theo nhóm. Nhóm lạ (thêm sau ở server) rơi về `Info` chứ không vỡ giao diện. */
const GROUP_ICON = {
  model: Cpu,
  quota: ShieldCheck,
  cost: Coins,
  memory: Brain,
  experience: Lightbulb,
  knowledge: BookOpen,
  reasoning: Gauge,
  iterations: Repeat,
  appearance: Palette,
};

/**
 * Núm nào PHỤ THUỘC NHÁNH MODEL.
 *
 * Hai kiểu suy luận loại trừ nhau và chọn theo model (xem chú thích ở copilotkit.js): model đời
 * cũ dùng trần token, model 4.6+ dùng mức công sức. Núm không áp dụng vẫn HIỆN nhưng mờ đi và
 * nói rõ vì sao — ẩn hẳn thì người dùng đi tìm một núm mà tài liệu có nhắc tới và không thấy đâu.
 */
/**
 * Núm suy luận nào sống với KIỂU suy luận nào. Server gửi kiểu theo từng model trong `capabilities`
 * (xem bảng KHA_NANG ở guideSettings.js) — bốn kiểu, không phải hai, và cắt theo MODEL chứ không
 * theo nhà cung cấp: `gpt-4o` và `GPT-5.6-terra` cùng là OpenAI mà một bên không có suy luận,
 * một bên có.
 */
const NUM_BY_TYPE = {
  reasoning_enabled: ['adaptive', 'budget', 'effort'],
  reasoning_budget: ['budget'],
  reasoning_effort: ['adaptive', 'effort'],
};

const TYPE_HINT = {
  adaptive: 'suy luận adaptive — model tự quyết câu nào cần nghĩ',
  budget: 'suy luận theo trần token — model nghĩ ở mọi lượt',
  effort: 'suy luận theo mức công sức, có tóm tắt hiện trong khung chat',
  none: 'model này không có tham số suy luận',
};

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function GuideAssistantSettingsTab({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState(null);
  const [saved, setSaved] = useState({});     // giá trị đang lưu trên server
  const [form, setForm] = useState({});   // giá trị đang gõ dở
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/copilotkit/settings');
      setSchema(data);
      setSaved(data.value || {});
      setForm(data.value || {});
    } catch (e) {
      setLoadError(e?.response?.status === 403
        ? 'Chỉ quản trị viên mới xem được phần này.'
        : (e?.response?.data?.error || e?.message || 'Không tải được cấu hình.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasChanges = useMemo(() => !sameValue(saved, form), [saved, form]);

  /**
   * ĐỔI CHA THÌ SỬA CON NGAY TRÊN GIAO DIỆN, đừng đợi tới lúc submit.
   *
   * Người dùng đổi nhà cung cấp sang OpenAI trong khi ô model vẫn là `claude-sonnet-5`: nếu để
   * nguyên thì màn hình đang hiện một cặp vô nghĩa, và chỉ khi bấm Lưu mới nhận được thông báo
   * lỗi. Chuyển sẵn sang model đầu tiên hợp lệ là thứ người ta mong đợi — server cũng làm đúng
   * như vậy khi nhận patch thiếu `model` (xem `dongBoPhuThuoc`).
   */
  const changeField = useCallback((key, v) => {
    setForm((f) => {
      const next = { ...f, [key]: v };
      for (const t of schema?.fields || []) {
        if (t.depends_on !== key) continue;
        const allowed = (t.choices_by || {})[v] || [];
        if (!allowed.length || allowed.includes(next[t.key])) continue;
        // Mặc định của cha MỚI, không phải phần tử đầu danh sách — nếu không thì đi vòng
        // token-codex rồi quay lại là model bị đổi âm thầm sang một cái khác.
        const md = (t.defaults_by || {})[v];
        next[t.key] = allowed.includes(md) ? md : allowed[0];
      }
      return next;
    });
  }, [schema]);

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      const { data } = await api.put('/copilotkit/settings', form);
      setSaved(data.value);
      setForm(data.value);
      // Áp bộ nhân vật NGAY trên máy người vừa lưu: nhân vật sống ở khung trợ lý toàn cục, không
      // nằm trong trang này, nên không có gì tự vẽ lại. Máy của người khác nhận ở lần tải trang
      // kế tiếp — xem `loadMascotSet`.
      setMascotSet(data.value?.mascot_set);
      showToast?.(data.changed ? 'Đã lưu cấu hình trợ lý' : 'Không có gì thay đổi');
    } catch (e) {
      const error = e?.response?.data?.errors;
      if (error && typeof error === 'object') {
        setFieldErrors(error);
        showToast?.('Có ô chưa hợp lệ — xem chi tiết bên dưới ô đó', 'err');
      } else {
        showToast?.(e?.response?.data?.error || e?.message || 'Lưu thất bại', 'err');
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    // Hỏi lại: đây là nút xoá mọi tinh chỉnh của mọi nhóm cùng lúc, không chỉ nhóm đang xem.
    if (!window.confirm('Đưa TẤT CẢ các núm về mặc định trong .env? Mọi tinh chỉnh sẽ mất.')) return;
    setSaving(true);
    try {
      const { data } = await api.post('/copilotkit/settings/defaults');
      setSaved(data.value);
      setForm(data.value);
      setFieldErrors({});
      showToast?.('Đã đưa về mặc định');
    } catch (e) {
      showToast?.(e?.response?.data?.error || e?.message || 'Không đặt lại được', 'err');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{loadError}</span>
      </div>
    );
  }

  /**
   * Mọi trạng thái dưới đây bám theo LỰA CHỌN ĐANG GÕ DỞ (`form`), không theo giá trị đã lưu.
   * Đổi model xong phải thấy núm suy luận mờ đi NGAY, chứ không phải sau khi bấm Lưu rồi tải lại.
   *
   * `capabilities` do server gửi cả bảng — không chép lại luật nhận diện model ở đây, vì
   * hai bản sao của cùng một luật thì sớm muộn lệch nhau.
   */
  const provider = form.provider ?? schema?.provider;
  const reasoningKind = schema?.capabilities?.[form.model]?.reasoning || 'none';
  const key = schema?.key_by_provider?.[provider];

  /** Vì sao một núm bị mờ — trả về chuỗi lý do, rỗng nghĩa là đang dùng được. */
  const disabledReason = (t) => {
    const allowed = NUM_BY_TYPE[t.key];
    if (!allowed || allowed.includes(reasoningKind)) return '';
    if (reasoningKind === 'none') {
      return `Model "${form.model}" không có tham số suy luận — gửi vào là API trả lỗi 400.`;
    }
    if (t.key === 'reasoning_budget') {
      return 'Model này không dùng trần token: nó tự quyết, hoặc chỉnh bằng "Mức công sức".';
    }
    return 'Model này dùng trần token, không có mức công sức.';
  };

  return (
    <div className="space-y-4">
      {/* Thanh trạng thái model — quyết định núm suy luận nào có tác dụng, nên đặt trên cùng. */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 text-sm">
        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">🧭</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">Trợ lý hướng dẫn (CopilotKit)</div>
          <div className="text-xs text-gray-500 truncate">
            <code className="font-mono">{provider}</code> · <code className="font-mono">{form.model}</code> ·{' '}
            {TYPE_HINT[reasoningKind] || TYPE_HINT.none}
            {hasChanges && <span className="ml-1 text-amber-600">· chưa lưu</span>}
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 shrink-0">
          Khác với bot chat ở các tab kia
        </span>
      </div>

      {/* Thiếu key thì nói TRƯỚC khi bấm Lưu. Để người dùng lưu xong, hỏi một câu rồi mới nhận
          503 là bắt họ tự suy ra nguyên nhân từ một thông báo ở màn hình khác. */}
      {key && !key.has && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Nhà cung cấp <b>{provider}</b> chưa có API key — biến <code className="font-mono">{key.envVar}</code>{' '}
            chưa được đặt trong <code className="font-mono">backend/.env</code>. Lưu cấu hình này thì
            trợ lý sẽ báo lỗi ngay ở câu hỏi đầu tiên. Trợ lý KHÔNG mượn key của nhà cung cấp khác.
          </span>
        </div>
      )}

      {(schema?.group || []).map((group) => {
        const fields = (schema?.fields || []).filter((t) => t.group === group.id);
        if (!fields.length) return null;
        const Icon = GROUP_ICON[group.id] || Info;
        return (
          <section key={group.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <header className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center gap-2">
              <Icon className="h-4 w-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-800">{group.name}</h3>
            </header>
            <div className="p-4 space-y-4">
              {fields.map((t) => (
                <FieldInput
                  key={t.key}
                  fields={t}
                  value={form[t.key]}
                  parentValue={t.depends_on ? form[t.depends_on] : undefined}
                  error={fieldErrors[t.key]}
                  disabledReason={disabledReason(t)}
                  note={t.key === 'reasoning_effort' && reasoningKind === 'effort' ? 'clamped' : ''}
                  onChange={(v) => changeField(t.key, v)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Thanh hành động dính đáy: form dài hơn màn hình, để nút ở cuối trang là phải cuộn xuống
          mới lưu được, và rất dễ bỏ quên một thay đổi đang dở. */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-3 bg-gradient-to-t from-white via-white to-transparent">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm">
          <div className="flex-1 text-xs text-gray-500">
            {hasChanges
              ? 'Có thay đổi chưa lưu.'
              : 'Đã lưu. Lượt hỏi tiếp theo dùng ngay giá trị này — không cần khởi động lại.'}
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="h-4 w-4" /> Về mặc định
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !hasChanges}
            className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Một ô chỉnh. Bốn kiểu: `boolean`, `select`, `dependent_select`, `number` (thanh trượt kèm ô số).
 *
 * `parentValue` chỉ dùng cho `dependent_select`: danh sách lựa chọn được lọc theo nó, và nó là giá
 * trị ĐANG GÕ DỞ của trường cha chứ không phải giá trị đã lưu.
 */
/**
 * DẤU "?" — lời giải thích dài của mỗi núm, chỉ hiện khi người dùng hỏi tới.
 *
 * ═══════════════ VÌ SAO GOM LẠI ═══════════════
 *
 * 29 núm × trung bình 259 ký tự = 7.517 ký tự mô tả bày sẵn trên một màn hình. Những dòng đó viết
 * kỹ và đáng giá — nhưng chúng đáng giá LÚC ĐANG PHÂN VÂN một núm, không phải mọi lúc. Bày hết
 * thì việc thường gặp nhất (liếc xem núm nào đang khác mặc định) phải lướt qua bảy nghìn chữ.
 *
 * ═══════════════ HOVER LÀ CHƯA ĐỦ ═══════════════
 *
 * Chỉ bắt `:hover` là bỏ rơi hai nhóm người: bàn phím (không có con trỏ) và cảm ứng (không có
 * trạng thái rê). Nên mở bằng CẢ BA — rê chuột, nhận tiêu điểm, và bấm — rồi Esc đóng lại. Bấm
 * còn có tác dụng GHIM: đọc một đoạn 600 chữ mà chuột nhích ra là mất thì không đọc nổi.
 *
 * ═══════════════ CÁI GÌ Ở LẠI NGOÀI ═══════════════
 *
 * Chỉ `description` — phần giải thích TĨNH — chui vào đây. Những dòng nói về TRẠNG THÁI HIỆN TẠI
 * thì ở lại ngoài: "núm này không áp dụng vì model đang chọn", "server sẽ kẹp giá trị này lại".
 * Giấu trạng thái sau một thao tác rê chuột là giấu đúng thứ người dùng cần thấy mà không biết
 * để tìm.
 */
function HelpDot({ text, id }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [box, setBox] = useState(null);
  const nutRef = useRef(null);

  /**
   * Cuộn hoặc đổi kích thước là ĐÓNG, không tính lại vị trí.
   *
   * Toạ độ đo một lần lúc mở, nên cuộn trang mà vẫn để đó thì hộp lơ lửng sai chỗ — trông như
   * lỗi vẽ. Tính lại theo từng khung hình cuộn thì đúng hơn nhưng phải gắn listener chạy liên
   * tục cho 29 nút; đóng lại là hành vi người dùng hiểu ngay và không tốn gì.
   *
   * ĐẶT TRƯỚC `return null` bên dưới: hook phải chạy ở mọi lần render, kể cả lần không có mô tả.
   */
  useEffect(() => {
    if (!open) return undefined;
    const dongLai = () => { setOpen(false); setPinned(false); };
    window.addEventListener('scroll', dongLai, true);
    window.addEventListener('resize', dongLai);
    return () => {
      window.removeEventListener('scroll', dongLai, true);
      window.removeEventListener('resize', dongLai);
    };
  }, [open]);

  if (!text) return null;

  const hienId = `${id}-help`;
  const dong = () => { setOpen(false); setPinned(false); };

  /**
   * ĐO VỊ TRÍ RỒI VẼ QUA PORTAL, không đặt tuyệt đối trong dòng.
   *
   * `<section>` của mỗi nhóm có `overflow-hidden` (để bo góc), nên một hộp đặt tuyệt đối bên
   * trong sẽ BỊ CẮT ở những núm gần đáy nhóm — đúng chỗ lời giải thích dài nhất. Vẽ ra thẳng
   * `document.body` thì không ancestor nào cắt được, và toạ độ lấy từ chính nút nên vẫn dính
   * đúng chỗ.
   *
   * Kẹp mép phải để hộp không tràn khỏi màn hình ở bề rộng hẹp.
   */
  const mo = () => {
    const r = nutRef.current?.getBoundingClientRect();
    if (r) {
      const rong = Math.min(352, window.innerWidth * 0.8);
      setBox({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - rong - 12), rong: rong });
    }
    setOpen(true);
  };

  return (
    <span className="inline-flex align-middle">
      <button
        ref={nutRef}
        type="button"
        aria-label="Giải thích"
        aria-expanded={open}
        aria-describedby={open ? hienId : undefined}
        onMouseEnter={mo}
        onMouseLeave={() => { if (!pinned) setOpen(false); }}
        onFocus={mo}
        onBlur={() => { if (!pinned) setOpen(false); }}
        onClick={() => { setPinned((v) => !v); mo(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') dong(); }}
        className={`h-4 w-4 rounded-full border text-[10px] font-bold leading-none flex items-center justify-center cursor-help transition-colors ${
          open
            ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
            : 'border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-600'
        }`}
      >
        ?
      </button>

      {open && box && createPortal(
        <span
          id={hienId}
          role="tooltip"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => { if (!pinned) setOpen(false); }}
          style={{ top: box.top, left: box.left, width: box.rong }}
          className="fixed z-[9999] rounded-lg bg-gray-900 text-gray-100 text-xs leading-relaxed
                     px-3 py-2 shadow-xl normal-case font-normal"
        >
          {text}
          {pinned && (
            <span className="block mt-1.5 text-[10px] text-gray-400">Bấm lại dấu ? để bỏ ghim</span>
          )}
        </span>,
        document.body,
      )}
    </span>
  );
}

function FieldInput({ fields, value, parentValue, error, disabledReason, note, onChange }) {
  const t = fields;
  const disabled = !!disabledReason;
  const differsFromDefault = !sameValue(value, t.default);
  const dependentChoices = (t.choices_by || {})[parentValue] || [];

  return (
    <div className={disabled ? 'opacity-45' : ''}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label className="text-sm font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
            {t.label}
            <HelpDot text={t.description} id={`set-${t.key}`} />
            {/* Nhãn này là thứ trả lời câu "ai đã đổi gì" nhanh nhất — không có nó thì phải nhớ
                từng mặc định để biết mình đang chạy cấu hình gốc hay đã chỉnh. */}
            {differsFromDefault && !disabled && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                khác mặc định ({String(t.default)})
              </span>
            )}
            {!differsFromDefault && !disabled && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 inline-flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" /> mặc định
              </span>
            )}
          </label>
          {/* `disabledReason` và `clamped` NÓI VỀ TRẠNG THÁI HIỆN TẠI nên ở lại ngoài — xem ghi
              chú trong HelpDot. Chỉ phần giải thích tĩnh mới chui vào dấu ?. */}
          {disabled && <p className="text-xs text-amber-700 mt-1">{disabledReason}</p>}
          {!disabled && note === 'clamped' && (
            <p className="text-xs text-gray-500 mt-1">
              Model này chỉ nhận <code className="font-mono">low</code>/<code className="font-mono">medium</code>/
              <code className="font-mono">high</code> — chọn <code className="font-mono">xhigh</code> hay{' '}
              <code className="font-mono">max</code> thì server tự kẹp về <code className="font-mono">high</code>.
            </p>
          )}
        </div>

        <div className="shrink-0 w-56">
          {t.type === 'boolean' && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(!value)}
              className={`w-full h-9 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
                value ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:cursor-not-allowed`}
            >
              {value ? 'Đang bật' : 'Đang tắt'}
            </button>
          )}

          {t.type === 'select' && (
            <select
              disabled={disabled}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100"
            >
              {/* Có `choice_labels` thì hiện tên tiếng Việt, không thì hiện thẳng mã — mã model
                  ("claude-haiku-4-5") tự nó đã là tên, đặt thêm nhãn chỉ tổ sai lệch. */}
              {(t.choices || []).map((x) => (
                <option key={x} value={x}>{(t.choice_labels || {})[x] || x}</option>
              ))}
            </select>
          )}

          {t.type === 'dependent_select' && (
            <select
              disabled={disabled || !dependentChoices.length}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white disabled:bg-gray-100 font-mono"
            >
              {/* Giá trị hiện tại không nằm trong danh sách thì vẫn phải hiện, nếu không <select>
                  sẽ tự nhảy sang mục đầu mà `form` không hề đổi — người dùng thấy một đằng, lưu
                  một nẻo. Ca này chỉ xảy ra với tệp cấu hình sửa tay, nhưng im lặng thì rất khó lần. */}
              {!dependentChoices.includes(value) && value != null && value !== '' && (
                <option value={value}>{value} (không thuộc {String(parentValue)})</option>
              )}
              {dependentChoices.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}

          {t.type === 'number' && (
            <div className="flex items-center gap-2">
              <input
                type="range"
                disabled={disabled}
                min={t.min}
                max={t.max}
                step={t.step}
                value={Number(value) || 0}
                onChange={(e) => onChange(Number(e.target.value))}
                className="flex-1 accent-indigo-600 cursor-pointer disabled:cursor-not-allowed"
              />
              <input
                type="number"
                disabled={disabled}
                min={t.min}
                max={t.max}
                step={t.step}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-24 h-9 px-2 rounded-lg border border-gray-200 text-sm text-right tabular-nums bg-white disabled:bg-gray-100"
              />
            </div>
          )}

          {t.type === 'number' && (
            <div className="text-[10px] text-gray-400 text-right mt-1">
              {t.unit} · {t.min}–{t.max}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
