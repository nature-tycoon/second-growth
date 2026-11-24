// Lightweight page guidance, independent of game loading or saved-farm state.
// "Play upright anyway" on the turn-your-phone screen, remembered for this tab only.
(() => {
  const root = document.documentElement, KEY = 'second-growth-upright';
  // Remembered for this tab only (sessionStorage), so the reminder is back on every new visit. It was
  // saved in localStorage for good, so one tap of "Play upright anyway" hid it on that phone forever.
  try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  try { if (sessionStorage.getItem(KEY)) root.classList.add('upright-ok'); } catch (e) { /* storage blocked */ }
  document.getElementById('rotate-skip')?.addEventListener('click', () => {
    root.classList.add('upright-ok');
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ }
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
