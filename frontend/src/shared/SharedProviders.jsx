import { ModuleAccessProvider } from './context/ModuleAccessContext';
import { UnreadBadgesProvider } from './context/UnreadBadgesContext';
import { PresenceProvider } from './context/PresenceContext';

/** Provider dùng chung cho toàn app (sau AuthProvider, trong BrowserRouter). */
export default function SharedProviders({ children }) {
  return (
    <ModuleAccessProvider>
      <PresenceProvider>
        <UnreadBadgesProvider>
          {children}
        </UnreadBadgesProvider>
      </PresenceProvider>
    </ModuleAccessProvider>
  );
}
