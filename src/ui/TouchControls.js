// ===========================================================================
//  TOUCH CONTROLS
//
//  The mobile interface. The rule from the brief is followed literally: the
//  screen is NOT filled with permanent controls. There is a look area, a
//  thumbstick that appears where your thumb lands, and a small set of
//  contextual buttons that appear only when they apply.
//
//  Nothing here simplifies the game. Every command available on a PC is
//  available here, through the same command tree.
// ===========================================================================

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class TouchControls {
  constructor(root, input, bus) {
    this.root = root;
    this.input = input;
    this.bus = bus;
    this.buttons = new Map();
    this.visible = false;

    this.layer = el('div', 'touch-layer');
    this.layer.style.display = 'none';
    root.appendChild(this.layer);

    // The virtual thumbstick, drawn where the thumb went down.
    this.stick = el('div', 'touch-stick');
    this.stickKnob = el('div', 'touch-stick-knob');
    this.stick.appendChild(this.stickKnob);
    this.stick.style.display = 'none';
    this.layer.appendChild(this.stick);

    // Contextual buttons, right side, stacked.
    this.contextBar = el('div', 'touch-context');
    this.layer.appendChild(this.contextBar);

    // The five always-available essentials, bottom right, small.
    this.coreBar = el('div', 'touch-core');
    this.layer.appendChild(this.coreBar);

    this._buildCore();
  }

  _buildCore() {
    const core = [
      { id: 'commandMenu', label: 'CMD', title: 'Command menu' },
      { id: 'commanderMode', label: '◍', title: 'Cycle commander position' },
      { id: 'binoculars', label: '⌖', title: 'Binoculars' },
      { id: 'map', label: 'MAP', title: 'Map' },
      { id: 'crewStatus', label: '☰', title: 'Crew and condition' },
    ];
    for (const c of core) {
      const b = el('button', 'touch-btn touch-core-btn', c.label);
      b.title = c.title;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('pressed');
        this.input.pressAction(c.id);
      }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('pressed'); }, { passive: false });
      // Also work with a mouse, for testing on a desktop.
      b.addEventListener('click', () => this.input.pressAction(c.id));
      this.coreBar.appendChild(b);
    }
  }

  /**
   * Set the contextual buttons for the current situation. They appear when
   * relevant and vanish when not, which is what keeps the screen clear.
   * @param {Array<{id,label,danger,badge}>} items
   */
  setContext(items) {
    const key = items.map((i) => i.id + (i.badge || '')).join('|');
    if (key === this._contextKey) return;
    this._contextKey = key;

    this.contextBar.innerHTML = '';
    for (const it of items) {
      const b = el('button', `touch-btn touch-context-btn ${it.danger ? 'danger' : ''}`);
      b.innerHTML = `<span class="tb-label">${it.label}</span>${it.badge ? `<span class="tb-badge">${it.badge}</span>` : ''}`;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 140);
        this.input.pressAction(it.id);
        if (it.onPress) it.onPress();
      };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('click', fire);
      this.contextBar.appendChild(b);
    }
  }

  update() {
    if (!this.visible) return;
    const ts = this.input.touchState;
    if (ts?.stickVisible) {
      this.stick.style.display = '';
      this.stick.style.left = `${ts.stickCentre.x}px`;
      this.stick.style.top = `${ts.stickCentre.y}px`;
      this.stickKnob.style.transform =
        `translate(${ts.stickKnob.x - ts.stickCentre.x}px, ${ts.stickKnob.y - ts.stickCentre.y}px)`;
    } else {
      this.stick.style.display = 'none';
    }
  }

  setVisible(on) {
    this.visible = on;
    this.layer.style.display = on ? '' : 'none';
  }
}

/**
 * Work out which contextual buttons belong on screen right now.
 * This is the mobile equivalent of "the player knows which key to press",
 * and it is derived from the same game state the PC prompts use.
 */
export function contextualButtons(state) {
  const out = [];
  const { mode, tiger, nearInteraction, repair, recovery, abandonment, inTank } = state;

  if (nearInteraction) {
    out.push({ id: 'interact', label: nearInteraction.label.toUpperCase() });
  }

  if (!inTank) return out;

  // Position controls, always relevant inside the tank.
  if (mode === 'buttoned') out.push({ id: 'openHatch', label: 'OPEN HATCH' });
  else if (mode === 'hatch_open') {
    out.push({ id: 'commanderMode', label: 'HEAD OUT', danger: true });
    out.push({ id: 'openHatch', label: 'CLOSE HATCH' });
  } else if (mode === 'head_out' || mode === 'binoculars') {
    out.push({ id: 'commanderMode', label: 'GET DOWN' });
  }

  // The gun.
  if (tiger?.loadedRound) out.push({ id: 'quickFire', label: 'FIRE' });
  out.push({ id: 'quickTarget', label: 'TARGET' });
  if (!tiger?.components.gunner_sight?.destroyed) {
    out.push({ id: 'gunnerSight', label: mode === 'gunner_sight' ? 'BACK' : 'GUNNER SIGHT' });
  }

  // Emergencies appear ONLY when they are emergencies.
  if (tiger?.fire?.active) {
    out.push({ id: 'fireExtinguishers', label: 'EXTINGUISHERS', danger: true });
    out.push({ id: 'abandonTank', label: 'ABANDON', danger: true });
  }
  if (repair?.active) out.push({ id: 'abortRepair', label: 'ABORT REPAIR', danger: true });
  if (recovery?.state === 'arrived') out.push({ id: 'attachCable', label: 'ATTACH CABLE' });
  if (tiger && !tiger.assess().mobile && !recovery?.active) {
    out.push({ id: 'requestRecovery', label: 'REQUEST RECOVERY' });
  }
  const damaged = tiger?.condition().damaged.filter((d) => tiger.spec.COMPONENTS[d.id]?.fieldRepairable);
  if (damaged?.length && !repair?.active) {
    out.push({ id: 'openRepair', label: 'FIELD REPAIR', badge: String(damaged.length) });
  }
  if (abandonment?.active) out.push({ id: 'abandonStatus', label: abandonment.statusLine() || 'EVACUATING' });

  return out;
}
