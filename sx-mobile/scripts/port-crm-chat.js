/**
 * Port messenger files from crm-mobile-v2 → sx-mobile with import adaptations.
 * Run: node scripts/port-crm-chat.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CRM = path.join(ROOT, 'crm-mobile-v2', 'src');
const SX = path.join(ROOT, 'sx-mobile', 'src');

const REPLACEMENTS = [
  [/from '\.\.\/theme'/g, "from '../context/ThemeContext'"],
  [/from "\.\.\/theme"/g, 'from "../context/ThemeContext"'],
  [/from '\.\.\/\.\.\/theme'/g, "from '../../context/ThemeContext'"],
  [/from "\.\.\/\.\.\/theme"/g, 'from "../../context/ThemeContext"'],
  [/from '\.\.\/navigation\/types'/g, "from '../navigation/RootNavigator'"],
  [/from '\.\.\/context\/MessengerRealtimeContext'/g, "from '../context/NotificationContext'"],
  [/from '\.\/MessengerRealtimeContext'/g, "from './NotificationContext'"],
  [/import type \{ ThemeColors \}/g, 'import type { AppColors }'],
  [/ThemeColors/g, 'AppColors'],
  [/colors\.blue\b/g, 'colors.primary'],
  [/colors\.blueSoft\b/g, 'colors.primarySoft'],
  [/colors\.green\b/g, 'colors.success'],
  [/colors\.red\b/g, 'colors.danger'],
  [/formatChatHeaderPresenceLabel/g, 'formatPresenceLabel'],
  [/from '\.\.\/theme\/index'/g, "from '../context/ThemeContext'"],
];

function adapt(content) {
  let out = content;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

function port(rel) {
  const src = path.join(CRM, rel);
  const dest = path.join(SX, rel);
  if (!fs.existsSync(src)) {
    console.warn('SKIP (missing):', rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const text = adapt(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(dest, text, 'utf8');
  console.log('OK', rel);
}

const FILES = [
  // lib
  'lib/messengerMentions.ts',
  'lib/messengerReadReceipts.ts',
  'lib/messengerMessageCluster.ts',
  'lib/messengerFileOpen.ts',
  'lib/messengerFileForwardContext.ts',
  'lib/messengerThreadStorage.ts',
  'lib/messengerSenderColors.ts',
  'lib/guessAudioMime.ts',
  'lib/voicePermissions.ts',
  'lib/bubbleOutboundCallPending.ts',
  'lib/messengerApi.ts',
  'lib/messengerMedia.ts',
  'lib/messengerUpload.ts',
  'lib/messengerPreview.ts',
  'lib/messengerPresence.ts',
  'lib/messengerShare.ts',
  'lib/messengerReactions.ts',
  'lib/messengerForward.ts',
  'types/messenger.ts',
  'api/users.ts',
  // context
  'context/MessengerContext.tsx',
  'context/FileActionsContext.tsx',
  'context/CallContext.tsx',
  // components
  'components/messenger/ChatSearchSheet.tsx',
  'components/messenger/MessageSeenSheet.tsx',
  'components/messenger/ChatAudioPlayer.tsx',
  'components/messenger/MessengerFileCard.tsx',
  'components/messenger/MentionMessageText.tsx',
  'components/messenger/LinkedMessageText.tsx',
  'components/messenger/ChatMediaGalleryPanel.tsx',
  'components/messenger/ConversationActionsSheet.tsx',
  'components/messenger/FileActionsSheet.tsx',
  'components/messenger/ImageLightbox.tsx',
  'components/messenger/ChatComposer.tsx',
  'components/messenger/ChatMessageRow.tsx',
  'components/messenger/ChatHeader.tsx',
  'components/messenger/ChatBubble.tsx',
  'components/messenger/MessageActionSheet.tsx',
  'components/messenger/AttachFileSheet.tsx',
  'components/messenger/EmojiStickerPanel.tsx',
  'components/messenger/ChatDateSeparator.tsx',
  'components/messenger/MessengerAvatar.tsx',
  'components/BubbleOutboundCallHandler.tsx',
  // screens
  'screens/ChatDetailScreen.tsx',
  'screens/MessagesScreen.tsx',
  'screens/ChatDetailInfoScreen.tsx',
  'screens/CreateGroupChatScreen.tsx',
  'screens/MessengerForwardScreen.tsx',
  // calling
  'calling/LegacyGroupCallManager.ts',
];

for (const f of FILES) port(f);
console.log('\nDone. Review ChatDetailScreen fromBubble + sx-only routes manually.');
