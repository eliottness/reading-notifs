// TEST_MODE-only Service Worker. Served at /sw.js by src/app.tsx only when process.env.TEST_MODE
// is set. It preserves the real push/notificationclick behaviour from src/public/sw.js, and adds:
//   1. a showNotification recorder that postMessages {title, body} to all window clients, so the
//      Playwright page can assert the notification fired inside the worker scope (CDP relay path);
//   2. a 'message' handler that re-runs showNotification for the inject fallback relay path.
// The recorder wraps the prototype method, so it captures calls regardless of how the real push
// handler invokes it, and regardless of whether headless Chromium actually renders a notification.

const __originalShowNotification = ServiceWorkerRegistration.prototype.showNotification;
ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
  const body = options && options.body;
  self.clients
    .matchAll({ includeUncontrolled: true, type: 'window' })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage({ __notif: true, title, body });
      }
    })
    .catch(() => {});
  try {
    return __originalShowNotification.call(this, title, options);
  } catch {
    // Headless rendering may reject; recording above has already happened.
    return Promise.resolve();
  }
};

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New chapter!', body: '' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.ico',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/dashboard'));
});

// Inject fallback: the relay posts the decrypted payload directly to the active worker.
self.addEventListener('message', (event) => {
  const d = event.data;
  if (d && d.__inject_push) {
    self.registration.showNotification(d.title, { body: d.body, icon: '/favicon.ico' });
  }
});
