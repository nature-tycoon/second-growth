// Lightweight page guidance, independent of game loading or saved-farm state.
// "Play upright anyway" on the turn-your-phone screen, remembered on this device.
(() => {
  const root = document.documentElement, KEY = 'second-growth-upright';
  try { if (localStorage.getItem(KEY)) root.classList.add('upright-ok'); } catch (e) { /* storage blocked */ }
  document.getElementById('rotate-skip')?.addEventListener('click', () => {
    root.classList.add('upright-ok');
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ }
    window.dispatchEvent(new Event('upright-ok'));
  });
})();
(() => {
  const card = document.getElementById('home-install');
  if (!card || navigator.standalone) return;
  const ua = navigator.userAgent;
  // iPadOS can identify as a Mac when it requests desktop websites.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/i.test(ua) ? 'android' : null;
  if (!platform) return;
  card.querySelector(`[data-install="${platform}"]`).hidden = false;
  card.hidden = false;
})();
