import { ModuleAccessProvider } from './context/ModuleAccessContext';
import { UnreadBadgesProvider } from './context/UnreadBadgesContext';
import { PresenceProvider } from './context/PresenceContext';
import { FilePreviewProvider } from '../context/FilePreviewContext';

/** Provider dùng chung cho toàn app (sau AuthProvider, trong BrowserRouter). */
export default function SharedProviders({ children }) {
  return (
    <ModuleAccessProvider>
      <PresenceProvider>
        <UnreadBadgesProvider>
          <FilePreviewProvider>
            {children}
          </FilePreviewProvider>
        </UnreadBadgesProvider>
      </PresenceProvider>
    </ModuleAccessProvider>
  );
}
