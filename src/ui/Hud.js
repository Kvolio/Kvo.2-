// ===========================================================================
//  HUD
//
//  Deliberately sparse. There is no enemy health bar, no armour rating, no
//  floating damage number and no omniscient marker. What the player gets is
//  what a commander in 1943 would have: his crew's voices, his instruments,
//  a compass, an ammunition count he can ask the loader for, and his own eyes.
//
//  The crew's dialogue IS the readout. If the gunner sounds like he is coming
//  apart, that is the stress display.
// ===========================================================================

import { clamp01, RAD, bearingToClock, callRange, formatGrid } from '../core/MathUtil.js';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class Hud {
  constructor(root, bus, opts = {}) {
    this.root = root;
    this.bus = bus;
    this.difficulty = opts.difficulty || {};
    this.visible = true;
    this.subtitles = [];
    this.maxSubtitles = 5;

    this._build();
    this._wire();
  }

  _build() {
    const r = this.root;
    r.innerHTML = '';
    r.className = 'hud';

    // ---- Crew intercom subtitles, bottom left ------------------------------
    this.subtitleBox = el('div', 'hud-subtitles');
    r.appendChild(this.subtitleBox);

    // ---- Contextual prompt, centre ----------------------------------------
    this.prompt = el('div', 'hud-prompt');
    this.prompt.style.display = 'none';
    r.appendChild(this.prompt);

    // ---- Vehicle state strip, bottom right ---------------------------------
    this.stateBox = el('div', 'hud-state');
    this.stateBox.innerHTML = `
      <div class="state-row"><span class="k">Loaded</span><span class="v" id="hud-loaded">—</span></div>
      <div class="state-row"><span class="k">AP</span><span class="v" id="hud-ap">—</span></div>
      <div class="state-row"><span class="k">HE</span><span class="v" id="hud-he">—</span></div>
      <div class="state-row"><span class="k">Smoke</span><span class="v" id="hud-smoke">—</span></div>
      <div class="state-row"><span class="k">Fuel</span><span class="v" id="hud-fuel">—</span></div>
      <div class="state-row"><span class="k">Position</span><span class="v" id="hud-position">—</span></div>`;
    r.appendChild(this.stateBox);

    // ---- Compass strip, top -------------------------------------------------
    this.compass = el('div', 'hud-compass');
    this.compassInner = el('div', 'compass-inner');
    this.compass.appendChild(this.compassInner);
    r.appendChild(this.compass);

    // ---- Warnings, centre top ----------------------------------------------
    this.warnings = el('div', 'hud-warnings');
    r.appendChild(this.warnings);

    // ---- Damage / condition panel (toggled) ---------------------------------
    this.damagePanel = el('div', 'hud-panel hud-damage');
    this.damagePanel.style.display = 'none';
    r.appendChild(this.damagePanel);

    // ---- Crew panel (toggled) ------------------------------------------------
    this.crewPanel = el('div', 'hud-panel hud-crew');
    this.crewPanel.style.display = 'none';
    r.appendChild(this.crewPanel);

    // ---- Radio log ----------------------------------------------------------
    this.radioLog = el('div', 'hud-radio');
    r.appendChild(this.radioLog);

    // ---- The ballistics inspector -------------------------------------------
    // Not a cheat: it shows the arithmetic for the shot that just happened, so
    // the player can verify the game is not lying to them.
    this.inspector = el('div', 'hud-panel hud-inspector');
    this.inspector.style.display = 'none';
    r.appendChild(this.inspector);

    // ---- Commander wound vignette -------------------------------------------
    this.vignette = el('div', 'hud-vignette');
    r.appendChild(this.vignette);

    // ---- Repair / recovery status -------------------------------------------
    this.taskStatus = el('div', 'hud-task');
    this.taskStatus.style.display = 'none';
    r.appendChild(this.taskStatus);

    // ---- Optics overlay (TZF sight / binoculars) ----------------------------
    this.optics = el('div', 'hud-optics');
    this.optics.style.display = 'none';
    this.optics.innerHTML = `<div class="optic-mask"></div><canvas class="optic-reticle"></canvas>`;
    r.appendChild(this.optics);
    this.reticleCanvas = this.optics.querySelector('.optic-reticle');
  }

  _wire() {
    const b = this.bus;
    b.on('crew:speak', (e) => this.addSubtitle(e));
    b.on('radio:message', (e) => this.addRadio(e));
    b.on('radio:friendly', (e) => this.addRadio({ from: '', line: e.line, kind: e.refused ? 'refused' : 'friendly' }));
    b.on('command:refused', (e) => this.warn(e.reason, 'refused', 3.2));
    b.on('command:ack', (e) => this.addSubtitle({ role: 'system', name: '', line: e.reason, tone: 'calm' }));

    b.on('fire:detected', () => this.warn('FIRE', 'fire', 8));
    b.on('fire:spreading', () => this.warn('FIRE SPREADING', 'fire', 8));
    b.on('fire:cooking_off', (e) => this.warn('AMMUNITION COOKING OFF', 'critical', 30));
    b.on('fire:extinguished', () => this.clearWarn('fire'));
    b.on('fire:suppression_discharge', (e) =>
      this.warn(`Extinguishers discharged — ${e.remaining} left`, 'info', 4));

    b.on('component:destroyed', (e) => this.warn(`${e.label} destroyed`, 'damage', 5));
    b.on('component:damaged', (e) => this.warn(`${e.label} damaged`, 'damage', 4));
    b.on('crew:wounded', (e) => this.warn(`${e.man.name} wounded`, 'crew', 5));
    b.on('crew:died', (e) => this.warn(`${e.man.name} killed`, 'critical', 7));
    b.on('commander:hit', (e) => this.warn('You are hit', 'critical', 6));

    b.on('vehicle:hit', (e) => { if (e.vehicle?.isPlayer) this.showImpact(e); });
    b.on('contact:new', (e) => { if (this.difficulty.showContactMarkers) this.warn('Contact', 'contact', 2.5); });
  }

  // ---- Subtitles -----------------------------------------------------------

  addSubtitle({ role, name, rank, line, tone, intercom }) {
    const item = el('div', `sub sub-${tone || 'calm'}${intercom === false ? ' sub-external' : ''}`);
    const who = el('span', 'sub-who', role === 'system' ? '' : `${(name || role || '').split(' ').pop()}:`);
    const what = el('span', 'sub-line', line);
    if (who.textContent) item.appendChild(who);
    item.appendChild(what);
    this.subtitleBox.appendChild(item);
    this.subtitles.push({ item, born: performance.now() });
    while (this.subtitles.length > this.maxSubtitles) {
      const old = this.subtitles.shift();
      old.item.remove();
    }
    // Fade out on their own so the box does not become a wall of text.
    setTimeout(() => item.classList.add('sub-fade'), 6200);
    setTimeout(() => {
      item.remove();
      const i = this.subtitles.findIndex((s) => s.item === item);
      if (i >= 0) this.subtitles.splice(i, 1);
    }, 8200);
  }

  addRadio({ from, line, kind }) {
    const item = el('div', `radio-line radio-${kind || 'traffic'}`);
    item.textContent = from ? `${from}: ${line}` : line;
    this.radioLog.appendChild(item);
    while (this.radioLog.children.length > 4) this.radioLog.firstChild.remove();
    setTimeout(() => item.classList.add('sub-fade'), 9000);
    setTimeout(() => item.remove(), 11000);
  }

  // ---- Warnings -------------------------------------------------------------

  warn(text, kind = 'info', seconds = 4) {
    const existing = this.warnings.querySelector(`[data-kind="${kind}"]`);
    if (existing) existing.remove();
    const w = el('div', `warn warn-${kind}`, text);
    w.dataset.kind = kind;
    this.warnings.appendChild(w);
    clearTimeout(w._t);
    w._t = setTimeout(() => w.remove(), seconds * 1000);
  }

  clearWarn(kind) {
    const e = this.warnings.querySelector(`[data-kind="${kind}"]`);
    if (e) e.remove();
  }

  // ---- Contextual prompt ----------------------------------------------------

  setPrompt(text, key = 'E') {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.innerHTML = '';
    const k = el('span', 'prompt-key', key);
    const t = el('span', 'prompt-text', text);
    this.prompt.appendChild(k);
    this.prompt.appendChild(t);
    this.prompt.style.display = '';
  }

  // ---- State ----------------------------------------------------------------

  updateState(tiger, commanderPos) {
    if (!tiger) return;
    const g = (id) => document.getElementById(id);
    const c = tiger.condition();
    const loadedName = c.loaded
      ? ({ pzgr39: 'AP', pzgr40: 'APCR', gr39hl: 'HEAT', sprgr39: 'HE', nbgr: 'Smoke' }[c.loaded] || c.loaded)
      : (tiger.reloading ? 'loading…' : 'EMPTY');
    g('hud-loaded').textContent = loadedName;
    g('hud-loaded').className = 'v' + (c.loaded ? '' : ' v-warn');
    g('hud-ap').textContent = (c.ammo.pzgr39 || 0) + (c.ammo.pzgr40 ? ` (+${c.ammo.pzgr40} APCR)` : '');
    g('hud-he').textContent = c.ammo.sprgr39 || 0;
    g('hud-smoke').textContent = c.ammo.nbgr || 0;
    const fuelPct = Math.round(c.fuelPct * 100);
    g('hud-fuel').textContent = `${c.fuelL} L (${fuelPct}%)`;
    g('hud-fuel').className = 'v' + (fuelPct < 20 ? ' v-warn' : '');
    g('hud-position').textContent = commanderPos || '—';
  }

  updateCompass(headingRad, turretRad) {
    // A simple ribbon, as the Tiger's own azimuth indicator was.
    const deg = ((headingRad * RAD) % 360 + 360) % 360;
    const marks = [];
    for (let d = -60; d <= 60; d += 15) {
      const bearing = ((deg + d) % 360 + 360) % 360;
      const label = bearing % 90 === 0
        ? ['N', 'E', 'S', 'W'][Math.round(bearing / 90) % 4]
        : String(Math.round(bearing)).padStart(3, '0');
      marks.push(`<span class="cm" style="left:${50 + d * 0.75}%">${label}</span>`);
    }
    // Where the turret is pointing relative to the hull.
    const tDeg = (turretRad * RAD);
    marks.push(`<span class="cm cm-turret" style="left:${50 + clampDeg(tDeg) * 0.75}%">▲</span>`);
    this.compassInner.innerHTML = marks.join('');
  }

  // ---- Panels ---------------------------------------------------------------

  toggleDamage(tiger) {
    const on = this.damagePanel.style.display === 'none';
    this.damagePanel.style.display = on ? '' : 'none';
    if (on) this.renderDamage(tiger);
  }

  renderDamage(tiger) {
    if (!tiger) return;
    const c = tiger.condition();
    const rows = c.damaged.length
      ? c.damaged.map((d) => `<div class="dmg-row dmg-${d.state}"><span>${d.label}</span><span>${d.state}</span></div>`).join('')
      : '<div class="dmg-row dmg-ok"><span>No damage reported</span><span>—</span></div>';
    const assess = tiger.assess();
    this.damagePanel.innerHTML = `
      <h3>Vehicle condition</h3>
      ${rows}
      <div class="dmg-summary">
        <div>Mobility: <b class="${assess.mobile ? 'good' : 'bad'}">${assess.mobile ? 'serviceable' : 'IMMOBILISED'}</b></div>
        <div>Armament: <b class="${assess.canFight ? 'good' : 'bad'}">${assess.canFight ? 'serviceable' : 'OUT OF ACTION'}</b></div>
        ${assess.reasons.length ? `<div class="dmg-reasons">${assess.reasons.join(' · ')}</div>` : ''}
      </div>
      <div class="hint">This is your crew's report, not a health bar. The Tiger has no hit points.</div>`;
  }

  toggleCrew(crewManager, commanderMan) {
    const on = this.crewPanel.style.display === 'none';
    this.crewPanel.style.display = on ? '' : 'none';
    if (on) this.renderCrew(crewManager, commanderMan);
  }

  renderCrew(crewManager, commanderMan) {
    if (!crewManager) return;
    const all = [];
    if (commanderMan) all.push({ ...commanderMan, role: 'commander', isYou: true });
    all.push(...crewManager.all());

    const stateClass = (s) => ({
      fit: 'good', wounded: 'warn', 'seriously wounded': 'bad',
      incapacitated: 'bad', dead: 'dead',
    }[s] || '');

    this.crewPanel.innerHTML = `<h3>Crew</h3>` + all.map((m) => `
      <div class="crew-row">
        <div class="crew-name">${m.rank || ''} ${m.name}${m.isYou ? ' <em>(you)</em>' : ''}</div>
        <div class="crew-role">${m.role}${m.actingAs ? ` + ${m.actingAs}` : ''}${m.outsideTank ? ' — OUTSIDE' : ''}</div>
        <div class="crew-state ${stateClass(m.state)}">${m.state}</div>
        <div class="crew-bars">
          <div class="bar bar-exp" title="experience"><i style="width:${Math.round(m.experience * 100)}%"></i></div>
          <div class="bar bar-fat" title="fatigue"><i style="width:${Math.round(m.fatigue * 100)}%"></i></div>
        </div>
      </div>`).join('')
      + `<div class="hint">Stress is not shown as a number. Listen to them.</div>`;
  }

  /** The ballistics inspector: the actual arithmetic of the last impact. */
  showImpact(ev) {
    if (!ev.report) return;
    this.lastImpact = ev;
    if (this.inspector.style.display === 'none') return;
    this.renderInspector();
  }

  toggleInspector() {
    const on = this.inspector.style.display === 'none';
    this.inspector.style.display = on ? '' : 'none';
    if (on) this.renderInspector();
  }

  renderInspector() {
    const ev = this.lastImpact;
    if (!ev?.report) {
      this.inspector.innerHTML = `<h3>Ballistics inspector</h3>
        <div class="hint">Nothing has hit you yet. When something does, the full calculation appears here.</div>`;
      return;
    }
    const r = ev.report;
    const verdict = ev.outcome.replace(/_/g, ' ').toUpperCase();
    const cls = ev.penetrated ? 'bad' : 'good';
    this.inspector.innerHTML = `
      <h3>Ballistics inspector</h3>
      <div class="insp-verdict ${cls}">${verdict}</div>
      <table class="insp">
        <tr><td>Projectile</td><td>${r.projectile}</td></tr>
        <tr><td>Type / calibre</td><td>${r.projectileKind}, ${r.caliber} mm, ${r.mass} kg</td></tr>
        <tr><td>Muzzle velocity</td><td>${r.muzzleVelocity} m/s</td></tr>
        <tr><td>Range</td><td>${r.range} m</td></tr>
        <tr><td>Impact velocity</td><td>${r.impactVelocity} m/s</td></tr>
        <tr><td>Plate struck</td><td>${r.plate}</td></tr>
        <tr><td>Plate thickness</td><td>${r.plateThickness} mm</td></tr>
        <tr><td>Obliquity</td><td>${r.obliquityDeg}°</td></tr>
        <tr><td>Normalisation</td><td>${r.normalisationDeg}°</td></tr>
        <tr class="insp-key"><td>Penetration capability</td><td>${r.penetrationCapability} mm</td></tr>
        <tr class="insp-key"><td>Effective thickness</td><td>${r.effectiveThickness} mm</td></tr>
      </table>
      ${r.note ? `<div class="insp-note">${r.note}</div>` : ''}
      <div class="hint">No dice were rolled. Same shot, same answer, every time.</div>`;
  }

  // ---- Task status (repair / recovery) ---------------------------------------

  setTaskStatus(lines) {
    const items = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!items.length) { this.taskStatus.style.display = 'none'; return; }
    this.taskStatus.innerHTML = items.map((l) => `<div class="task-line">${l}</div>`).join('');
    this.taskStatus.style.display = '';
  }

  // ---- Commander condition ----------------------------------------------------

  /**
   * The commander's wounds are shown by degrading his vision, not by a health
   * bar. Blur, tunnelling and a red cast, all driven by the actual injury state.
   */
  setCommanderCondition(man) {
    if (!man) return;
    const hurt = 1 - clamp01(man.health);
    const shock = clamp01(man.shock);
    const bleeding = man.bleeding > 0;

    const vig = 0.15 + hurt * 0.55 + shock * 0.25;
    const red = hurt * 0.35 + (bleeding ? 0.12 : 0);
    this.vignette.style.boxShadow = `inset 0 0 ${18 + vig * 46}vmin ${vig * 16}vmin rgba(0,0,0,${0.35 + vig * 0.5})`;
    this.vignette.style.background = red > 0.02
      ? `radial-gradient(ellipse at center, rgba(120,10,10,0) 35%, rgba(120,10,10,${red}) 100%)`
      : 'none';
    this.root.style.setProperty('--wound-blur', `${(hurt * 2.6 + shock * 1.8).toFixed(2)}px`);
  }

  setVisible(on) {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  /** Draw the TZF 9b or binocular reticle. */
  showOptics(kind, fovDeg) {
    if (!kind) { this.optics.style.display = 'none'; return; }
    this.optics.style.display = '';
    // The circular vignette suits a telescope; the vision block draws its own.
    this.optics.querySelector('.optic-mask').style.display =
      kind === 'vision_block' ? 'none' : '';
    const cv = this.reticleCanvas;
    const w = cv.width = this.root.clientWidth;
    const h = cv.height = this.root.clientHeight;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.42;

    ctx.strokeStyle = 'rgba(20,24,18,0.92)';
    ctx.lineWidth = 2;

    if (kind === 'vision_block') {
      // Buttoned up, the commander sees the world through a horizontal slit of
      // laminated glass about 130 mm wide. The mask IS the disadvantage.
      const sw = w * 0.30, sh = h * 0.19;
      ctx.fillStyle = 'rgba(4,5,4,0.97)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      // Rounded slit cut out of an otherwise black screen.
      const r = Math.min(sh * 0.42, 26);
      ctx.moveTo(cx - sw + r, cy - sh);
      ctx.arcTo(cx + sw, cy - sh, cx + sw, cy + sh, r);
      ctx.arcTo(cx + sw, cy + sh, cx - sw, cy + sh, r);
      ctx.arcTo(cx - sw, cy + sh, cx - sw, cy - sh, r);
      ctx.arcTo(cx - sw, cy - sh, cx + sw, cy - sh, r);
      ctx.closePath();
      ctx.fill('evenodd');
      // The green tint and scratches of 1943 laminated glass.
      ctx.strokeStyle = 'rgba(120,150,110,0.30)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect?.(cx - sw, cy - sh, sw * 2, sh * 2, r);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,220,190,0.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = cy - sh + (i + 1) * (sh * 2 / 6);
        ctx.beginPath();
        ctx.moveTo(cx - sw + Math.random() * sw, y);
        ctx.lineTo(cx + Math.random() * sw, y + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      this.optics.dataset.kind = kind;
      return;
    }

    if (kind === 'tzf9b') {
      // The TZF 9b reticle: a central aiming triangle with numbered range marks
      // either side, exactly as the Tigerfibel shows it.
      ctx.beginPath();
      ctx.moveTo(cx, cy + R * 0.06);
      ctx.lineTo(cx - R * 0.035, cy);
      ctx.lineTo(cx + R * 0.035, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20,24,18,0.92)';
      ctx.fill();

      for (let i = 1; i <= 6; i++) {
        const x = R * 0.11 * i;
        const size = i % 2 === 0 ? R * 0.028 : R * 0.020;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + s * x, cy);
          ctx.lineTo(cx + s * x - size * 0.7, cy - size);
          ctx.lineTo(cx + s * x + size * 0.7, cy - size);
          ctx.closePath();
          ctx.fill();
        }
      }
      // Horizontal datum.
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.8, cy);
      ctx.lineTo(cx + R * 0.8, cy);
      ctx.stroke();
    } else if (kind === 'binoculars') {
      // 6x30 service binoculars: twin circles with a mil scale in the left eye.
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.6, cy);
      ctx.lineTo(cx + R * 0.1, cy);
      ctx.stroke();
      for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.6 + i * R * 0.12, cy - R * 0.03);
        ctx.lineTo(cx - R * 0.6 + i * R * 0.12, cy + R * 0.03);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 0.12);
      ctx.lineTo(cx, cy + R * 0.12);
      ctx.stroke();
    }
    this.optics.dataset.kind = kind;
  }
}

function clampDeg(d) {
  let x = ((d % 360) + 540) % 360 - 180;
  return Math.max(-80, Math.min(80, x));
}
