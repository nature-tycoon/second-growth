// Lightweight page guidance, independent of game loading or saved-farm state.
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
