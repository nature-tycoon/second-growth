// Google Tag Manager for the public website only, never the game at /play/.
// Kept out of the HTML so the page's CSP can still refuse inline scripts.
// Skipped for browsers asking not to be tracked and for local previews.
const optOut = navigator.globalPrivacyControl === true ||
  [navigator.doNotTrack, window.doNotTrack].some(value => value === '1' || value === 'yes');
const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (!optOut && !local) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-PF75LGQ5';
  document.head.appendChild(script);
}
