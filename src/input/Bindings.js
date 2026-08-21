// Default key bindings, fully rebindable and persisted to localStorage.
// There is no console control scheme, by request.

export const DEFAULT_BINDINGS = {
  // --- On foot ---
  walkForward: ['KeyW', 'ArrowUp'],
  walkBack: ['KeyS', 'ArrowDown'],
  walkLeft: ['KeyA', 'ArrowLeft'],
  walkRight: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft'],
  interact: ['KeyE'],

  // --- Commander ---
  commanderMode: ['KeyC'],        // cycle buttoned up / hatch open / head out
  openHatch: ['KeyH'],
  binoculars: ['KeyB'],
  map: ['KeyM'],
  commandMenu: ['Tab'],
  radio: ['KeyR'],
  crewStatus: ['KeyK'],
  damageReport: ['KeyJ'],
  ballisticsInspector: ['KeyL'],

  // --- Quick commands (number row) ---
  quickDriver: ['Digit1'],
  quickGunner: ['Digit2'],
  quickLoader: ['Digit3'],
  quickRadio: ['Digit4'],
  quickEmergency: ['Digit5'],

  quickTarget: ['KeyT'],          // "Gunner — target, my position"
  quickFire: ['KeyF'],
  quickStop: ['KeyX'],
  quickAdvance: ['KeyZ'],
  quickReverse: ['KeyV'],

  // --- Emergency ---
  fireExtinguishers: ['KeyG'],
  abandonTank: ['KeyP'],

  // --- System ---
  pause: ['Escape'],
  settings: ['F1'],
  screenshotHud: ['F2'],
  toggleHud: ['F3'],
  perfStats: ['F4'],
};

export const BINDING_LABELS = {
  walkForward: 'Walk forward', walkBack: 'Walk back',
  walkLeft: 'Walk left', walkRight: 'Walk right',
  run: 'Run', crouch: 'Crouch', interact: 'Interact',
  commanderMode: 'Cycle commander position', openHatch: 'Open / close hatch',
  binoculars: 'Binoculars', map: 'Map', commandMenu: 'Command menu',
  radio: 'Radio log', crewStatus: 'Crew status', damageReport: 'Damage report',
  ballisticsInspector: 'Ballistics inspector',
  quickDriver: 'Driver commands', quickGunner: 'Gunner commands',
  quickLoader: 'Loader commands', quickRadio: 'Radio commands',
  quickEmergency: 'Emergency commands',
  quickTarget: 'Gunner — target, my position', quickFire: 'Fire',
  quickStop: 'Driver — stop', quickAdvance: 'Driver — forward', quickReverse: 'Driver — reverse',
  fireExtinguishers: 'FIRE EXTINGUISHERS', abandonTank: 'ABANDON TANK',
  pause: 'Pause', settings: 'Settings', screenshotHud: 'Hide HUD for screenshot',
  toggleHud: 'Toggle HUD', perfStats: 'Performance statistics',
};

const STORAGE_KEY = 'tiger101.bindings';

export function loadBindings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function saveBindings(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); return true; }
  catch { return false; }
}

export function resetBindings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
  return { ...DEFAULT_BINDINGS };
}

/** Human-readable key name for the settings screen. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
  const map = {
    ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    Space: 'Space', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter',
  };
  return map[code] || code;
}
