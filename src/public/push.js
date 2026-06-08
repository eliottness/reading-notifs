(async function () {
  const btn = document.getElementById('enable-push');
  if (!btn) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = 'Push not supported in this browser';
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Permission denied — push notifications are blocked.');
        return;
      }

      const vapidKey = btn.dataset.vapidKey;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await fetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });

      window.location.reload();
    } catch (err) {
      console.error('Push subscription failed:', err);
      alert('Failed to enable push notifications: ' + err.message);
    }
  });

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }
})();
