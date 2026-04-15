// ═══════════════════════════════════════════════════════════════════════════
// Service Worker for Web Push Notifications
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener('push', function(event) {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.message || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: data.url || '/',
    },
    tag: data.tag || 'notification',
    requireInteraction: false, // Auto-close after 5 seconds
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Thông báo', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      // Check if there's already a window open with this URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('notificationclose', function(event) {
  // Optional: handle notification close
});
