(async function () {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (reg) { return reg.unregister(); }));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    }
    try {
      localStorage.removeItem('flutter_service_worker_version');
    } catch (_) {}
  } catch (_) {}
  window.setTimeout(function () {
    window.location.replace('/?cache-reset=' + Date.now());
  }, 500);
}());
