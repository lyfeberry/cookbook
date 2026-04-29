const networkStatus = document.getElementById('network-status');
const swStatus = document.getElementById('sw-status');
const installBtn = document.getElementById('install-btn');

const updateNetwork = () => {
  networkStatus.textContent = navigator.onLine ? 'Online ✅' : 'Offline ⚠️';
};

window.addEventListener('online', updateNetwork);
window.addEventListener('offline', updateNetwork);
updateNetwork();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      swStatus.textContent = 'Service worker registered ✅';
    } catch (error) {
      swStatus.textContent = `Service worker failed ❌ (${error.message})`;
    }
  });
} else {
  swStatus.textContent = 'Service worker unsupported on this browser.';
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});
