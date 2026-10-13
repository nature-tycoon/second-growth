// Autosave triggers, status feedback, manual saving and recovery screens.
import { DAYS_PER_YEAR } from '../config.js';
import { saves, intact } from '../saves.js';

const $ = selector => document.querySelector(selector);

export class SaveControls {
  constructor(game, controls) {
    this.game = game;
    this.controls = controls;
  }

  bind() {
    const g = this.game;
    const save = () => {
      if (g.saveReady && g.autosave !== false) void g.save();
    };
    // Wall-clock saves also protect paused games and work done between game months.
    setInterval(() => { if (!document.hidden) save(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    const protect = () => {
      if (!g.saveReady) return;
      void saves.requestPersistence();
      window.removeEventListener('pointerdown', protect);
    };
    window.addEventListener('pointerdown', protect);
    g.on('save', status => {
      this.refresh();
      if (status.state === 'error' && !this.saveWarning) {
        this.saveWarning = true;
        g.notify('Your progress could not be saved in this browser. Keep this tab open and try Save game again.', 'warn');
      } else if (status.state === 'saved') this.saveWarning = false;
    });
    this.refresh();
  }

  refresh() {
    const label = $('#save-status'), g = this.game;
    if (!label) return;
    const status = g.saveStatus || { state: 'idle' };
    label.textContent = status.state === 'saving' ? 'Saving…' : status.state === 'saved' ? 'Saved' : status.state === 'error' ? 'Save failed' : g.autosave === false ? 'Autosave off' : '';
    label.classList.toggle('error', status.state === 'error');
    // "Saved" (and "Autosave off") show for a moment and fade; "Saving…" and a failed save stay
    clearTimeout(this.saveFade);
    label.classList.remove('faded');
    if (status.state !== 'saving' && status.state !== 'error') this.saveFade = setTimeout(() => label.classList.add('faded'), 2500);
    label.title = status.state === 'saved' ? `Saved on this device${status.savedAt ? ' at ' + new Date(status.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}.` :
      status.state === 'error' ? 'Open the menu and try Save game again.' : 'Progress saves automatically on this device.';
  }

  async manualSave(button) {
    button.disabled = true;
    const ok = await this.game.save();
    if (ok) { this.controls.closeModal(); this.game.notify('Game saved on this device.', 'good'); }
    else button.disabled = false;
  }

  async openRecovery() {
    const g = this.game, map = g.map, speed = g.speed;
    this.controls.setSpeed(0);
    const m = this.controls.openModal('Earlier saves', '<p>Opening your saved farms…</p>', { narrow: true, onClose: () => this.controls.setSpeed(speed) });
    try {
      const candidates = await saves.candidates(map);
      if (!m.isConnected) return;
      const backups = candidates.slice(1).filter(intact);
      const body = m.querySelector('.modal-body');
      body.innerHTML = `<p class="info-desc">Saves stay in this browser on this device. Restoring an earlier save replaces your current progress.</p>` +
        (backups.length ? `<div class="menu-list">${backups.map((s, k) => `<button class="btn secondary" data-backup="${k}">Year ${Math.floor(s.data.day / DAYS_PER_YEAR) + 1} · ${new Date(s.savedAt).toLocaleString()}</button>`).join('')}</div>` :
          '<p>No earlier saves yet. Previous versions are kept automatically as you play.</p>');
      body.querySelectorAll('[data-backup]').forEach(button => button.addEventListener('click', async () => {
        if (!button.dataset.sure) { button.dataset.sure = '1'; button.textContent = 'Click again to restore this save'; return; }
        body.querySelectorAll('button').forEach(b => { b.disabled = true; });
        // Commit current progress before switching, so it becomes an undo backup.
        if (g.saveReady && !await g.save()) { this.controls.closeModal(); return; }
        if (!g.restoreSnapshot(backups[+button.dataset.backup], map)) {
          this.controls.closeModal(); g.notify('That earlier save could not be restored. Your current farm has been kept.', 'warn'); return;
        }
        this.controls.closeModal(); this.controls.afterRestore();
        await g.save();
        g.notify('Earlier save restored.', 'good');
      }));
    } catch {
      this.controls.closeModal(); g.notify('Earlier saves could not be opened. Your current farm has been kept.', 'warn');
    }
  }
}
