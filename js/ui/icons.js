// Inline SVG icons for the interface.

const svg = (body, vb = '0 0 32 32') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  lock: svg('<rect x="8" y="14" width="16" height="13" rx="2.5" fill="currentColor"/><path d="M11 14 V10.5 A5 5 0 0 1 21 10.5 V14" fill="none" stroke="currentColor" stroke-width="3"/>'),
  pin: svg('<path d="M16 29 C16 29 7 19 7 12.5 A9 9 0 0 1 25 12.5 C25 19 16 29 16 29Z" fill="currentColor"/><circle cx="16" cy="12.5" r="3.4" fill="#fff"/>'),
  inspect: svg('<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 20 L27 27" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>'),
  shovel: svg('<path d="M9 23 C6 20 7 16 10 14 L13 17 L16 20 C14 23 10 24 9 23Z" fill="currentColor"/><path d="M14 16 L25 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M22 4 L27 9" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M4 28 C10 26 16 27 22 28" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>'),
  sprout: svg('<path d="M16 28 V15" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M16 17 C16 10 11 7 5 8 C5 14 9 18 16 17Z" fill="currentColor"/><path d="M16 14 C16 8 20 4 27 5 C27 11 23 15 16 14Z" fill="currentColor" opacity=".75"/><path d="M8 28 H24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  log: svg('<rect x="4" y="13" width="22" height="9" rx="4.5" fill="currentColor" opacity=".85"/><ellipse cx="26" cy="17.5" rx="3.5" ry="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 13 C9 9 13 8 15 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="26" cy="17.5" r="1.2" fill="currentColor"/>'),
  axe: svg('<path d="M9 27 L21 9" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M17 6 C22 3 28 6 28 12 C24 12 21 14 19 16 L15 11 Z" fill="currentColor"/>'),
  paw: svg('<ellipse cx="16" cy="21" rx="6.5" ry="5.5" fill="currentColor"/><ellipse cx="8" cy="14" rx="2.8" ry="3.5" fill="currentColor"/><ellipse cx="13" cy="9" rx="2.8" ry="3.6" fill="currentColor"/><ellipse cx="19.5" cy="9" rx="2.8" ry="3.6" fill="currentColor"/><ellipse cx="24.5" cy="14" rx="2.8" ry="3.5" fill="currentColor"/>'),
  demolish: svg('<rect x="6" y="14" width="14" height="12" fill="#9c3b2f"/><path d="M5 15 L13 7 L21 15Z" fill="#4b4a4c"/><path d="M19 4 L28 13" stroke="#6a5a48" stroke-width="3" stroke-linecap="round"/><path d="M24 6 L29 3 L30 8Z" fill="#8a8a8a"/><path d="M8 20 L12 26 M16 17 L14 24" stroke="#2a2020" stroke-width="1.5"/>'),
  fire: svg('<path d="M16 3 C18 9 25 12 24 20 C23.5 26 19.5 29 16 29 C11 29 7.5 25.5 8 20 C8.5 15 12 13 12 8 C14 10 15 12 15 14 C17 11 17 7 16 3Z" fill="#e8752a"/><path d="M16 14 C18 18 21 20 20 24 C19.5 27 17.5 28 16 28 C13.5 28 12 26 12.3 23.5 C12.7 20.5 15 19 16 14Z" fill="#f5c542"/>'),
  raise: svg('<path d="M3 26 C9 26 11 12 16 12 C21 12 23 26 29 26Z" fill="#8a7a4a"/><path d="M16 3 L21 9 H18 V14 H14 V9 H11Z" fill="#4f7d3b"/>'),
  lower: svg('<path d="M3 14 C9 14 11 26 16 26 C21 26 23 14 29 14 V28 H3Z" fill="#8a7a4a"/><path d="M16 17 L21 11 H18 V4 H14 V11 H11Z" fill="#3d7fa6"/>'),
  // shade cloth over the reef: the sun above, a dark cloth on its floats, coral below
  shade: svg('<circle cx="22" cy="7" r="4" fill="#f2b632"/><path d="M3 15 C8 13 12 17 16 15 C20 13 24 17 29 15" stroke="#4d8fc0" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="5" y="16" width="22" height="3" rx="1.2" fill="#2e4038"/><circle cx="6" cy="16" r="1.8" fill="#f4f2ea"/><circle cx="26" cy="16" r="1.8" fill="#f4f2ea"/><path d="M11 29 C11 25 13 24 14 22 M16 29 V22 M21 29 C21 25 19 24 18 23" stroke="#e8907a" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  crew: svg('<path d="M6 14 C6 8 11 5 16 5 C21 5 26 8 26 14Z" fill="#e0b030"/><rect x="4" y="13" width="24" height="3" rx="1.5" fill="#c8942a"/><path d="M9 20 C11 17 13 21 15 18 C16 22 19 18 21 21 C22 19 24 20 24 22 C24 26 20 28 16 28 C11 28 8 26 9 20Z" fill="#4d8fc0"/>'),
  // a visitor on a nature walk: sun hat, day pack and walking stick, mid-stride
  hiker: svg('<path d="M24.6 9.5 L22.2 29" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M15.2 18 L12.8 23 L9.6 27.8 M17.6 18 L20.6 22.4 L21.2 27.8" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M7.8 28.2 H11.4 M20.2 28.2 H23.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    + '<rect x="8.2" y="9.6" width="6.4" height="9.6" rx="2.6" fill="currentColor"/>'
    + '<path d="M13.4 10.6 C15.2 9.4 18 9.6 19.4 11 L18.8 18.4 C17.2 19.3 15 19.3 13.6 18.4 Z" fill="currentColor"/>'
    + '<path d="M18.4 12.4 L21.4 15.6 L23.6 14.6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="17.6" cy="6.4" r="3.1" fill="currentColor"/><ellipse cx="17.6" cy="3.9" rx="4.9" ry="1.05" fill="currentColor"/><path d="M15 3.9 C15.2 1.6 20 1.6 20.2 3.9Z" fill="currentColor"/>'),
  parking: svg('<rect x="3" y="3" width="26" height="26" rx="6" fill="#3a6a9a"/><path d="M12 24 V8 H18 C22 8 23.5 10.5 23.5 13 C23.5 15.5 22 18 18 18 H12" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>'),
  barn: svg('<path d="M4 14 L16 5 L28 14 V28 H4Z" fill="#9c3b2f"/><path d="M4 14 L16 5 L28 14" fill="none" stroke="#5a2a22" stroke-width="2"/><rect x="11" y="17" width="10" height="11" fill="#6e2a22"/><path d="M11 17 L21 28 M21 17 L11 28" stroke="#e8dcc6" stroke-width="1.6"/><rect x="14" y="10" width="4" height="4" fill="#e8dcc6"/>'),
  shed: svg('<path d="M5 14 L16 7 L27 14 V27 H5Z" fill="#8a7a5a"/><path d="M4 14 L16 6.5 L28 14" fill="none" stroke="#4b4a4c" stroke-width="2.4"/><rect x="12" y="17" width="8" height="10" fill="#5a4a38"/>'),
  house: svg('<path d="M3 15 L16 5 L29 15Z" fill="#6a5a4a"/><rect x="6" y="15" width="20" height="13" fill="#e8dcc6"/><rect x="9" y="18" width="5" height="4" fill="#9fc4d0"/><rect x="18" y="18" width="5" height="10" fill="#7a5a3a"/><rect x="21" y="6" width="3" height="6" fill="#8a6a50"/>'),
  silo: svg('<rect x="10" y="9" width="12" height="19" fill="#b8b4a8"/><path d="M10 9 Q16 2 22 9Z" fill="#8a8a8a"/><path d="M10 14 H22 M10 19 H22 M10 24 H22" stroke="#8a867a" stroke-width="1.2"/>'),
  center: svg('<path d="M3 15 L16 5 L29 15Z" fill="#4f6a3a"/><rect x="6" y="15" width="20" height="12" fill="#8a6444"/><rect x="9" y="18" width="9" height="5" fill="#9fc4d0"/><rect x="20" y="18" width="4" height="9" fill="#4a3020"/>'),
  moon: svg('<path d="M20.5 5.5a10.5 10.5 0 1 0 6 14.6A9 9 0 0 1 20.5 5.5z" fill="#e8e2c4"/><circle cx="12" cy="10" r="1" fill="#f7f0d4"/><circle cx="7.5" cy="16" r="0.8" fill="#f7f0d4"/>'),
  sun: svg('<circle cx="16" cy="16" r="6" fill="#f2b632"/><g stroke="#f2b632" stroke-width="2.2" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/></g>'),
  cloud: svg('<path d="M9 24 a6 6 0 0 1 1-12 a8 8 0 0 1 15 3 a5 5 0 0 1-1 9Z" fill="#b8c0c8"/><circle cx="23" cy="9" r="4" fill="#f2b632"/>'),
  rain: svg('<path d="M8 19 a6 6 0 0 1 1-12 a8 8 0 0 1 15 3 a5 5 0 0 1-1 9Z" fill="#8f9aa6"/><g stroke="#4d8fc0" stroke-width="2" stroke-linecap="round"><path d="M10 23l-1.5 4M16 23l-1.5 4M22 23l-1.5 4"/></g>'),
  snow: svg('<path d="M8 19 a6 6 0 0 1 1-12 a8 8 0 0 1 15 3 a5 5 0 0 1-1 9Z" fill="#a8b2bc"/><g fill="#e8f0f8" stroke="#8aa0b8" stroke-width=".8"><circle cx="10" cy="25" r="2"/><circle cx="16" cy="27" r="2"/><circle cx="22" cy="25" r="2"/></g>'),
  leaf: svg('<path d="M6 26 C6 12 14 6 27 5 C27 18 20 26 6 26Z" fill="currentColor"/><path d="M6 26 L20 12" stroke="#fff" stroke-width="1.5" opacity=".6"/>'),
  star: svg('<path d="M16 3 L20 12 L29 12.5 L22 18.5 L24.5 28 L16 22.5 L7.5 28 L10 18.5 L3 12.5 L12 12Z" fill="#f2c94c"/>'),
  info: svg('<circle cx="16" cy="16" r="12" fill="#7fb0d0"/><path d="M16 14v8" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="9.5" r="2" fill="#fff"/>'),
  warn: svg('<path d="M16 4 L29 27 H3Z" fill="#e0a040"/><path d="M16 12v7" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="23" r="1.8" fill="#fff"/>'),
  good: svg('<circle cx="16" cy="16" r="12" fill="#8cc46a"/><path d="M10 16.5 l4 4 l8-9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
};
