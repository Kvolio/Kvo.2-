// Save/load. Uses localStorage, which works identically on desktop browsers and
// on iOS Safari, so a campaign started on a PC and one started on an iPad
// behave the same way.

import { Campaign } from './Campaign.js';

const PREFIX = 'tiger101.save.';
const INDEX_KEY = 'tiger101.saves';

function safeStorage() {
  try {
    const t = '__t';
    localStorage.setItem(t, t);
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    // Private browsing, disabled site data, thumbnail capture — all real.
    return null;
  }
}

export const SaveSystem = {
  available() { return !!safeStorage(); },

  list() {
    const s = safeStorage();
    if (!s) return [];
    try {
      return JSON.parse(s.getItem(INDEX_KEY) || '[]');
    } catch { return []; }
  },

  save(slot, campaign, label = null) {
    const s = safeStorage();
    if (!s) return { ok: false, reason: 'This browser will not let the game store data.' };
    try {
      const payload = {
        savedAt: new Date().toISOString(),
        label: label || `${campaign.name} — ${campaign.date}`,
        campaign: campaign.serialize(),
      };
      s.setItem(PREFIX + slot, JSON.stringify(payload));

      const idx = this.list().filter((e) => e.slot !== slot);
      idx.push({
        slot, label: payload.label, savedAt: payload.savedAt,
        day: campaign.day, missions: campaign.missionIndex,
        difficulty: campaign.difficulty.label,
        tankStatus: campaign.tank.status,
        crewAlive: campaign.roster.crewList().filter((m) => m && m.state !== 'dead').length,
      });
      idx.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      s.setItem(INDEX_KEY, JSON.stringify(idx));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'Could not write the save. Storage may be full.' };
    }
  },

  load(slot) {
    const s = safeStorage();
    if (!s) return { ok: false, reason: 'This browser will not let the game read stored data.' };
    try {
      const raw = s.getItem(PREFIX + slot);
      if (!raw) return { ok: false, reason: 'No save in that slot.' };
      const payload = JSON.parse(raw);
      return { ok: true, campaign: Campaign.deserialize(payload.campaign), meta: payload };
    } catch (e) {
      return { ok: false, reason: 'That save could not be read.' };
    }
  },

  delete(slot) {
    const s = safeStorage();
    if (!s) return false;
    s.removeItem(PREFIX + slot);
    const idx = this.list().filter((e) => e.slot !== slot);
    s.setItem(INDEX_KEY, JSON.stringify(idx));
    return true;
  },

  /** Autosave after every mission, so a campaign is never lost to a closed tab. */
  autosave(campaign) { return this.save('auto', campaign, `Autosave — ${campaign.date}`); },

  /** Export a campaign as text, so it survives a cleared browser. */
  exportText(campaign) {
    return JSON.stringify(campaign.serialize());
  },

  importText(text) {
    try {
      return { ok: true, campaign: Campaign.deserialize(JSON.parse(text)) };
    } catch {
      return { ok: false, reason: 'That is not a valid campaign file.' };
    }
  },
};
