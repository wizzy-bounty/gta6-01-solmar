// save.js — localStorage persistence for SOLMAR HEAT.
// Stores story progress (mission index), money and the player's position so a
// run can be continued from the start screen. All access is failure-tolerant:
// a private-mode browser simply plays without saving.

const SAVE_KEY = 'solmar-heat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      missionIndex: Number.isFinite(data.missionIndex) ? data.missionIndex : 0,
      money: Number.isFinite(data.money) ? data.money : 0,
      position: Array.isArray(data.position) ? data.position : null,
      finishedStory: !!data.finishedStory,
    };
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: state.missionIndex,
      money: Math.round(state.money),
      position: state.position,
      finishedStory: !!state.finishedStory,
    }));
  } catch {
    /* storage unavailable — the game continues unsaved */
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
