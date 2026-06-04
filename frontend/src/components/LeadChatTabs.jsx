import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { resolveMediaUrl, BROKEN_MEDIA_PLACEHOLDER } from '../lib/mediaUrl';
import { Trash2, Send, Users, Crown, Shield, Building2, Eye, Paperclip, X, Mic, Reply, CornerDownRight, Smile, Zap, Undo2, Check, Phone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import EmployeePicker from './EmployeePicker';
import MessengerMessageHoverActions from './MessengerMessageHoverActions';
import MessengerMessageSelectionBar from './MessengerMessageSelectionBar';
import MessengerForwardMessageModal from './MessengerForwardMessageModal';
import MessengerFileAttachmentCard from './MessengerFileAttachmentCard';
import {
  buildBulkMessengerShareText,
  copyTextToClipboard,
  normalizeForwardDisplayContent,
} from '../lib/messengerMessageActions';
import { buildMessengerMessagePreview } from '../lib/messengerPreview';
import { callLogDisplayText, parseCallLogPayload } from '../lib/messengerCallLog';
import {
  groupMessengerReactions,
  isMessengerMessageRecalled,
  mergeMessengerMessage,
  normalizeMessengerReactions,
} from '../lib/messengerReactions';

function Avatar({ name, url, size = 8 }) {
  if (url) {
    const src = resolveMediaUrl(url);
    return (
      <img
        src={src}
        alt=""
        className={`w-${size} h-${size} rounded-full object-cover bg-slate-200`}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
        }}
      />
    );
  }
  const letter = (name || 'U')[0].toUpperCase();
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  const color = colors[letter.charCodeAt(0) % colors.length];
  return <div className={`w-${size} h-${size} rounded-full ${color} flex items-center justify-center text-white text-xs font-bold`}>{letter}</div>;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.toDateString() === db.toDateString();
}

function formatDateSeparator(d) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hôm nay · ${time}`;
  if (isYesterday) return `Hôm qua · ${time}`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Gợi ý trả lời nhanh — chip dưới composer giúp phản hồi 1 chạm. */
const QUICK_REPLIES = [
  'Đã nhận ✓',
  'Sẽ phản hồi sau',
  'Cần thêm thông tin?',
  'Cảm ơn bạn!',
];

/** Bộ emoji được nhóm thành danh mục cho picker. */
const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    icon: '😀',
    label: 'Cảm xúc',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🤖'],
  },
  {
    id: 'gestures',
    icon: '👋',
    label: 'Cử chỉ',
    emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦿','🦶','👣','👀','👂','👃','👄','👅','🧠','🦴','🦷','💋','👁️'],
  },
  {
    id: 'hearts',
    icon: '❤️',
    label: 'Trái tim',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','💯','💢','💥','💫','💦','💨'],
  },
  {
    id: 'animals',
    icon: '🐶',
    label: 'Động vật',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙊','🙉','🙈','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🦞','🦀','🐠','🐟','🐡','🐬','🦈','🐳','🐋','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦏','🦛','🐪','🐫','🦒','🐂','🐃','🐄','🐎','🐖','🐏','🐑','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐓','🦃','🦚','🦜','🦢','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔'],
  },
  {
    id: 'food',
    icon: '🍕',
    label: 'Đồ ăn',
    emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍣','🍤','🍱','🍙','🍚','🍘','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧉','🥄','🍴','🍽️','🥢','🧂'],
  },
  {
    id: 'activities',
    icon: '⚽',
    label: 'Hoạt động',
    emojis: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🎱','🪀','🏓','🏸','🥍','🥌','🥊','🥋','🎯','🎳','🎮','🎲','♟️','🎰','🎺','🎷','🪗','🎸','🎻','🪕','🥁','🎬','🎤','🎧','🎼','🎹','🪘','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🚴','🏊','🏄','🚣','🧗','🤺','🤸','🧘'],
  },
  {
    id: 'objects',
    icon: '💡',
    label: 'Đồ vật',
    emojis: ['💡','🔦','🕯️','💰','💴','💵','💶','💷','💸','💳','🧾','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📷','📸','🎥','📺','📻','📡','💎','⌚','📞','☎️','📠','🔋','🔌','🔍','🔎','🔒','🔓','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫','🏹','🛡️','🔧','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🧰','🧲','🪜','📚','📖','📝','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','📂','📁','📰','🗞️'],
  },
  {
    id: 'symbols',
    icon: '🔣',
    label: 'Ký hiệu',
    emojis: ['✨','⭐','🌟','💫','💥','💯','🚫','⛔','📛','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','💱','💲','🆎','🅰️','🅱️','🆑','🆘','✅','✔️','☑️','❌','❎','🆔','🚸','⚠️','🚹','🚺','🚻','🆒','🆓','🆕','🆖','🆗','🆙','🆚','✳️','✴️','❇️','♻️','⚜️','🔱','📛','🔰','♾️','♀️','♂️','⚧️','⚕️','♻️','🔆','🔅','🔇','🔈','🔉','🔊','🎵','🎶','📢','📣','📯'],
  },
];

/**
 * Bộ sticker — sử dụng Microsoft Fluent Emoji 3D (open source, MIT).
 * Render qua jsDelivr CDN, mỗi sticker là 1 ảnh PNG 3D nhân vật phong cách Facebook/Zalo/TikTok.
 * `name` = đúng tên thư mục trong repo `microsoft/fluentui-emoji`.
 */
const STICKER_PACK = [
  { emoji: '😀', name: 'Grinning face' },
  { emoji: '😃', name: 'Grinning face with big eyes' },
  { emoji: '😄', name: 'Grinning face with smiling eyes' },
  { emoji: '😁', name: 'Beaming face with smiling eyes' },
  { emoji: '😂', name: 'Face with tears of joy' },
  { emoji: '🤣', name: 'Rolling on the floor laughing' },
  { emoji: '😅', name: 'Grinning face with sweat' },
  { emoji: '😊', name: 'Smiling face with smiling eyes' },
  { emoji: '😍', name: 'Smiling face with heart-eyes' },
  { emoji: '🥰', name: 'Smiling face with hearts' },
  { emoji: '😘', name: 'Face blowing a kiss' },
  { emoji: '🤩', name: 'Star-struck' },
  { emoji: '🥳', name: 'Partying face' },
  { emoji: '😎', name: 'Smiling face with sunglasses' },
  { emoji: '🤓', name: 'Nerd face' },
  { emoji: '🥸', name: 'Disguised face' },
  { emoji: '🤔', name: 'Thinking face' },
  { emoji: '🙄', name: 'Face with rolling eyes' },
  { emoji: '😏', name: 'Smirking face' },
  { emoji: '😴', name: 'Sleeping face' },
  { emoji: '😪', name: 'Sleepy face' },
  { emoji: '🥱', name: 'Yawning face' },
  { emoji: '🤤', name: 'Drooling face' },
  { emoji: '😭', name: 'Loudly crying face' },
  { emoji: '😢', name: 'Crying face' },
  { emoji: '😱', name: 'Face screaming in fear' },
  { emoji: '🥺', name: 'Pleading face' },
  { emoji: '😡', name: 'Pouting face' },
  { emoji: '🤬', name: 'Face with symbols on mouth' },
  { emoji: '🤯', name: 'Exploding head' },
  { emoji: '🥵', name: 'Hot face' },
  { emoji: '🥶', name: 'Cold face' },
  { emoji: '🤢', name: 'Nauseated face' },
  { emoji: '🤮', name: 'Face vomiting' },
  { emoji: '🤧', name: 'Sneezing face' },
  { emoji: '😷', name: 'Face with medical mask' },
  { emoji: '🤒', name: 'Face with thermometer' },
  { emoji: '😈', name: 'Smiling face with horns' },
  { emoji: '👹', name: 'Ogre' },
  { emoji: '👻', name: 'Ghost' },
  { emoji: '💀', name: 'Skull' },
  { emoji: '🤡', name: 'Clown face' },
  { emoji: '🤖', name: 'Robot' },
  { emoji: '👽', name: 'Alien' },
  { emoji: '👍', name: 'Thumbs up' },
  { emoji: '👎', name: 'Thumbs down' },
  { emoji: '👏', name: 'Clapping hands' },
  { emoji: '🙏', name: 'Folded hands' },
  { emoji: '🙌', name: 'Raising hands' },
  { emoji: '💪', name: 'Flexed biceps' },
  { emoji: '🤝', name: 'Handshake' },
  { emoji: '🤞', name: 'Crossed fingers' },
  { emoji: '👌', name: 'OK hand' },
  { emoji: '🤙', name: 'Call me hand' },
  { emoji: '✌️', name: 'Victory hand' },
  { emoji: '❤️', name: 'Red heart' },
  { emoji: '💔', name: 'Broken heart' },
  { emoji: '💖', name: 'Sparkling heart' },
  { emoji: '💕', name: 'Two hearts' },
  { emoji: '💝', name: 'Heart with ribbon' },
  { emoji: '💯', name: 'Hundred points' },
  { emoji: '🔥', name: 'Fire' },
  { emoji: '✨', name: 'Sparkles' },
  { emoji: '🌟', name: 'Glowing star' },
  { emoji: '⭐', name: 'Star' },
  { emoji: '🎉', name: 'Party popper' },
  { emoji: '🎊', name: 'Confetti ball' },
  { emoji: '🎁', name: 'Wrapped gift' },
  { emoji: '🎂', name: 'Birthday cake' },
  { emoji: '🍰', name: 'Shortcake' },
  { emoji: '🎈', name: 'Balloon' },
  { emoji: '🌹', name: 'Rose' },
  { emoji: '🌸', name: 'Cherry blossom' },
  { emoji: '☕', name: 'Hot beverage' },
  { emoji: '🍵', name: 'Teacup without handle' },
  { emoji: '🍻', name: 'Clinking beer mugs' },
  { emoji: '🥂', name: 'Clinking glasses' },
  { emoji: '🍕', name: 'Pizza' },
  { emoji: '🍔', name: 'Hamburger' },
  { emoji: '🍦', name: 'Soft ice cream' },
  { emoji: '🚀', name: 'Rocket' },
  { emoji: '🏆', name: 'Trophy' },
  { emoji: '🥇', name: '1st place medal' },
  { emoji: '🎯', name: 'Bullseye' },
  { emoji: '🌈', name: 'Rainbow' },
  { emoji: '☀️', name: 'Sun' },
  { emoji: '🌙', name: 'Crescent moon' },
  { emoji: '❄️', name: 'Snowflake' },
];

/** Tạo URL Microsoft Fluent Emoji 3D từ tên gốc trong repo. */
function fluentStickerUrl(name) {
  const folder = encodeURIComponent(name);
  const file = name.toLowerCase().replace(/\s+/g, '_');
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${folder}/3D/${file}_3d.png`;
}

const STICKER_BY_EMOJI = new Map(STICKER_PACK.map((s) => [s.emoji, s]));

/**
 * Render 1 sticker: ưu tiên ảnh 3D (Fluent Emoji), tự fallback về emoji Unicode lớn nếu lỗi/không có map.
 */
function StickerImage({ emoji, size = 128 }) {
  const sticker = STICKER_BY_EMOJI.get(emoji);
  const [errored, setErrored] = useState(false);
  if (!sticker || errored) {
    return (
      <span
        className="inline-block leading-none select-none"
        style={{ fontSize: Math.round(size * 0.85), lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={fluentStickerUrl(sticker.name)}
      alt={emoji}
      className="object-contain select-none"
      style={{ width: size, height: size }}
      draggable={false}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

/** Marker để phân biệt tin sticker với tin emoji thường. */
const STICKER_PREFIX = ':sticker:';

function isStickerContent(text) {
  return typeof text === 'string' && text.startsWith(STICKER_PREFIX);
}
function stripStickerPrefix(text) {
  return String(text || '').slice(STICKER_PREFIX.length).trim();
}

/**
 * Tin chỉ chứa emoji (1–3 emoji, không có chữ) → render không bubble, font lớn.
 * Dựa trên Unicode property `Extended_Pictographic` + các biến thể/skin tone.
 */
function isEmojiOnlyContent(text) {
  if (!text) return false;
  const s = String(text).trim();
  if (!s || s.length > 30) return false;
  let stripped;
  try {
    stripped = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]/gu, '');
  } catch {
    return false;
  }
  return stripped.trim() === '';
}

/** Picker icon & sticker — popover hiển thị trên nút Smile, hỗ trợ click-outside để đóng. */
function EmojiStickerPicker({ onPickEmoji, onPickSticker, onClose }) {
  const [tab, setTab] = useState('emoji');
  const [catId, setCatId] = useState(EMOJI_CATEGORIES[0].id);
  const panelRef = useRef(null);

  useEffect(() => {
    const onDocDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const cat = EMOJI_CATEGORIES.find((c) => c.id === catId) || EMOJI_CATEGORIES[0];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full right-0 mb-2 w-[340px] max-h-[380px] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl z-30 overflow-hidden"
      role="dialog"
    >
      <div className="flex border-b border-slate-100 bg-slate-50/60">
        <button
          type="button"
          onClick={() => setTab('emoji')}
          className={`flex-1 py-2 text-xs font-semibold transition ${tab === 'emoji' ? 'text-violet-700 border-b-2 border-violet-500 bg-white' : 'text-slate-500 hover:bg-white/60'}`}
        >
          Icon
        </button>
        <button
          type="button"
          onClick={() => setTab('sticker')}
          className={`flex-1 py-2 text-xs font-semibold transition ${tab === 'sticker' ? 'text-violet-700 border-b-2 border-violet-500 bg-white' : 'text-slate-500 hover:bg-white/60'}`}
        >
          Sticker
        </button>
      </div>

      {tab === 'emoji' ? (
        <>
          <div className="flex gap-1 px-2 py-1.5 border-b border-slate-100 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatId(c.id)}
                title={c.label}
                className={`shrink-0 w-9 h-9 rounded-lg text-[18px] flex items-center justify-center transition ${catId === c.id ? 'bg-violet-100 ring-1 ring-violet-300' : 'hover:bg-slate-100'}`}
              >
                {c.icon}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-0.5">
            {cat.emojis.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => onPickEmoji?.(e)}
                className="w-9 h-9 flex items-center justify-center text-[22px] rounded-lg hover:bg-slate-100 active:scale-95 transition"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2">
          {STICKER_PACK.map((s) => (
            <button
              key={s.emoji}
              type="button"
              onClick={() => onPickSticker?.(s.emoji)}
              title={s.name}
              className="aspect-square flex items-center justify-center rounded-2xl bg-slate-50 hover:bg-violet-50 hover:ring-2 hover:ring-violet-200 hover:scale-105 active:scale-95 transition p-2"
            >
              <StickerImage emoji={s.emoji} size={84} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Kiểm tra xem tin nhắn `msg` đã được ít nhất một thành viên khác (≠ self) đọc chưa.
 * Dựa vào `readReceipts: Map<userId, last_read_at ISO>`.
 */
function hasAnyOtherSeen(msg, readReceipts, selfUid) {
  if (!msg?.created_at || !readReceipts || readReceipts.size === 0) return false;
  const ts = new Date(msg.created_at).getTime();
  if (!Number.isFinite(ts)) return false;
  const selfStr = String(selfUid || '');
  for (const [userId, lastReadAt] of readReceipts) {
    if (String(userId) === selfStr) continue;
    const readTs = new Date(lastReadAt).getTime();
    if (Number.isFinite(readTs) && readTs >= ts) return true;
  }
  return false;
}

const formatTime = (d) => {
  const date = new Date(d);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + time;
};

function previewOfMessage(parent) {
  return buildMessengerMessagePreview(parent, { maxLen: 120 }) || '[tin nhắn]';
}

/**
 * Khối trích dẫn tin nhắn được trả lời — hiển thị bên trong bong bóng chat của
 * tin nhắn con. Click để cuộn về tin gốc trong khung message list.
 */
function ReplyQuoteInBubble({ parent, isMe, onJump }) {
  if (!parent) return null;
  const author = parent.user?.full_name || parent.user?.email || 'Thành viên';
  return (
    <button
      type="button"
      onClick={() => onJump?.(parent.id)}
      className={`w-full text-left mb-1.5 rounded-md px-2 py-1.5 border-l-2 transition-colors ${
        isMe
          ? 'bg-blue-700/30 border-blue-200 hover:bg-blue-700/40 text-blue-50'
          : 'bg-slate-100 border-blue-400 hover:bg-slate-200 text-slate-700'
      }`}
    >
      <p className={`text-[10px] font-semibold truncate ${isMe ? 'text-blue-100' : 'text-blue-700'}`}>
        ↩ {author}
      </p>
      <p className={`text-[11px] truncate ${isMe ? 'text-blue-50/90' : 'text-slate-600'}`}>
        {previewOfMessage(parent)}
      </p>
    </button>
  );
}

/** Thanh preview phía trên ô nhập khi đang trả lời 1 tin. */
function ReplyComposerBar({ replyTo, onCancel }) {
  if (!replyTo) return null;
  const author = replyTo.user?.full_name || replyTo.user?.email || 'Thành viên';
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5">
      <CornerDownRight className="h-3.5 w-3.5 mt-0.5 text-blue-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-blue-700">Đang trả lời {author}</p>
        <p className="text-[11px] text-slate-700 truncate">{previewOfMessage(replyTo)}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="text-slate-400 hover:text-rose-500 shrink-0"
        title="Hủy trả lời"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab Thành viên — dùng EmployeePicker lọc theo Công ty + Phòng ban
// ═══════════════════════════════════════════════════════════════
export function LeadMembersTab({ leadId }) {
  const [members, setMembers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]); // [{user_id, role, name}]
  const [pickUserId, setPickUserId] = useState(null);
  const [pickRole, setPickRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const MEMBER_ROLES = [
    { value: 'responsible', label: 'Chịu trách nhiệm', icon: <Crown size={12} className="text-red-500" />, color: 'text-red-600 bg-red-50' },
    { value: 'member', label: 'Tham gia', icon: <Users size={12} className="text-blue-500" />, color: 'text-blue-600 bg-blue-50' },
    { value: 'supervisor', label: 'Giám sát', icon: <Shield size={12} className="text-amber-500" />, color: 'text-amber-600 bg-amber-50' },
    { value: 'viewer', label: 'Xem', icon: <Eye size={12} className="text-gray-400" />, color: 'text-gray-500 bg-gray-100' },
  ];

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/crm/leads/${leadId}/members`);
      setMembers(r.data || []);
    } catch (e) {
      console.error(e);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
    api.get('/companies', { params: { for_module: 'crm' } }).then(r => setCompanies(r.data?.companies || r.data || [])).catch(() => {});
  }, [leadId, load]);

  const addToQueue = () => {
    if (!pickUserId) return;
    if (selectedUsers.find(u => u.user_id === pickUserId)) return;
    setSelectedUsers(prev => [...prev, { user_id: pickUserId, role: pickRole }]);
    setPickUserId(null);
  };

  const removeFromQueue = (uid) => setSelectedUsers(prev => prev.filter(u => u.user_id !== uid));

  const updateQueueRole = (uid, role) => setSelectedUsers(prev => prev.map(u => u.user_id === uid ? { ...u, role } : u));

  const submitAll = async () => {
    if (!selectedUsers.length) return;
    setLoading(true);
    try {
      await api.post(`/crm/leads/${leadId}/members`, { members: selectedUsers });
      setSelectedUsers([]);
      load();
    } catch (e) { alert(e.response?.data?.error || 'Lỗi thêm thành viên'); }
    setLoading(false);
  };

  const remove = async (uid) => {
    if (!confirm('Xóa thành viên khỏi nhóm?')) return;
    try {
      await api.delete(`/crm/leads/${leadId}/members/${uid}`);
      load();
    } catch (e) { alert('Lỗi'); }
  };

  const changeRole = async (uid, newRole) => {
    try {
      await api.post(`/crm/leads/${leadId}/members`, { user_id: uid, role: newRole });
      load();
    } catch (e) { alert('Lỗi cập nhật quyền'); }
  };

  const getRoleMeta = (r) => MEMBER_ROLES.find(x => x.value === r) || MEMBER_ROLES[1];

  return (
    <div className="space-y-4">
      {/* Thêm thành viên */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
        <p className="text-xs font-medium text-blue-700 flex items-center gap-1"><Building2 size={12} /> Thêm thành viên</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); setPickUserId(null); }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400">
            <option value="">Chọn công ty...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <EmployeePicker
            companyId={companyId}
            value={pickUserId}
            onChange={(id) => setPickUserId(id)}
            placeholder="Chọn nhân viên..."
            size="md"
          />
          <select value={pickRole} onChange={e => setPickRole(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-400">
            {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={addToQueue} disabled={!pickUserId}
          className="w-full py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-40">
          + Thêm vào danh sách
        </button>

        {/* Queue */}
        {selectedUsers.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-blue-200">
            <p className="text-[10px] text-blue-600 font-medium">Đang chọn {selectedUsers.length} người:</p>
            {selectedUsers.map(su => (
              <div key={su.user_id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5 border border-blue-100">
                <span className="flex-1 text-xs text-gray-700 truncate">{su.user_id.slice(0, 8)}...</span>
                <select value={su.role} onChange={e => updateQueueRole(su.user_id, e.target.value)}
                  className="text-[10px] border rounded px-1 py-0.5 bg-white">
                  {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => removeFromQueue(su.user_id)} className="text-red-400 hover:text-red-600 cursor-pointer">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button onClick={submitAll} disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-40">
              {loading ? 'Đang thêm...' : `Thêm ${selectedUsers.length} thành viên`}
            </button>
          </div>
        )}
      </div>

      {/* Danh sách thành viên */}
      <p className="text-xs text-gray-400">{members.length} thành viên</p>

      <div className="space-y-2">
        {members.map(m => {
          const rl = getRoleMeta(m.role);
          return (
            <div key={m.user_id} className="flex items-center justify-between p-3 bg-gray-50 border rounded-xl hover:bg-gray-100 transition">
              <div className="flex items-center gap-3">
                <Avatar name={m.user?.full_name} url={m.user?.avatar} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.user?.full_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {rl.icon}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>{rl.label}</span>
                    {m.user?.email && <span className="text-[10px] text-gray-400 ml-1">• {m.user.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}
                  className="text-[10px] border rounded-lg px-2 py-1 bg-white cursor-pointer">
                  {MEMBER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button onClick={() => remove(m.user_id)}
                  className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg cursor-pointer transition" title="Xóa">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {!members.length && (
          <div className="text-center py-8">
            <Users size={36} className="mx-auto text-gray-200 mb-2" />
            <p className="text-sm text-gray-400">Chưa có thành viên nào</p>
            <p className="text-xs text-gray-300 mt-1">Chọn công ty → nhân viên → quyền để thêm vào nhóm</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tab Chat realtime
// ═══════════════════════════════════════════════════════════════
export function LeadChatTab({ leadId, socket, fillParent, compact = false, onMessagesChange }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const initialScrolledRef = useRef(false);
  const messageRefs = useRef(new Map());
  const { user } = useAuth();
  const { registerLeadChatPresence } = useMessengerDock();
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  const emitMessages = useCallback((list) => {
    onMessagesChangeRef.current?.(list);
  }, []);

  useEffect(() => {
    emitMessages(messages);
  }, [messages, emitMessages]);

  useEffect(() => {
    return registerLeadChatPresence(leadId);
  }, [leadId, registerLeadChatPresence]);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/crm/leads/${leadId}/chat`);
      setMessages(r.data || []);
    } catch (e) {
      console.error(e);
    }
  }, [leadId]);

  useEffect(() => {
    setMessages([]);
    initialScrolledRef.current = false;
    void load();
    if (socket) {
      socket.emit('join:lead', leadId);
      const handler = (msg) => {
        const lid = msg?.lead_id ?? msg?.leadId;
        if (lid == null || String(lid) !== String(leadId)) return;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      };
      socket.on('lead:chat', handler);
      return () => {
        socket.emit('leave:lead', leadId);
        socket.off('lead:chat', handler);
      };
    }
  }, [leadId, socket, load]);

  // Tự động cuộn xuống đáy.
  // - Lần đầu khi load tin: nhảy thẳng (instant) để người dùng thấy luôn tin mới nhất.
  // - Khi có tin mới: chỉ cuộn mượt nếu user đang ở gần đáy (không giật khỏi vị trí đọc cũ).
  useEffect(() => {
    if (!messages.length) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 160) {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages]);

  const send = async (files = null) => {
    const pickedFiles = files ? Array.from(files).filter(Boolean) : [];
    if ((!text.trim() && pickedFiles.length === 0) || sending) return;
    setSending(true);
    const replyId = replyTo?.id || null;
    try {
      if (pickedFiles.length > 0) {
        for (let i = 0; i < pickedFiles.length; i++) {
          const fd = new FormData();
          fd.append('file', pickedFiles[i]);
          if (i === 0 && text.trim()) fd.append('content', text);
          if (i === 0 && replyId) fd.append('reply_to', replyId);
          await api.post(`/crm/leads/${leadId}/chat/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        await api.post(`/crm/leads/${leadId}/chat`, {
          content: text.trim(),
          reply_to: replyId,
        });
      }
      setText('');
      setReplyTo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) { alert(e.response?.data?.error || 'Lỗi gửi tin nhắn'); }
    setSending(false);
  };

  const jumpToMessage = useCallback((id) => {
    if (!id) return;
    const el = messageRefs.current.get(String(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(String(id));
    setTimeout(() => setHighlightId(null), 1600);
  }, []);

  const renderAttachments = (message) => {
    const items = Array.isArray(message.attachments) && message.attachments.length
      ? message.attachments
      : message.attachment_url
        ? [{ url: message.attachment_url, name: message.attachment_name, type: message.attachment_mime, size: message.attachment_size }]
        : [];

    if (!items.length) return null;

    return items.map((att, i) => {
      const isImg = att.type?.startsWith('image/');
      const isVideo = att.type?.startsWith('video/');
      const isAudio = att.type?.startsWith('audio/');
      const fileUrl = resolveMediaUrl(att.url);
      return (
        <div key={i} className="mt-2">
          {isImg ? (
            <img
              src={fileUrl}
              className="rounded-lg max-w-full max-h-48 cursor-pointer bg-slate-100 object-contain"
              alt={att.name}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
              }}
              onClick={() => setMediaPreview({ ...att, url: fileUrl })}
            />
          ) : isVideo ? (
            <video
              src={fileUrl}
              controls
              className="rounded-lg max-w-full max-h-48 cursor-pointer bg-black/5"
              onClick={() => setMediaPreview({ ...att, url: fileUrl })}
            />
          ) : isAudio ? (
            <audio src={fileUrl} controls className="w-full max-w-xs" />
          ) : (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-gray-100 p-2 rounded-lg flex items-center gap-2 text-xs text-blue-600 hover:bg-gray-200"
            >
              <Paperclip size={12} /> {att.name || 'Tệp đính kèm'}
            </a>
          )}
        </div>
      );
    });
  };

  return (
    <div className={fillParent ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'} style={fillParent ? undefined : { height: '450px' }}>
      {/* Media Lightbox */}
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <button type="button" onClick={() => setMediaPreview(null)} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"><X /></button>
          {mediaPreview.type?.startsWith('image/') ? (
            <img
              src={resolveMediaUrl(mediaPreview.url)}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              alt=""
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
              }}
            />
          ) : (
            <video src={resolveMediaUrl(mediaPreview.url)} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg" />
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className={`flex-1 min-h-0 overflow-y-auto ${compact ? 'px-2.5 py-2' : 'px-4 py-3'} space-y-2 bg-gray-50 rounded-t-xl`}>
        {messages.map((m) => {
          const isMe = String(m.user_id) === String(user?.userId || user?.id);
          if (m.is_system) {
            return (
              <div key={m.id} className="flex justify-center my-2">
                <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
                  {m.content} • {formatTime(m.created_at)}
                </span>
              </div>
            );
          }
          const parent = m.reply || m.reply_to_message || null;
          const isHighlight = String(highlightId || '') === String(m.id);
          return (
            <div
              key={m.id}
              ref={(el) => {
                if (el) messageRefs.current.set(String(m.id), el);
                else messageRefs.current.delete(String(m.id));
              }}
              className={`group/msg flex ${isMe ? 'justify-end' : 'justify-start'} gap-2 transition-colors rounded-lg ${
                isHighlight ? 'ring-2 ring-amber-300 bg-amber-50/60' : ''
              }`}
            >
              {!isMe && <Avatar name={m.user?.full_name} url={m.user?.avatar} size={7} />}
              <div className="flex items-center gap-1 max-w-[78%]">
                {isMe && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(m)}
                    className="shrink-0 opacity-70 hover:opacity-100 transition-all text-slate-500 hover:text-blue-600 hover:bg-slate-100 p-1.5 rounded-full"
                    title="Trả lời tin nhắn"
                    aria-label="Trả lời"
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                )}
                <div className={`rounded-2xl px-3.5 py-2 shadow-sm ${
                  isMe ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                }`}>
                  {!isMe && <p className={`text-[10px] font-medium mb-0.5 ${isMe ? 'text-blue-200' : 'text-blue-600'}`}>{m.user?.full_name}</p>}
                  {parent && <ReplyQuoteInBubble parent={parent} isMe={isMe} onJump={jumpToMessage} />}
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  {renderAttachments(m)}
                  <p className={`text-[9px] mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                </div>
                {!isMe && (
                  <button
                    type="button"
                    onClick={() => setReplyTo(m)}
                    className="shrink-0 opacity-70 hover:opacity-100 transition-all text-slate-500 hover:text-blue-600 hover:bg-slate-100 p-1.5 rounded-full"
                    title="Trả lời tin nhắn"
                    aria-label="Trả lời"
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`${compact ? 'p-2' : 'p-3'} border-t bg-white rounded-b-xl shrink-0`}>
        <ReplyComposerBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
        <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => send(e.target.files)} />
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={audioInputRef}
            onChange={(e) => {
              send(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} className={`text-gray-400 hover:text-blue-500 cursor-pointer ${compact ? 'p-1.5' : 'p-2'}`} title="Đính kèm">
            <Paperclip size={compact ? 16 : 18} />
          </button>
          <button type="button" onClick={() => audioInputRef.current?.click()} className={`text-gray-400 hover:text-violet-600 cursor-pointer ${compact ? 'p-1.5' : 'p-2'}`} title="Ghi âm / file âm thanh">
            <Mic size={compact ? 16 : 18} />
          </button>
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={replyTo ? 'Trả lời tin nhắn…' : 'Nhập tin nhắn...'}
            className={`flex-1 min-w-0 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 ${
              compact ? 'px-3 py-1.5 text-[13px]' : 'px-4 py-2.5 text-sm'
            }`} />
          <button type="button" onClick={() => send()} disabled={sending || (!text.trim())}
            className={`bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm shrink-0 ${
              compact ? 'w-9 h-9' : 'w-10 h-10'
            }`}>
            <Send size={compact ? 14 : 16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function collectMessengerAttachments(message) {
  if (Array.isArray(message.attachments) && message.attachments.length) return message.attachments;
  if (message.attachment_url) {
    return [{ url: message.attachment_url, name: message.attachment_name, type: message.attachment_mime, size: message.attachment_size }];
  }
  return [];
}

function groupMessengerAttachments(items) {
  const images = [];
  const videos = [];
  const audios = [];
  const files = [];
  (items || []).forEach((att) => {
    const t = att.type || '';
    if (t.startsWith('image/')) images.push(att);
    else if (t.startsWith('video/')) videos.push(att);
    else if (t.startsWith('audio/')) audios.push(att);
    else files.push(att);
  });
  return { images, videos, audios, files };
}

/** Tin chỉ có ảnh (không text / không file khác) → hiển thị ảnh trần, không bọc bubble. */
function isImageOnlyMessengerMessage(message, contentStr = '') {
  const text = String(contentStr || message?.content || '').trim();
  if (text && !isStickerContent(text)) return false;
  const items = collectMessengerAttachments(message);
  if (!items.length) return false;
  const { images, videos, audios, files } = groupMessengerAttachments(items);
  return images.length > 0 && !videos.length && !audios.length && !files.length;
}

/** Tin chỉ có file tài liệu → thẻ file trần, không bọc bubble tím/trắng. */
function isFileOnlyMessengerMessage(message, contentStr = '') {
  const text = String(contentStr || message?.content || '').trim();
  if (text && !isStickerContent(text)) return false;
  const items = collectMessengerAttachments(message);
  if (!items.length) return false;
  const { images, videos, audios, files } = groupMessengerAttachments(items);
  return files.length > 0 && !images.length && !videos.length && !audios.length;
}

/** Nhãn @mention gọi toàn bộ thành viên nhóm (không dùng chat 1-1). */
export const MESSENGER_MENTION_ALL_LABEL = 'Tất cả';

function normalizeMentionSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentHasMentionAll(content) {
  return /@(tất\s*cả|tat\s*ca|all)\b/i.test(String(content || ''));
}

function resolveMentionIdsFromContent(content, members, { excludeUserId } = {}) {
  const ids = [];
  if (!content?.trim() || !members?.length) return ids;
  const ex = excludeUserId != null ? String(excludeUserId) : '';

  if (contentHasMentionAll(content)) {
    for (const mem of members) {
      const id = mem.user_id;
      if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
    }
  }

  const stripped = String(content).replace(/@(tất\s*cả|tat\s*ca|all)\b/gi, ' ');
  const re = /@([^\s\n@]+)/g;
  let m;
  while ((m = re.exec(stripped))) {
    const piece = m[1].toLowerCase();
    const pieceCompact = piece.replace(/\s/g, '');
    for (const mem of members) {
      const name = (mem.user?.full_name || mem.user?.email || '').trim();
      if (!name) continue;
      const low = name.toLowerCase();
      const lowCompact = low.replace(/\s/g, '');
      if (low.startsWith(piece) || lowCompact.startsWith(pieceCompact)) {
        const id = mem.user_id;
        if (id && String(id) !== ex && !ids.includes(id)) ids.push(id);
        break;
      }
    }
  }
  return ids;
}

function mentionAllPickerMatchesQuery(frag) {
  const q = normalizeMentionSearch(frag);
  if (!q) return true;
  const all = normalizeMentionSearch(MESSENGER_MENTION_ALL_LABEL);
  return all.startsWith(q) || q.startsWith(all) || q === 'tat' || q === 'ta' || q === 't';
}

// Inline tokens: @mention (gồm @Tất cả), [label](url) markdown, bare http(s) URL
const INLINE_TOKEN_RE = /(@(?:tất\s*cả|[^\s\n@]+)|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+)/gi;

function renderMessengerTextContent(content, isMe) {
  if (!content) return null;
  const display = normalizeForwardDisplayContent(content);
  const parts = display.split(INLINE_TOKEN_RE);
  const linkCls = isMe
    ? 'underline decoration-sky-100 text-sky-50 hover:text-white break-all'
    : 'underline decoration-sky-400 text-sky-700 hover:text-sky-900 break-all';
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          className={
            isMe ? 'font-semibold text-amber-100 underline decoration-amber-200' : 'font-semibold text-amber-900 bg-amber-100/95 px-0.5 rounded'
          }
        >
          {part}
        </span>
      );
    }
    // Markdown link [label](url)
    const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (md) {
      return (
        <a key={i} href={md[2]} target="_blank" rel="noopener noreferrer" className={`${linkCls} font-semibold`}>
          {md[1]}
        </a>
      );
    }
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={linkCls}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ═══════════════════════════════════════════════════════════════
// Chat nhóm nội bộ (Messenger) — không phải Lead/Deal
// ═══════════════════════════════════════════════════════════════
export function MessengerGroupChatTab({ groupId, socket, fillParent, compact = false, onMessagesChange, groupTitle = '' }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [groupMeta, setGroupMeta] = useState(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionPickIdx, setMentionPickIdx] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  // Map<userId, last_read_at ISO> — của các thành viên khác (không phải mình)
  const [readReceipts, setReadReceipts] = useState(() => new Map());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreMenuMsgId, setMoreMenuMsgId] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardMsgs, setForwardMsgs] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState(() => new Set());
  const [hiddenMsgIds, setHiddenMsgIds] = useState(() => new Set());
  // Typing indicator: Map<userId, { name, isBot, ts }>
  const [typingMap, setTypingMap] = useState(() => new Map());
  const typingThrottleRef = useRef(0);
  const groupMetaRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const initialScrolledRef = useRef(false);
  const textareaRef = useRef(null);
  const messageRefs = useRef(new Map());
  const { user } = useAuth();
  const { registerMessengerGroupPresence, markGroupRead } = useMessengerDock();
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  const historyLoadedRef = useRef(false);

  const emitMessages = useCallback((list, meta) => {
    onMessagesChangeRef.current?.(list, meta);
  }, []);

  useEffect(() => {
    if (!historyLoadedRef.current) return;
    emitMessages(messages, { loaded: true });
  }, [messages, emitMessages]);

  // Tự đánh dấu đã đọc mỗi khi danh sách tin nhắn thay đổi (mở tab hoặc nhận tin mới
  // trong khi tab đang hiển thị) — để phía gửi nhận được trạng thái "Đã xem".
  useEffect(() => {
    if (!groupId || !messages.length) return;
    const last = messages[messages.length - 1];
    const uidStr = String(user?.userId || user?.id || '');
    if (last && String(last.user_id) === uidStr) return;
    markGroupRead?.(groupId);
  }, [groupId, messages, markGroupRead, user]);

  useEffect(() => {
    return registerMessengerGroupPresence(groupId);
  }, [groupId, registerMessengerGroupPresence]);

  useEffect(() => {
    if (!groupId) return;
    try {
      const raw = localStorage.getItem(`messenger_hidden_${groupId}`);
      const ids = raw ? JSON.parse(raw) : [];
      setHiddenMsgIds(new Set(Array.isArray(ids) ? ids.map(String) : []));
    } catch {
      setHiddenMsgIds(new Set());
    }
    setSelectMode(false);
    setSelectedMsgIds(new Set());
    setMoreMenuMsgId(null);
  }, [groupId]);

  const persistHidden = useCallback(
    (ids) => {
      if (!groupId) return;
      localStorage.setItem(`messenger_hidden_${groupId}`, JSON.stringify([...ids]));
    },
    [groupId],
  );

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedMsgIds(new Set());
    setMoreMenuMsgId(null);
  }, []);

  const startSelectMode = useCallback((seedId) => {
    setSelectMode(true);
    setMoreMenuMsgId(null);
    setSelectedMsgIds(seedId != null ? new Set([String(seedId)]) : new Set());
  }, []);

  const toggleMsgSelected = useCallback((id) => {
    const sid = String(id);
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  const loadGroupMeta = useCallback(async () => {
    try {
      const { data } = await api.get(`/messenger/groups/${groupId}`);
      const meta = { is_direct: !!data?.is_direct, members: data?.members || [] };
      setGroupMeta(meta);
      groupMetaRef.current = meta;
    } catch {
      setGroupMeta(null);
      groupMetaRef.current = null;
    }
  }, [groupId]);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/messenger/groups/${groupId}/chat`);
      const rows = (Array.isArray(r.data) ? r.data : []).map((m) => ({
        ...m,
        reactions: normalizeMessengerReactions(m.reactions),
        is_recalled: !!(m.recalled_at || m.is_recalled),
      }));
      historyLoadedRef.current = true;
      setMessages(rows);
      emitMessages(rows, { loaded: true });
    } catch (e) {
      console.error(e);
      historyLoadedRef.current = true;
      emitMessages([], { loaded: true });
    }
  }, [groupId, emitMessages]);

  // Tự động cuộn xuống đáy.
  // - Lần đầu khi load tin: nhảy thẳng (instant) để người dùng thấy luôn tin mới nhất.
  // - Khi có tin mới sau đó: chỉ cuộn mượt nếu user đang ở gần đáy (không giật khỏi vị trí đọc cũ).
  useEffect(() => {
    if (!messages.length) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (!initialScrolledRef.current) {
      initialScrolledRef.current = true;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 160) {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages]);

  const loadReceipts = useCallback(async () => {
    try {
      const r = await api.get(`/messenger/groups/${groupId}/read-receipts`);
      const next = new Map();
      (r.data || []).forEach((row) => {
        if (row?.user_id && row?.last_read_at) next.set(String(row.user_id), row.last_read_at);
      });
      setReadReceipts(next);
    } catch {
      setReadReceipts(new Map());
    }
  }, [groupId]);

  const toggleReaction = useCallback(
    async (msg, emoji) => {
      try {
        const { data } = await api.put(`/messenger/groups/${groupId}/chat/${msg.id}/reaction`, { emoji });
        const rx = normalizeMessengerReactions(data?.reactions);
        setMessages((prev) =>
          prev.map((m) => (String(m.id) === String(msg.id) ? { ...m, reactions: rx } : m)),
        );
      } catch (e) {
        alert(e.response?.data?.error || e.message || 'Không gửi được cảm xúc');
      }
    },
    [groupId],
  );

  const recallMessage = useCallback(
    async (msg) => {
      if (!window.confirm('Thu hồi tin nhắn này? Nội dung sẽ bị xóa và không thể khôi phục.')) return;
      try {
        const { data } = await api.post(`/messenger/groups/${groupId}/chat/${msg.id}/recall`);
        setMessages((prev) =>
          prev.map((m) =>
            String(m.id) === String(msg.id) ? mergeMessengerMessage(m, { ...data, is_recalled: true }) : m,
          ),
        );
      } catch (e) {
        alert(e.response?.data?.error || e.message || 'Không thu hồi được tin');
      }
    },
    [groupId],
  );

  const canRecallMessage = useCallback(
    (msg) => {
      const me = String(user?.userId || user?.id || '');
      if (!msg || String(msg.user_id) !== me || isMessengerMessageRecalled(msg) || msg.is_system) return false;
      const t = msg.created_at ? new Date(msg.created_at).getTime() : 0;
      return Number.isFinite(t) && Date.now() - t <= 24 * 60 * 60 * 1000;
    },
    [user],
  );

  const selectedMessages = useMemo(() => {
    if (!selectedMsgIds.size) return [];
    const idSet = selectedMsgIds;
    return messages.filter((m) => idSet.has(String(m.id)) && !hiddenMsgIds.has(String(m.id)));
  }, [messages, selectedMsgIds, hiddenMsgIds]);

  const bulkRecallEligible = useMemo(
    () => selectedMessages.filter((m) => canRecallMessage(m)),
    [selectedMessages, canRecallMessage],
  );

  const hideMessagesForMe = useCallback(
    (ids) => {
      const list = [...ids].map(String);
      if (!list.length) return;
      setHiddenMsgIds((prev) => {
        const next = new Set(prev);
        list.forEach((id) => next.add(id));
        persistHidden(next);
        return next;
      });
      exitSelectMode();
    },
    [persistHidden, exitSelectMode],
  );

  const applyReactionUpdate = useCallback((ev) => {
    if (String(ev?.group_id) !== String(groupId) || !ev?.message_id) return;
    const rx = normalizeMessengerReactions(ev.reactions);
    setMessages((prev) =>
      prev.map((m) => (String(m.id) === String(ev.message_id) ? { ...m, reactions: rx } : m)),
    );
  }, [groupId]);

  const applyRecallUpdate = useCallback((ev) => {
    if (String(ev?.group_id) !== String(groupId) || !ev?.message_id) return;
    if (ev.deleted) {
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(ev.message_id)));
      return;
    }
    // Tin cũ soft-recall (trước khi đổi sang xóa thật) — giữ hiển thị placeholder
    setMessages((prev) =>
      prev.map((m) =>
        String(m.id) === String(ev.message_id)
          ? mergeMessengerMessage(m, {
              recalled_at: ev.recalled_at || new Date().toISOString(),
              recalled_by: ev.recalled_by ?? m.recalled_by,
              is_recalled: true,
            })
          : m,
      ),
    );
  }, [groupId]);

  const mergeIncomingChat = useCallback((msg) => {
    const normalized = {
      ...msg,
      reactions: normalizeMessengerReactions(msg.reactions),
      is_recalled: !!(msg.recalled_at || msg.is_recalled),
    };
    setMessages((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === String(msg.id));
      if (idx >= 0) {
        return prev.map((m, i) => (i === idx ? mergeMessengerMessage(m, normalized) : m));
      }
      return [...prev, normalized];
    });
  }, []);

  useEffect(() => {
    historyLoadedRef.current = false;
    setMessages([]);
    setMentionOpen(false);
    setReadReceipts(new Map());
    initialScrolledRef.current = false;
    void loadGroupMeta();
    void load();
    void loadReceipts();
    if (socket) {
      socket.emit('join:messenger_group', groupId);
      const onChat = (msg) => {
        const gid = msg?.group_id ?? msg?.groupId;
        if (gid == null || String(gid) !== String(groupId)) return;
        mergeIncomingChat(msg);
        if (msg?.user_id) {
          setTypingMap((prev) => {
            if (!prev.has(msg.user_id)) return prev;
            const next = new Map(prev);
            next.delete(msg.user_id);
            return next;
          });
        }
      };
      const onReaction = (payload) => applyReactionUpdate(payload);
      const onRecalled = (payload) => applyRecallUpdate(payload);
      const onRead = (payload) => {
        if (String(payload?.group_id) !== String(groupId)) return;
        if (!payload?.user_id || !payload?.last_read_at) return;
        setReadReceipts((prev) => {
          const next = new Map(prev);
          next.set(String(payload.user_id), payload.last_read_at);
          return next;
        });
      };
      const onMembers = (payload) => {
        if (String(payload?.group_id) !== String(groupId)) return;
        void loadGroupMeta();
        void load();
      };
      const onTyping = (payload) => {
        if (!payload || String(payload.group_id) !== String(groupId)) return;
        const meId = String(user?.userId || user?.id || '');
        const uid = String(payload.user_id);
        if (uid === meId) return; // bỏ qua chính mình
        setTypingMap((prev) => {
          const next = new Map(prev);
          if (payload.is_typing) {
            const isBot = uid === '00000000-0000-0000-0000-0000000000a1';
            // Lookup tên từ groupMetaRef.current (không phụ thuộc state để tránh re-subscribe socket)
            let name = payload.full_name;
            if (!name) {
              const mem = (groupMetaRef.current?.members || []).find((m) => String(m.user_id) === uid);
              name = mem?.user?.full_name || mem?.user?.email || (isBot ? '🤖 AI' : 'Ai đó');
            }
            next.set(uid, { name, isBot, ts: Date.now() });
          } else {
            next.delete(uid);
          }
          return next;
        });
      };
      socket.on('messenger_group:chat', onChat);
      socket.on('messenger_group:reaction', onReaction);
      socket.on('messenger_group:reactions', onReaction);
      socket.on('messenger_group:recalled', onRecalled);
      socket.on('messenger_group:members', onMembers);
      socket.on('messenger_group:typing', onTyping);
      socket.on('messenger_group:read', onRead);
      return () => {
        socket.emit('leave:messenger_group', groupId);
        socket.off('messenger_group:chat', onChat);
        socket.off('messenger_group:reaction', onReaction);
        socket.off('messenger_group:reactions', onReaction);
        socket.off('messenger_group:recalled', onRecalled);
        socket.off('messenger_group:members', onMembers);
        socket.off('messenger_group:typing', onTyping);
        socket.off('messenger_group:read', onRead);
      };
    }
    return undefined;
  }, [groupId, socket, loadGroupMeta, load, loadReceipts, user, mergeIncomingChat, applyReactionUpdate, applyRecallUpdate]);

  // Auto cleanup typing entries quá 5s không refresh (client tự stop nếu server không emit stop kịp)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [k, v] of prev) {
          if (now - v.ts > 5000) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Phát typing event (throttle 2s) khi user gõ
  const emitTyping = useCallback(() => {
    if (!socket || !groupId) return;
    const now = Date.now();
    if (now - typingThrottleRef.current < 2000) return;
    typingThrottleRef.current = now;
    socket.emit('messenger_group:typing', { group_id: groupId, is_typing: true });
  }, [socket, groupId]);

  // Stop typing (sau khi gửi)
  const emitStopTyping = useCallback(() => {
    if (!socket || !groupId) return;
    typingThrottleRef.current = 0;
    socket.emit('messenger_group:typing', { group_id: groupId, is_typing: false });
  }, [socket, groupId]);

  const leaveGroup = async () => {
    if (groupMeta?.is_direct) return;
    if (!confirm('Rời nhóm chat này?')) return;
    try {
      await api.post(`/messenger/groups/${groupId}/leave`);
      window.dispatchEvent(new CustomEvent('messenger:left-group', { detail: { groupId } }));
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không rời được nhóm');
    }
  };

  const isGroupMentionEnabled = !!(groupMeta && !groupMeta.is_direct);

  const mentionPickerItems = useMemo(() => {
    if (!isGroupMentionEnabled) return [];
    const members = groupMeta?.members || [];
    const pos = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at === -1) return [];
    const frag = before.slice(at + 1);
    if (frag.includes('\n')) return [];
    const q = frag.toLowerCase();
    const items = [];
    if (mentionAllPickerMatchesQuery(frag)) {
      items.push({ type: 'all', key: '__mention_all__' });
    }
    members
      .filter((mem) => String(mem.user_id) !== String(user?.userId || user?.id))
      .filter((mem) => {
        const name = (mem.user?.full_name || mem.user?.email || String(mem.user_id || '')).toLowerCase();
        if (!q) return true;
        return name.includes(q);
      })
      .slice(0, 8)
      .forEach((mem) => items.push({ type: 'member', key: String(mem.user_id), mem }));
    return items;
  }, [groupMeta, isGroupMentionEnabled, text, user]);

  const syncMentionUi = useCallback(() => {
    if (!isGroupMentionEnabled) {
      setMentionOpen(false);
      return;
    }
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at === -1) {
      setMentionOpen(false);
      return;
    }
    const frag = before.slice(at + 1);
    if (frag.includes(' ') || frag.includes('\n')) {
      setMentionOpen(false);
      return;
    }
    setMentionStart(at);
    setMentionOpen(true);
    setMentionPickIdx(0);
  }, [text, isGroupMentionEnabled]);

  const applyMentionPick = (item) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after = text.slice(pos);
    let insert = '';
    if (item?.type === 'all') {
      insert = `@${MESSENGER_MENTION_ALL_LABEL} `;
    } else {
      const mem = item?.mem;
      const name = (mem?.user?.full_name || mem?.user?.email || `Thành viên ${String(mem?.user_id || '').slice(0, 8)}`).trim();
      insert = `@${name} `;
    }
    const next = before + insert + after;
    setText(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const c = before.length + insert.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(c, c);
      }
    });
  };

  const send = async (files = null, overrideText = null) => {
    const pickedFiles = files ? Array.from(files).filter(Boolean) : [];
    const rawText = overrideText != null ? String(overrideText) : text;
    const trimmed = rawText.trim();
    if ((!trimmed && pickedFiles.length === 0) || sending) return;
    setSending(true);
    const members = groupMeta?.members || [];
    const meId = user?.userId || user?.id;
    const mentionIds = isGroupMentionEnabled
      ? resolveMentionIdsFromContent(trimmed, members, { excludeUserId: meId })
      : [];
    const replyId = replyTo?.id || null;
    try {
      if (pickedFiles.length > 0) {
        for (let i = 0; i < pickedFiles.length; i++) {
          const fd = new FormData();
          fd.append('file', pickedFiles[i]);
          if (i === 0 && trimmed) {
            fd.append('content', trimmed);
            if (mentionIds.length) fd.append('mention_user_ids', JSON.stringify(mentionIds));
          }
          if (i === 0 && replyId) fd.append('reply_to', replyId);
          await api.post(`/messenger/groups/${groupId}/chat/upload`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        await api.post(`/messenger/groups/${groupId}/chat`, {
          content: trimmed,
          mention_user_ids: mentionIds,
          reply_to: replyId,
        });
      }
      if (overrideText == null) setText('');
      setReplyTo(null);
      emitStopTyping();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi gửi tin nhắn');
    }
    setSending(false);
  };

  const jumpToMessage = useCallback((id) => {
    if (!id) return;
    const el = messageRefs.current.get(String(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(String(id));
    setTimeout(() => setHighlightId(null), 1600);
  }, []);

  const renderAttachmentsGrouped = (message, opts = {}) => {
    const bare = !!opts.bare;
    const alignEnd = !!opts.alignEnd;
    const items = collectMessengerAttachments(message);
    if (!items.length) return null;
    const { images, videos, audios, files } = groupMessengerAttachments(items);
    const sections = [];
    if (images.length) sections.push({ key: 'img', label: 'Ảnh', items: images });
    if (videos.length) sections.push({ key: 'vid', label: 'Video', items: videos });
    if (audios.length) sections.push({ key: 'aud', label: 'Âm thanh', items: audios });
    if (files.length) sections.push({ key: 'fil', label: 'Tệp', items: files });
    return sections.map((sec) => {
      const hideLabel = bare && (sec.key === 'img' || sec.key === 'fil');
      return (
        <div
          key={sec.key}
          className={hideLabel ? 'space-y-1.5' : 'mt-2 space-y-1'}
        >
          {!hideLabel ? (
            <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{sec.label}</p>
          ) : null}
          <div className="space-y-1.5">
            {sec.items.map((att, i) => {
              const isImg = att.type?.startsWith('image/');
              const isVideo = att.type?.startsWith('video/');
              const isAudio = att.type?.startsWith('audio/');
              const fileUrl = resolveMediaUrl(att.url);
              return (
                <div key={`${sec.key}-${i}`}>
                  {isImg ? (
                    <img
                      src={fileUrl}
                      className={`${
                        bare && alignEnd ? 'ml-auto ' : ''
                      }${
                        bare
                          ? 'rounded-2xl max-w-full max-h-72 cursor-pointer shadow-md object-cover block'
                          : 'rounded-lg max-w-full max-h-48 cursor-pointer bg-slate-100 object-contain'
                      }`}
                      alt={att.name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
                      }}
                      onClick={() => setMediaPreview({ ...att, url: fileUrl })}
                    />
                  ) : isVideo ? (
                    <video
                      src={fileUrl}
                      controls
                      className="rounded-lg max-w-full max-h-48 cursor-pointer bg-black/5"
                      onClick={() => setMediaPreview({ ...att, url: fileUrl })}
                    />
                  ) : isAudio ? (
                    <audio src={fileUrl} controls className="w-full max-w-xs" />
                  ) : (
                    <MessengerFileAttachmentCard attachment={att} compact={bare} alignEnd={alignEnd} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  const uid = user?.userId || user?.id;

  // Index của tin nhắn cuối cùng mình gửi — dùng để gắn nhãn Đã gửi/Đã xem
  const lastMyMessageIndex = useMemo(() => {
    const uidStr = String(uid || '');
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (String(messages[i]?.user_id) === uidStr) return i;
    }
    return -1;
  }, [messages, uid]);

  return (
    <div className={fillParent ? 'flex flex-col flex-1 min-h-0' : 'flex flex-col'} style={fillParent ? undefined : { height: '450px' }}>
      {mediaPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <button type="button" onClick={() => setMediaPreview(null)} className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full">
            <X />
          </button>
          {mediaPreview.type?.startsWith('image/') ? (
            <img
              src={resolveMediaUrl(mediaPreview.url)}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              alt=""
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = BROKEN_MEDIA_PLACEHOLDER;
              }}
            />
          ) : (
            <video src={resolveMediaUrl(mediaPreview.url)} controls autoPlay className="max-h-[80vh] max-w-full rounded-lg" />
          )}
        </div>
      )}

      {groupMeta && !groupMeta.is_direct ? (
        <div className="shrink-0 flex justify-end px-3 pt-2 bg-gray-50 border-b border-gray-100">
          <button type="button" onClick={() => void leaveGroup()} className="text-[11px] text-slate-500 hover:text-rose-600 font-medium">
            Rời nhóm
          </button>
        </div>
      ) : null}

      <div ref={scrollContainerRef} className={`flex-1 min-h-0 overflow-y-auto ${compact ? 'px-2.5 py-2' : 'px-4 py-3'} space-y-1 bg-gradient-to-b from-slate-50/60 via-white/40 to-violet-50/40 rounded-t-xl`}>
        {messages.map((m, idx) => {
          if (hiddenMsgIds.has(String(m.id))) return null;
          const isMe = String(m.user_id) === String(uid);
          const msgSelected = selectedMsgIds.has(String(m.id));
          const callLogPayload = parseCallLogPayload(m.content);
          const isCallLog = m.message_type === 'call' || !!callLogPayload;
          const selectable = !m.is_system && m.message_type !== 'system' && !isCallLog && !isMessengerMessageRecalled(m);
          const isBot = !!m.user?.is_bot;
          const mentionedIds = !groupMeta?.is_direct
            ? [
                ...(Array.isArray(m.mention_user_ids) ? m.mention_user_ids : []),
                ...resolveMentionIdsFromContent(m.content || '', groupMeta?.members || [], { excludeUserId: uid }),
              ]
            : [];
          const mentioned = mentionedIds.map(String).includes(String(uid));
          if (m.is_system && !isBot && (m.message_type === 'system' || isCallLog)) {
            const sysText = isCallLog ? callLogDisplayText(m, uid) : (m.content || '');
            return (
              <div key={m.id} className="flex justify-center my-2">
                <span className={`text-[10px] px-3 py-1.5 rounded-full shadow-sm border max-w-[95%] text-center leading-snug inline-flex items-center gap-1.5 ${
                  isCallLog
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-100'
                    : 'text-violet-700 bg-violet-50 border-violet-100'
                }`}>
                  {isCallLog && <Phone className="h-3 w-3 shrink-0 opacity-80" aria-hidden />}
                  <span>{sysText}</span>
                  <span className={isCallLog ? 'text-emerald-500' : 'text-violet-400'}> · {formatTime(m.created_at)}</span>
                </span>
              </div>
            );
          }
          const senderName = m.user?.full_name || m.user?.email || 'Thành viên';
          const parent = m.reply_to_message || m.reply || null;
          const isHighlight = String(highlightId || '') === String(m.id);

          const prev = messages[idx - 1];
          const showDateSep = !prev || !isSameDay(prev.created_at, m.created_at);
          // Chỉ hiển thị trạng thái "Đã gửi/Đã xem" cho tin nhắn cuối cùng của mình trong toàn bộ luồng
          const lastMineIdx = lastMyMessageIndex;
          const isLastFromMe = isMe && idx === lastMineIdx;
          let deliveryStatus = '';
          if (isLastFromMe) {
            const seenByOther = hasAnyOtherSeen(m, readReceipts, uid);
            deliveryStatus = seenByOther ? ' · Đã xem' : ' · Đã gửi';
          }

          const recalled = isMessengerMessageRecalled(m);
          const reactionGroups = groupMessengerReactions(m.reactions, uid);
          const contentStr = String(m.content || '');
          const isSticker = !recalled && isStickerContent(contentStr);
          const isImageOnly = !recalled && isImageOnlyMessengerMessage(m, contentStr);
          const isFileOnly = !recalled && isFileOnlyMessengerMessage(m, contentStr);
          const bubbleless = isSticker || isImageOnly || isFileOnly;
          const recalledLabel = isMe ? 'Đã thu hồi tin nhắn' : 'Tin nhắn bị thu hồi';

          const bareMediaBlock = (align) => (
            <>
              {!isMe && (
                <p className={`text-[10px] font-semibold mb-1 px-1 ${isBot ? 'text-indigo-600' : 'text-violet-600'}`}>
                  {senderName}
                </p>
              )}
              {parent ? <ReplyQuoteInBubble parent={parent} isMe={isMe} onJump={jumpToMessage} /> : null}
              <div
                className={`flex flex-col gap-1.5 w-full ${
                  align === 'end' ? 'items-end' : 'items-start'
                }`}
              >
                {renderAttachmentsGrouped(m, { bare: true, alignEnd: align === 'end' })}
              </div>
            </>
          );

          return (
            <Fragment key={m.id}>
              {showDateSep && (
                <div className="flex justify-center pt-2 pb-1">
                  <span className="text-[10px] font-medium text-slate-500 bg-white/70 backdrop-blur px-3 py-0.5 rounded-full border border-slate-200/70">
                    {formatDateSeparator(m.created_at)}
                  </span>
                </div>
              )}
              <div
                ref={(el) => {
                  if (el) messageRefs.current.set(String(m.id), el);
                  else messageRefs.current.delete(String(m.id));
                }}
                className={`group/msg flex items-start ${isMe ? 'justify-end' : 'justify-start'} gap-2 transition-colors rounded-lg ${
                  isHighlight ? 'ring-2 ring-amber-300 bg-amber-50/60' : ''
                } ${selectMode && msgSelected ? 'bg-violet-50/70 ring-1 ring-violet-200/80' : ''}`}
              >
                {selectMode && selectable ? (
                  <button
                    type="button"
                    onClick={() => toggleMsgSelected(m.id)}
                    className={`self-center shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                      msgSelected
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'border-slate-300 bg-white hover:border-violet-400'
                    }`}
                    aria-label={msgSelected ? 'Bỏ chọn' : 'Chọn tin'}
                  >
                    {msgSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                  </button>
                ) : null}
                {!isMe && (
                  isBot ? (
                    <div className="h-7 w-7 mt-1 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md ring-2 ring-white shrink-0">
                      <span className="text-white text-sm">🤖</span>
                    </div>
                  ) : (
                    <div className="shrink-0 mt-1">
                      <Avatar name={senderName} url={m.user?.avatar} size={7} />
                    </div>
                  )
                )}
                <div className="max-w-[78%] min-w-0">
                  {recalled ? (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-[13px] italic text-slate-500 ${
                        isMe ? 'bg-violet-50/80 border-violet-200/60' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Undo2 className="h-3.5 w-3.5 shrink-0" />
                      {recalledLabel}
                    </div>
                  ) : selectMode ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => selectable && toggleMsgSelected(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (selectable) toggleMsgSelected(m.id);
                        }
                      }}
                      className="max-w-full cursor-pointer"
                    >
                      {isSticker ? (
                        <>
                          {!isMe && (
                            <p className={`text-[10px] font-semibold mb-1 px-1 ${isBot ? 'text-indigo-600' : 'text-violet-600'}`}>
                              {senderName}
                            </p>
                          )}
                          <div className={isMe ? 'text-right' : 'text-left'}>
                            <StickerImage emoji={stripStickerPrefix(contentStr)} size={compact ? 84 : 128} />
                          </div>
                        </>
                      ) : isImageOnly || isFileOnly ? (
                        bareMediaBlock(isMe ? 'end' : 'start')
                      ) : (
                        <div
                          className={`rounded-3xl px-4 py-2.5 shadow-sm ${
                            isBot
                              ? 'bg-gradient-to-br from-indigo-50 to-purple-50 text-gray-900 rounded-bl-md border border-indigo-200'
                              : isMe
                                ? 'bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-br-md'
                                : 'bg-white text-gray-800 rounded-bl-md border border-slate-200/80'
                          }`}
                        >
                          {!isMe && (
                            <p className={`text-[10px] font-semibold mb-0.5 ${isBot ? 'text-indigo-600' : 'text-violet-600'}`}>
                              {senderName}
                            </p>
                          )}
                          {parent && <ReplyQuoteInBubble parent={parent} isMe={isMe} onJump={jumpToMessage} />}
                          <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                            {renderMessengerTextContent(m.content, isMe)}
                          </div>
                          {renderAttachmentsGrouped(m)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <MessengerMessageHoverActions
                      message={m}
                      isMe={isMe}
                      groupTitle={groupTitle || groupMeta?.name || ''}
                      canRecall={canRecallMessage(m)}
                      reactionGroups={reactionGroups}
                      alignEnd={isMe}
                      onReply={() => {
                        setReplyTo(m);
                        setMoreMenuMsgId(null);
                      }}
                      onToggleReaction={(emoji) => void toggleReaction(m, emoji)}
                      onRecall={() => void recallMessage(m)}
                      onForward={() => {
                        setForwardMsg(m);
                        setForwardMsgs(null);
                        setMoreMenuMsgId(null);
                      }}
                      onStartSelectMode={(id) => startSelectMode(id)}
                      moreMenuOpen={moreMenuMsgId === m.id}
                      onMoreMenuOpen={(open) => setMoreMenuMsgId(open ? m.id : null)}
                    >
                      {isSticker ? (
                        <>
                          {!isMe && (
                            <p className={`text-[10px] font-semibold mb-1 px-1 ${isBot ? 'text-indigo-600' : 'text-violet-600'}`}>
                              {senderName}
                            </p>
                          )}
                          <div className={isMe ? 'text-right' : 'text-left'}>
                            <StickerImage emoji={stripStickerPrefix(contentStr)} size={compact ? 84 : 128} />
                          </div>
                        </>
                      ) : isImageOnly || isFileOnly ? (
                        bareMediaBlock(isMe ? 'end' : 'start')
                      ) : (
                        <div
                          className={`rounded-3xl px-4 py-2.5 shadow-sm ${
                            isBot
                              ? 'bg-gradient-to-br from-indigo-50 to-purple-50 text-gray-900 rounded-bl-md border border-indigo-200'
                              : isMe
                                ? 'bg-gradient-to-br from-violet-500 to-violet-600 text-white rounded-br-md'
                                : 'bg-white text-gray-800 rounded-bl-md border border-slate-200/80'
                          }`}
                        >
                          {!isMe && (
                            <p className={`text-[10px] font-semibold mb-0.5 flex items-center gap-1 ${isBot ? 'text-indigo-600' : 'text-violet-600'}`}>
                              {senderName}
                              {isBot && (
                                <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[8px] font-bold">
                                  BOT
                                </span>
                              )}
                            </p>
                          )}
                          {mentioned && (
                            <p className="text-[9px] font-semibold mb-1 text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 inline-block">
                              Bạn được nhắc (@)
                            </p>
                          )}
                          {parent && <ReplyQuoteInBubble parent={parent} isMe={isMe} onJump={jumpToMessage} />}
                          <div className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
                            {renderMessengerTextContent(m.content, isMe)}
                          </div>
                          {renderAttachmentsGrouped(m)}
                        </div>
                      )}
                    </MessengerMessageHoverActions>
                  )}
                  {!recalled ? (
                    <p
                      className={`text-[10px] mt-1 px-1 ${
                        isMe ? 'text-right text-slate-400' : 'text-left text-slate-400'
                      }`}
                    >
                      {formatTime(m.created_at)}
                      {deliveryStatus}
                    </p>
                  ) : null}
                </div>
              </div>
            </Fragment>
          );
        })}
        <TypingIndicators typingMap={typingMap} />
        <div ref={messagesEndRef} />
      </div>

      {forwardMsg || (forwardMsgs && forwardMsgs.length) ? (
        <MessengerForwardMessageModal
          message={forwardMsg}
          messages={forwardMsgs?.length ? forwardMsgs : undefined}
          sourceTitle={groupTitle || groupMeta?.name || ''}
          excludeGroupId={groupId}
          onClose={() => {
            setForwardMsg(null);
            setForwardMsgs(null);
          }}
        />
      ) : null}

      {selectMode ? (
        <MessengerMessageSelectionBar
          count={selectedMessages.length}
          canRecallCount={bulkRecallEligible.length}
          onCancel={exitSelectMode}
          onCopy={async () => {
            if (!selectedMessages.length) {
              alert('Chọn ít nhất một tin nhắn');
              return;
            }
            try {
              await copyTextToClipboard(
                buildBulkMessengerShareText(selectedMessages, {
                  groupTitle: groupTitle || groupMeta?.name || '',
                }),
              );
              alert(`Đã sao chép ${selectedMessages.length} tin`);
            } catch (e) {
              alert(e?.message || 'Không sao chép được');
            }
          }}
          onForward={() => {
            if (!selectedMessages.length) {
              alert('Chọn ít nhất một tin nhắn');
              return;
            }
            setForwardMsgs([...selectedMessages]);
            setForwardMsg(null);
          }}
          onRecall={async () => {
            if (!bulkRecallEligible.length) {
              alert('Không có tin nào của bạn (trong 24h) để thu hồi');
              return;
            }
            if (!window.confirm(`Thu hồi ${bulkRecallEligible.length} tin đã chọn? Nội dung sẽ bị xóa.`)) return;
            for (const msg of bulkRecallEligible) {
              try {
                const { data } = await api.post(`/messenger/groups/${groupId}/chat/${msg.id}/recall`);
                setMessages((prev) =>
                  prev.map((m) =>
                    String(m.id) === String(msg.id) ? mergeMessengerMessage(m, { ...data, is_recalled: true }) : m,
                  ),
                );
              } catch (e) {
                alert(e.response?.data?.error || e.message || 'Thu hồi thất bại');
                break;
              }
            }
            exitSelectMode();
          }}
          onDeleteForMe={() => {
            if (!selectedMessages.length) {
              alert('Chọn ít nhất một tin nhắn');
              return;
            }
            if (!window.confirm(`Ẩn ${selectedMessages.length} tin chỉ ở phía bạn?`)) return;
            hideMessagesForMe(selectedMessages.map((m) => m.id));
          }}
        />
      ) : null}

      <div className={`${compact ? 'px-2.5 pt-1.5 pb-2' : 'px-3 pt-2 pb-3'} border-t border-slate-200/70 bg-white/85 backdrop-blur-xl rounded-b-xl shrink-0 relative`}>
        <ReplyComposerBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />

        {/* Quick reply chips — phản hồi 1 chạm */}
        {!text.trim() && !replyTo && (
          <div className={`flex items-center gap-1.5 ${compact ? 'mb-1.5' : 'mb-2'} overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}>
            {!compact && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 shrink-0 pl-1">
                <Zap className="h-3 w-3 fill-violet-500" />
                Trả lời nhanh:
              </span>
            )}
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void send(null, q)}
                className={`shrink-0 rounded-full bg-violet-50 hover:bg-violet-100 active:bg-violet-200 text-violet-700 font-medium border border-violet-200/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  compact ? 'px-2.5 py-0.5 text-[10.5px]' : 'px-3 py-1 text-[11px]'
                }`}
                title="Gửi nhanh"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {mentionOpen && mentionPickerItems.length > 0 && (
          <ul className="absolute bottom-full left-3 right-14 mb-1 max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-xs z-10">
            {mentionPickerItems.map((item, idx) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1.5 hover:bg-violet-50 ${idx === mentionPickIdx ? 'bg-violet-50' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMentionPick(item)}
                >
                  {item.type === 'all' ? (
                    <span className="font-semibold text-violet-700">@{MESSENGER_MENTION_ALL_LABEL}</span>
                  ) : (
                    <>@{item.mem?.user?.full_name || item.mem?.user?.email || item.mem?.user_id}</>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2 items-center">
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => send(e.target.files)} />
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={audioInputRef}
            onChange={(e) => {
              send(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Input pill — bao gọn paperclip + textarea + mic + emoji */}
          <div className={`flex-1 flex items-center gap-1 ${compact ? 'px-1.5 py-0.5 min-h-[36px]' : 'px-2 py-1 min-h-[42px]'} rounded-full bg-slate-100/90 border border-slate-200/80 focus-within:border-violet-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-200/60 transition-all`}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`shrink-0 ${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full text-slate-500 hover:text-violet-600 hover:bg-white/80 flex items-center justify-center transition-colors`}
              title="Đính kèm"
            >
              <Paperclip size={compact ? 14 : 16} />
            </button>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(e) => {
                setText(e.target.value);
                requestAnimationFrame(syncMentionUi);
                if (e.target.value.trim()) emitTyping();
                else emitStopTyping();
              }}
              onBlur={() => {
                emitStopTyping();
                setTimeout(() => setMentionOpen(false), 200);
              }}
              onKeyDown={(e) => {
                if (mentionOpen && mentionPickerItems.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setMentionPickIdx((i) => Math.min(i + 1, mentionPickerItems.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setMentionPickIdx((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    applyMentionPick(mentionPickerItems[mentionPickIdx] || mentionPickerItems[0]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    setMentionOpen(false);
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                compact
                  ? 'Nhập tin nhắn…'
                  : isGroupMentionEnabled
                    ? 'Nhập tin nhắn… Gõ @ để nhắc tên hoặc @Tất cả'
                    : 'Nhập tin nhắn…'
              }
              className={`flex-1 min-w-0 bg-transparent border-0 outline-none focus:ring-0 resize-none placeholder:text-slate-400 ${
                compact ? 'text-[13px] py-1 max-h-24' : 'text-sm py-1.5 max-h-32'
              }`}
              style={{ color: '#111827' }}
            />
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className={`shrink-0 ${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full text-slate-500 hover:text-violet-600 hover:bg-white/80 flex items-center justify-center transition-colors`}
              title="Ghi âm / file âm thanh"
            >
              <Mic size={compact ? 14 : 16} />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full hover:bg-white/80 flex items-center justify-center transition-colors ${
                  pickerOpen ? 'text-amber-500 bg-white/80' : 'text-slate-500 hover:text-amber-500'
                }`}
                title="Icon & Sticker"
              >
                <Smile size={compact ? 14 : 16} />
              </button>
              {pickerOpen && (
                <EmojiStickerPicker
                  onClose={() => setPickerOpen(false)}
                  onPickEmoji={(emoji) => {
                    const el = textareaRef.current;
                    const start = el?.selectionStart ?? text.length;
                    const end = el?.selectionEnd ?? text.length;
                    const next = text.slice(0, start) + emoji + text.slice(end);
                    setText(next);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        const pos = start + emoji.length;
                        textareaRef.current.focus();
                        textareaRef.current.setSelectionRange(pos, pos);
                      }
                    });
                  }}
                  onPickSticker={(emoji) => {
                    setPickerOpen(false);
                    void send(null, `${STICKER_PREFIX}${emoji}`);
                  }}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className={`bg-gradient-to-br from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition shadow-md shrink-0 ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
            title="Gửi"
          >
            <Send size={compact ? 14 : 16} className="-rotate-12" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hiển thị chip "X đang nhập..." hoặc "🤖 AI đang trả lời..." dưới list message. */
function TypingIndicators({ typingMap }) {
  if (!typingMap || typingMap.size === 0) return null;
  const entries = [...typingMap.values()];
  const botEntry = entries.find((e) => e.isBot);
  const humanEntries = entries.filter((e) => !e.isBot);

  return (
    <div className="px-3 pt-1 pb-2 space-y-1.5">
      {botEntry && (
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-indigo-50 border border-indigo-200 px-3 py-1.5 shadow-sm">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-medium text-indigo-700">AI đang trả lời</span>
          <TypingDots color="indigo" />
        </div>
      )}
      {humanEntries.length > 0 && (
        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-3 py-1.5">
          <span className="text-xs text-gray-700">
            {humanEntries.length === 1
              ? `${humanEntries[0].name} đang nhập`
              : `${humanEntries.length} người đang nhập`}
          </span>
          <TypingDots color="gray" />
        </div>
      )}
    </div>
  );
}

/** 3 chấm bounce animation. */
function TypingDots({ color = 'gray' }) {
  const dotColor = color === 'indigo' ? 'bg-indigo-500' : 'bg-gray-400';
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} animate-typing-dot`} style={{ animationDelay: '0ms' }} />
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} animate-typing-dot`} style={{ animationDelay: '150ms' }} />
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} animate-typing-dot`} style={{ animationDelay: '300ms' }} />
      <style>{`
        @keyframes typing-dot { 0%, 60%, 100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
        .animate-typing-dot { animation: typing-dot 1.2s infinite ease-in-out; }
      `}</style>
    </span>
  );
}

