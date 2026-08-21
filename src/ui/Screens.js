// ===========================================================================
//  FULL-SCREEN INTERFACES
//
//  The briefing, the ammunition load, the company roster, the field repair
//  selector, the map, the after-action report and the settings. All of them are
//  built from the same live campaign objects the simulation uses, so what you
//  read here is what is true.
// ===========================================================================

import { DIFFICULTY, CUSTOM_OPTIONS, ARMOUR_GUARANTEE } from '../game/Difficulty.js';
import { VEHICLES, IDENTIFICATION_STAGES } from '../data/vehicles.js';
import { PROJECTILES, AMMO_ORDER_NAMES } from '../data/ammunition.js';
import { AMMO_CAPACITY, TIGER_1H } from '../data/tiger1h.js';
import { SPARE_PARTS } from '../campaign/Logistics.js';
import { BINDING_LABELS, keyLabel } from '../input/Bindings.js';
import { formatGrid, clamp, clamp01 } from '../core/MathUtil.js';
import { QUALITY } from '../render/Renderer.js';

const pct = (v) => `${Math.round((v || 0) * 100)}%`;

export class ScreenManager {
  constructor(root, bus) {
    this.root = root;
    this.bus = bus;
    this.el = document.createElement('div');
    this.el.className = 'screen-layer';
    this.el.style.display = 'none';
    root.appendChild(this.el);
    this.current = null;
    this.handlers = new Map();

    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const h = this.handlers.get(t.dataset.act);
      if (h) h(t.dataset, t);
    });
  }

  on(action, fn) { this.handlers.set(action, fn); return this; }

  show(name, html, opts = {}) {
    this.current = name;
    this.el.className = `screen-layer screen-${name}`;
    this.el.innerHTML = html;
    this.el.style.display = '';
    this.el.scrollTop = 0;
    this.bus?.emit('screen:show', { name });
    if (opts.after) opts.after(this.el);
  }

  hide() {
    this.el.style.display = 'none';
    const was = this.current;
    this.current = null;
    this.bus?.emit('screen:hide', { name: was });
  }

  get isOpen() { return this.current !== null; }
}

// ---------------------------------------------------------------------------
//  BRIEFING
// ---------------------------------------------------------------------------

export function briefingHtml(mission, campaign, sandTableData = {}) {
  const b = mission.briefing;
  const log = campaign.logistics;

  const opposition = b.expectedOpposition.map((o) => {
    const v = VEHICLES[o.type];
    const conf = {
      confirmed: 'Confirmed', reported: 'Reported', probable: 'Probable',
      possible: 'Possible', unconfirmed: 'Unconfirmed',
    }[o.confidence] || o.confidence;
    return `<tr class="${o.danger ? 'danger-row' : ''}">
      <td>${v?.designation || o.type}</td>
      <td>${o.count}</td>
      <td class="conf conf-${o.confidence}">${conf}</td>
      <td>${o.note || ''}</td></tr>`;
  }).join('');

  const friendly = (b.friendlyForces || []).map((f) => {
    const v = VEHICLES[f.type];
    return `<li>${f.count} × ${v?.short || f.type}${f.note ? ` — ${f.note}` : ''}</li>`;
  }).join('');

  const spares = Object.entries(log.spares)
    .map(([k, n]) => `<li class="${n === 0 ? 'out' : n < 3 ? 'low' : ''}">${SPARE_PARTS[k].label}: <b>${n}</b></li>`)
    .join('');

  const quality = b.intelligenceQuality;
  const qualityWord = quality > 0.75 ? 'good' : quality > 0.55 ? 'fair' : quality > 0.35 ? 'poor' : 'very poor';

  return `
  <div class="brief">
    <header>
      <div class="brief-unit">${campaign.unit}</div>
      <h1>${mission.title}</h1>
      <div class="brief-date">${mission.date} · ${mission.timeOfDay} · ${mission.weather}</div>
    </header>

    <section class="brief-situation">
      <h2>Situation</h2>
      <p>${b.situation}</p>
    </section>

    <section class="brief-mission">
      <h2>Mission</h2>
      <p class="objective">${b.objective}</p>
      <ul class="objectives">
        ${mission.objectives.map((o) => `<li class="${o.required ? 'req' : 'opt'}">${o.label}${o.required ? '' : ' <em>(optional)</em>'}</li>`).join('')}
      </ul>
    </section>

    <section class="brief-enemy">
      <h2>Expected Soviet forces</h2>
      <table class="intel-table">
        <thead><tr><th>Type</th><th>Strength</th><th>Confidence</th><th></th></tr></thead>
        <tbody>${opposition}</tbody>
      </table>
      <div class="intel-caveat">
        <b>Intelligence quality: ${qualityWord}.</b>
        These are reports, not facts. Units move, arrive late, turn out to be
        stronger than expected, or are misidentified by the men who saw them.
        Some of what is out there was never reported at all.
        ${sandTableData.unreported ? `<span class="warn-inline">At least ${sandTableData.unreported} position${sandTableData.unreported === 1 ? '' : 's'} on the sand table cannot be confirmed.</span>` : ''}
      </div>
      ${b.warnings?.length ? `<ul class="brief-warnings">${b.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}
    </section>

    <section class="brief-friendly">
      <h2>Friendly forces</h2>
      <ul>${friendly}</ul>
      <h3>Terrain</h3>
      <p>${b.terrainNotes}</p>
    </section>

    <section class="brief-logistics">
      <h2>Logistics</h2>
      <p class="log-line">${log.briefingLine()}</p>
      <div class="log-grid">
        <div>
          <h4>Ammunition in company stores</h4>
          <ul>
            <li>Panzergranate 39: <b>${log.ammunition.pzgr39}</b></li>
            <li>Sprenggranate: <b>${log.ammunition.sprgr39}</b></li>
            <li>Nebelgranate: <b>${log.ammunition.nbgr}</b></li>
            <li class="${log.ammunition.pzgr40 ? 'scarce' : 'out'}">Panzergranate 40: <b>${log.ammunition.pzgr40}</b>${log.ammunition.pzgr40 ? '' : ' — none available'}</li>
          </ul>
        </div>
        <div>
          <h4>Spare parts</h4>
          <ul>${spares}</ul>
        </div>
        <div>
          <h4>Company state</h4>
          <ul>
            <li>Fuel: <b>${log.fuelL} L</b></li>
            <li>Recovery vehicles: <b>${log.recoveryVehicles}</b>${log.recoveryVehicles === 0 ? ' — <span class="bad">none available</span>' : ''}</li>
            <li>Reserve crew: <b>${campaign.roster.reserve.length}</b></li>
            <li>${campaign.tank.callsign} (${campaign.tank.turmNummer}): <b>${campaign.tank.status}</b></li>
            ${campaign.tank.repairMissionsRemaining > 0
    ? `<li class="bad">In repair: ${campaign.tank.repairDescription} — ${campaign.tank.repairMissionsRemaining} mission(s)</li>` : ''}
          </ul>
        </div>
      </div>
    </section>

    <footer class="brief-actions">
      <button data-act="brief-roster" class="btn">Company roster</button>
      <button data-act="brief-loadout" class="btn">Ammunition load</button>
      <button data-act="brief-walk" class="btn btn-primary">Enter the command tent</button>
      <button data-act="brief-skip" class="btn btn-ghost">Go straight to the staging area</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
//  AMMUNITION LOADOUT
// ---------------------------------------------------------------------------

export function loadoutHtml(loadout, logistics, capacity = AMMO_CAPACITY) {
  const total = Object.values(loadout).reduce((a, b) => a + b, 0);
  const rows = ['pzgr39', 'sprgr39', 'nbgr', 'pzgr40', 'gr39hl'].map((id) => {
    const p = PROJECTILES[id];
    const have = logistics.ammunition[id] ?? 0;
    const want = loadout[id] ?? 0;
    const maxAvail = Math.min(have, capacity);
    return `<div class="ammo-row ${have === 0 ? 'unavailable' : ''}">
      <div class="ammo-head">
        <span class="ammo-name">${p.name}</span>
        <span class="ammo-short">${p.short}</span>
      </div>
      <div class="ammo-desc">${p.desc || ''}</div>
      <div class="ammo-controls">
        <button class="btn-sm" data-act="ammo-dec" data-id="${id}" data-n="5">−5</button>
        <button class="btn-sm" data-act="ammo-dec" data-id="${id}" data-n="1">−1</button>
        <span class="ammo-count">${want}</span>
        <button class="btn-sm" data-act="ammo-inc" data-id="${id}" data-n="1" ${want >= maxAvail || total >= capacity ? 'disabled' : ''}>+1</button>
        <button class="btn-sm" data-act="ammo-inc" data-id="${id}" data-n="5" ${want >= maxAvail || total >= capacity ? 'disabled' : ''}>+5</button>
        <span class="ammo-avail">${have} in stores</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="loadout">
    <h1>Ammunition load</h1>
    <p class="sub">The Tiger stows <b>${capacity}</b> rounds in the sponson bins, the floor
      stowage and the loader's four-round ready rack. What you take is what you have —
      there is no resupply in the field.</p>
    <div class="loadout-total ${total > capacity ? 'over' : total === capacity ? 'full' : ''}">
      ${total} / ${capacity} rounds
    </div>
    ${rows}
    <div class="loadout-note">
      Panzergranate 40 was almost unobtainable during Zitadelle. If the company has
      any at all, it is a handful, and there will not be more.
    </div>
    <footer>
      <button data-act="loadout-default" class="btn">Standard load</button>
      <button data-act="loadout-confirm" class="btn btn-primary" ${total > capacity ? 'disabled' : ''}>Confirm</button>
      <button data-act="loadout-cancel" class="btn btn-ghost">Back</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
//  COMPANY ROSTER
// ---------------------------------------------------------------------------

export function rosterHtml(campaign, selectedRole = null) {
  const roster = campaign.roster;
  const roles = ['commander', 'gunner', 'loader', 'driver', 'radio'];

  const crewCard = (role) => {
    const m = roster.assigned[role];
    if (!m) {
      return `<div class="crew-card empty" data-act="roster-select" data-role="${role}">
        <div class="cc-role">${role.toUpperCase()}</div>
        <div class="cc-empty">SEAT EMPTY — assign a replacement</div>
      </div>`;
    }
    const unavailable = m.state === 'dead' || m.recoveryMissions > 0;
    return `<div class="crew-card ${unavailable ? 'unavailable' : ''} ${selectedRole === role ? 'selected' : ''}"
        data-act="roster-select" data-role="${role}">
      <div class="cc-role">${role.toUpperCase()}</div>
      <div class="cc-name">${m.rank} ${m.name}</div>
      <div class="cc-home">${m.hometown} · ${m.trait.label}</div>
      ${m.retrainedFrom ? `<div class="cc-warn">Trained as ${m.retrainedFrom} — slower in this seat</div>` : ''}
      <div class="cc-stats">
        ${Object.entries(m.skill).map(([k, v]) =>
      `<div class="cc-stat"><span>${k}</span><div class="bar"><i style="width:${pct(v)}"></i></div><span>${pct(v)}</span></div>`).join('')}
      </div>
      <div class="cc-cond">
        <span class="cond ${m.state === 'fit' ? 'good' : m.state === 'dead' ? 'dead' : 'bad'}">${m.state}</span>
        ${m.recoveryMissions > 0 ? `<span class="cond bad">aid post — ${m.recoveryMissions} mission(s)</span>` : ''}
        <span class="cond">fatigue ${pct(m.fatigue)}</span>
        <span class="cond">missions ${m.missions}</span>
        ${m.kills ? `<span class="cond">kills ${m.kills}</span>` : ''}
      </div>
    </div>`;
  };

  const reserveList = roster.reserve.map((m) => `
    <div class="reserve-row ${m.recoveryMissions > 0 ? 'unavailable' : ''}"
         data-act="roster-assign" data-id="${m.id}">
      <div class="rr-name">${m.rank} ${m.name}</div>
      <div class="rr-role">trained ${m.role}</div>
      <div class="rr-exp">exp ${pct(m.experience)}</div>
      <div class="rr-trait">${m.trait.label}</div>
      <div class="rr-state ${m.state === 'fit' ? 'good' : 'bad'}">${m.recoveryMissions > 0 ? `aid post (${m.recoveryMissions})` : m.state}</div>
    </div>`).join('') || '<div class="reserve-empty">The company reserve is exhausted. No replacements are available.</div>';

  const fallen = roster.fallen.length ? `
    <section class="fallen">
      <h2>The fallen</h2>
      ${roster.fallen.map((f) => `<div class="fallen-row">
        <b>${f.rank} ${f.name}</b> of ${f.hometown} — ${f.role}, ${f.missions} missions.
        <span class="fallen-cause">${f.circumstances?.cause || 'killed in action'}${f.circumstances?.date ? `, ${f.circumstances.date}` : ''}</span>
      </div>`).join('')}
    </section>` : '';

  return `<div class="roster">
    <h1>Company roster</h1>
    <div class="roster-sub">${campaign.unit} · ${campaign.date}</div>
    ${selectedRole ? `<div class="roster-hint">Select a replacement for the <b>${selectedRole}</b>, or click the seat again to cancel.</div>` : ''}
    <div class="crew-grid">${roles.map(crewCard).join('')}</div>
    <section class="reserve">
      <h2>Reserve — ${roster.reserve.length} men</h2>
      ${reserveList}
    </section>
    ${fallen}
    <footer><button data-act="roster-close" class="btn btn-primary">Done</button></footer>
  </div>`;
}

// ---------------------------------------------------------------------------
//  FIELD REPAIR SELECTOR
// ---------------------------------------------------------------------------

export function repairHtml(assessment, crewManager, tiger) {
  const rows = assessment.map((a) => {
    const disabled = !a.repairable;
    return `<div class="repair-row ${disabled ? 'disabled' : ''}">
      <div class="rr-head">
        <b>${a.label}</b>
        <span class="rr-state ${a.state === 'destroyed' ? 'bad' : 'warn'}">${a.state}</span>
      </div>
      ${a.note ? `<div class="rr-note">${a.note}</div>` : ''}
      ${a.repairable
    ? `<div class="rr-meta">Estimated ${a.estimateMinutes} min with a trained man ·
         needs ${Object.entries(a.partsNeeded).map(([k, n]) => `${n} ${SPARE_PARTS[k]?.label || k}`).join(', ') || 'tools only'} ·
         best done by ${a.bestCrew.join(' or ')}</div>
       <button class="btn btn-sm" data-act="repair-choose" data-id="${a.id}">Select this repair</button>`
    : `<div class="rr-blocked">${a.reason}</div>`}
    </div>`;
  }).join('') || '<div class="repair-none">Nothing on this tank can be repaired here.</div>';

  return `<div class="repair-screen">
    <h1>Field repair</h1>
    <p class="sub">Repairs happen outside the armour. Choose what to fix, then choose
      who goes out. Every man outside is a man not doing his job, and a man who can be shot.</p>
    ${rows}
    <footer><button data-act="repair-close" class="btn btn-ghost">Cancel</button></footer>
  </div>`;
}

export function repairCrewHtml(component, crewManager, aptitudeFor) {
  const men = crewManager.all().filter((m) => m.canWork && !m.outsideTank);
  const rows = men.map((m) => {
    const apt = aptitudeFor(m.role, component.id);
    const rating = apt > 1.2 ? 'well suited' : apt > 0.95 ? 'competent' : 'not his trade';
    return `<label class="repair-man">
      <input type="checkbox" data-role="${m.role}" ${apt > 1.2 ? 'checked' : ''}>
      <span class="rm-name">${m.rank} ${m.name}</span>
      <span class="rm-role">${m.role}</span>
      <span class="rm-apt apt-${apt > 1.2 ? 'good' : apt > 0.95 ? 'ok' : 'poor'}">${rating}</span>
      <span class="rm-cond">${m.state}${m.fatigue > 0.5 ? ', tired' : ''}${m.stress > 0.5 ? ', shaken' : ''}</span>
      <span class="rm-cost">${consequenceOf(m.role)}</span>
    </label>`;
  }).join('');

  return `<div class="repair-screen">
    <h1>${component.label}</h1>
    <p class="sub">Who goes out? More hands finish sooner, but every one of them is
      outside the armour until it is done.</p>
    ${rows}
    <div class="repair-warning">
      The tank cannot fight properly while these men are outside it.
    </div>
    <footer>
      <button data-act="repair-start" class="btn btn-primary">Send them out</button>
      <button data-act="repair-close" class="btn btn-ghost">Cancel</button>
    </footer>
  </div>`;
}

function consequenceOf(role) {
  return {
    driver: 'the tank cannot move',
    gunner: 'nobody lays the gun',
    loader: 'nobody loads',
    radio: 'no radio',
  }[role] || '';
}

// ---------------------------------------------------------------------------
//  AFTER-ACTION REPORT
// ---------------------------------------------------------------------------

export function afterActionHtml(report, campaign) {
  const crewRows = report.crew.map((c) => `
    <tr class="${c.outcome === 'KILLED' ? 'killed' : /wounded/.test(c.outcome) ? 'wounded' : ''}">
      <td>${c.role}</td>
      <td>${c.rank ? c.rank + ' ' : ''}${c.name}</td>
      <td class="outcome">${c.outcome}</td>
      <td>${c.recoveryMissions ? `unavailable for ${c.recoveryMissions} mission(s)` : ''}</td>
    </tr>`).join('');

  const xp = (report.experience || []).map((e) =>
    `<li>${e.name} — ${e.role}: experience ${pct(e.now)} <span class="gain">(+${(e.gained * 100).toFixed(1)})</span></li>`).join('');

  return `<div class="aar">
    <h1>${report.objectiveMet ? 'Mission accomplished' : 'Mission ended'}</h1>
    <div class="aar-sub">${report.title} · ${report.date}</div>

    <section>
      <h2>${campaign.tank.callsign}</h2>
      <div class="aar-tank ${/lost|destroy|abandon|captur/i.test(report.tank.status) ? 'bad' : ''}">
        <div><span>Status</span><b>${(report.tank.status || '').toUpperCase()}</b></div>
        ${report.tank.cause ? `<div><span>Cause</span><b>${report.tank.cause}</b></div>` : ''}
        ${report.tank.recovery ? `<div><span>Recovery</span><b>${report.tank.recovery}</b></div>` : ''}
        ${report.tank.availability ? `<div><span>Availability</span><b>${report.tank.availability}</b></div>` : ''}
        ${report.tank.evacuationSeconds !== undefined
    ? `<div><span>Evacuation</span><b>${report.tank.evacuationSeconds.toFixed(0)} seconds</b></div>` : ''}
      </div>
    </section>

    <section>
      <h2>Crew</h2>
      <table class="aar-crew"><tbody>${crewRows}</tbody></table>
    </section>

    ${xp ? `<section><h2>Experience</h2><ul class="aar-xp">${xp}</ul></section>` : ''}

    ${report.notes?.length ? `<section><h2>Notes</h2><ul class="aar-notes">${report.notes.map((n) => `<li>${n}</li>`).join('')}</ul></section>` : ''}

    ${report.supply?.length ? `<section><h2>Supply</h2><ul class="aar-supply">
      ${report.supply.map((s) => `<li class="sev-${s.severity}">${s.text}</li>`).join('')}</ul></section>` : ''}

    ${report.rosterNotes?.length ? `<section><h2>Personnel</h2><ul>${report.rosterNotes.map((n) => `<li>${n}</li>`).join('')}</ul></section>` : ''}
    ${report.autoFill?.length ? `<section><h2>Replacements</h2><ul>${report.autoFill.map((n) => `<li class="sev-${n.severity}">${n.text}</li>`).join('')}</ul></section>` : ''}

    <section class="aar-stats">
      <h2>Campaign to date</h2>
      <div class="stat-grid">
        <div><b>${campaign.stats.missionsFlown}</b><span>missions</span></div>
        <div><b>${campaign.stats.sovietVehiclesDestroyed}</b><span>vehicles destroyed</span></div>
        <div><b>${campaign.stats.gunsDestroyed}</b><span>guns destroyed</span></div>
        <div><b>${campaign.stats.roundsFired}</b><span>rounds fired</span></div>
        <div><b>${campaign.stats.hitsTaken}</b><span>hits taken</span></div>
        <div><b>${campaign.stats.penetrationsTaken}</b><span>penetrations</span></div>
        <div><b>${campaign.stats.crewKilled}</b><span>crew killed</span></div>
        <div><b>${campaign.stats.tigersLost}</b><span>Tigers lost</span></div>
        <div><b>${campaign.stats.timesAbandoned}</b><span>times abandoned</span></div>
        <div><b>${campaign.stats.repairsCompleted}</b><span>field repairs</span></div>
      </div>
    </section>

    <footer>
      <button data-act="aar-continue" class="btn btn-primary">Continue the campaign</button>
      <button data-act="aar-record" class="btn">Campaign record</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
//  COMMANDER'S MAP
// ---------------------------------------------------------------------------

export function mapHtml() {
  return `<div class="map-screen">
    <h1>Commander's map</h1>
    <canvas id="map-canvas"></canvas>
    <div class="map-legend">
      <span class="lg lg-you">▲ you</span>
      <span class="lg lg-friend">■ friendly</span>
      <span class="lg lg-contact">● contact</span>
      <span class="lg lg-stale">○ stale contact</span>
      <span class="lg lg-obj">◆ objective</span>
    </div>
    <div class="map-note">Enemy positions appear only where something has actually been
      seen or reported, and they go stale. There is no overhead view of the battlefield.</div>
    <footer><button data-act="map-close" class="btn btn-primary">Close</button></footer>
  </div>`;
}

/** Draw the map from what the player actually knows. */
export function drawMap(canvas, { terrain, tiger, contacts, friendlies, objectives, time }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
  const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
  const size = terrain.size;
  const toX = (x) => ((x + terrain.half) / size) * w;
  const toY = (z) => ((z + terrain.half) / size) * h;

  ctx.fillStyle = '#d8cfae';
  ctx.fillRect(0, 0, w, h);

  // Contours, roughly.
  ctx.strokeStyle = 'rgba(120,100,70,0.45)';
  ctx.lineWidth = 1;
  const step = 26;
  for (let lvl = -10; lvl <= 16; lvl += 4) {
    ctx.beginPath();
    for (let j = 0; j < h; j += step) {
      for (let i = 0; i < w; i += step) {
        const wx = (i / w) * size - terrain.half;
        const wz = (j / h) * size - terrain.half;
        const hh = terrain.heightAt(wx, wz);
        if (Math.abs(hh - lvl) < 0.8) { ctx.moveTo(i, j); ctx.lineTo(i + 2, j); }
      }
    }
    ctx.stroke();
  }

  // Woods and villages.
  for (const wd of terrain.woods) {
    ctx.fillStyle = 'rgba(60,90,45,0.45)';
    ctx.beginPath();
    if (wd.type === 'copse') ctx.arc(toX(wd.x), toY(wd.z), (wd.radius / size) * w, 0, 7);
    else {
      const lx = (wd.length / size) * w, lz = (wd.width / size) * h;
      ctx.save(); ctx.translate(toX(wd.x), toY(wd.z)); ctx.rotate(wd.dir);
      ctx.rect(-lx, -lz, lx * 2, lz * 2); ctx.restore();
    }
    ctx.fill();
  }
  for (const v of terrain.villages) {
    ctx.fillStyle = 'rgba(140,110,80,0.6)';
    ctx.beginPath(); ctx.arc(toX(v.x), toY(v.z), (v.radius / size) * w, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2f22'; ctx.font = `${11 * (window.devicePixelRatio || 1)}px serif`;
    ctx.fillText(v.name, toX(v.x) + 6, toY(v.z));
  }
  // Roads.
  ctx.strokeStyle = 'rgba(110,90,60,0.8)'; ctx.lineWidth = 2;
  for (const r of terrain.roads) {
    ctx.beginPath(); ctx.moveTo(toX(r.ax), toY(r.az)); ctx.lineTo(toX(r.bx), toY(r.bz)); ctx.stroke();
  }
  // Named heights.
  ctx.fillStyle = '#4a3a24'; ctx.font = `${10 * (window.devicePixelRatio || 1)}px serif`;
  for (const f of terrain.features) {
    if (f.type !== 'ridge') continue;
    ctx.fillText(f.name, toX(f.x), toY(f.z));
  }

  // Grid.
  ctx.strokeStyle = 'rgba(60,50,35,0.30)'; ctx.lineWidth = 1;
  const gridN = Math.round(size / 500);
  for (let i = 1; i < gridN; i++) {
    ctx.beginPath();
    ctx.moveTo((i / gridN) * w, 0); ctx.lineTo((i / gridN) * w, h);
    ctx.moveTo(0, (i / gridN) * h); ctx.lineTo(w, (i / gridN) * h);
    ctx.stroke();
  }

  // Objectives.
  for (const o of objectives || []) {
    ctx.fillStyle = '#b08830';
    ctx.beginPath();
    ctx.moveTo(toX(o.x), toY(o.z) - 7);
    ctx.lineTo(toX(o.x) + 7, toY(o.z));
    ctx.lineTo(toX(o.x), toY(o.z) + 7);
    ctx.lineTo(toX(o.x) - 7, toY(o.z));
    ctx.fill();
  }

  // Friendlies.
  for (const f of friendlies || []) {
    ctx.fillStyle = '#2a5a9a';
    ctx.fillRect(toX(f.pos.x) - 4, toY(f.pos.z) - 4, 8, 8);
  }

  // Contacts. Only what is known, and stale ones are hollow.
  for (const c of contacts || []) {
    const age = time - c.lastSeen;
    const stale = age > 8;
    ctx.strokeStyle = '#9a2a2a';
    ctx.fillStyle = stale ? 'transparent' : '#9a2a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(c.lastKnownPos.x), toY(c.lastKnownPos.z), 5, 0, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a1a1a';
    ctx.font = `${10 * (window.devicePixelRatio || 1)}px serif`;
    ctx.fillText(c.label, toX(c.lastKnownPos.x) + 8, toY(c.lastKnownPos.z) + 3);
    if (stale) {
      ctx.fillText(`${Math.round(age)}s ago`, toX(c.lastKnownPos.x) + 8, toY(c.lastKnownPos.z) + 15);
    }
  }

  // You.
  if (tiger) {
    const x = toX(tiger.pos.x), y = toY(tiger.pos.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tiger.heading);
    ctx.fillStyle = '#1a3a6a';
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1a3a6a';
    ctx.font = `${11 * (window.devicePixelRatio || 1)}px serif`;
    ctx.fillText(formatGrid(tiger.pos.x, tiger.pos.z), x + 10, y - 8);
  }
}

// ---------------------------------------------------------------------------
//  SETTINGS
// ---------------------------------------------------------------------------

export function settingsHtml(state) {
  const { difficulty, quality, bindings, audioDesc, volume, inputMode } = state;

  const diffCards = Object.values(DIFFICULTY).map((d) => `
    <button class="diff-card ${difficulty.id === d.id ? 'selected' : ''}" data-act="set-difficulty" data-id="${d.id}">
      <b>${d.label}</b>
      <span>${d.description}</span>
    </button>`).join('');

  const custom = CUSTOM_OPTIONS.map((o) => {
    const v = difficulty[o.key];
    if (o.type === 'bool') {
      return `<label class="opt"><span>${o.label}</span>
        <input type="checkbox" data-act="custom-bool" data-key="${o.key}" ${v ? 'checked' : ''}></label>`;
    }
    return `<label class="opt"><span>${o.label}</span>
      <input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}"
             data-act="custom-range" data-key="${o.key}">
      <em>${typeof v === 'number' ? v.toFixed(2) : v}</em></label>`;
  }).join('');

  const qualityBtns = Object.entries(QUALITY).map(([k, q]) => `
    <button class="btn ${quality === k ? 'btn-primary' : ''}" data-act="set-quality" data-id="${k}">${q.label}</button>`).join('');

  const binds = Object.entries(bindings).map(([action, codes]) => `
    <div class="bind-row">
      <span>${BINDING_LABELS[action] || action}</span>
      <button class="btn-sm" data-act="rebind" data-action="${action}">${keyLabel(codes[0])}</button>
    </div>`).join('');

  return `<div class="settings">
    <h1>Settings</h1>

    <section>
      <h2>Difficulty</h2>
      <div class="diff-grid">${diffCards}</div>
      <div class="armour-guarantee">${ARMOUR_GUARANTEE}</div>
      <details class="custom-diff">
        <summary>Custom difficulty — every setting independently</summary>
        <div class="custom-grid">${custom}</div>
      </details>
    </section>

    <section>
      <h2>Graphics</h2>
      <div class="btn-row">${qualityBtns}</div>
      <label class="opt"><span>Dynamic resolution</span>
        <input type="checkbox" data-act="toggle-dynres" checked></label>
      <p class="hint">Quality settings change how the game LOOKS. They never change the
        simulation: the armour, the ballistics, the crew and the campaign are identical
        on every setting and on every device.</p>
    </section>

    <section>
      <h2>Sound</h2>
      <label class="opt"><span>Volume</span>
        <input type="range" min="0" max="1" step="0.05" value="${volume}" data-act="set-volume"></label>
      <div class="audio-state">
        <b>Currently: ${audioDesc.label}</b>
        <p>${audioDesc.description}</p>
      </div>
    </section>

    <section>
      <h2>Controls — ${inputMode === 'touch' ? 'touch' : 'keyboard and mouse'}</h2>
      ${inputMode === 'touch'
    ? `<p class="hint">Left half of the screen is the thumbstick — it appears wherever you
         put your thumb. Right half looks around; a tap on the right designates a target.
         Contextual buttons appear only when they apply.</p>`
    : `<div class="binds">${binds}</div>
       <button class="btn btn-ghost" data-act="reset-binds">Reset to defaults</button>`}
    </section>

    <footer>
      <button data-act="settings-close" class="btn btn-primary">Close</button>
    </footer>
  </div>`;
}

// ---------------------------------------------------------------------------
//  CAMPAIGN RECORD
// ---------------------------------------------------------------------------

export function campaignRecordHtml(rec) {
  return `<div class="record">
    <h1>${rec.name}</h1>
    <div class="rec-sub">${rec.unit} · ${rec.date} · ${rec.difficulty}</div>

    <section class="rec-tank">
      <h2>${rec.tank.callsign} — turret number ${rec.tank.turmNummer}</h2>
      <div class="rec-status ${/lost|destroy|abandon|captur/i.test(rec.tank.status) ? 'bad' : 'good'}">
        STATUS: ${rec.tank.status.toUpperCase()}
      </div>
      ${rec.tank.repairDescription ? `<div>Repair: ${rec.tank.repairDescription} — ${rec.tank.repairMissionsRemaining} mission(s)</div>` : ''}
      ${rec.tank.recoveryStatus ? `<div>Recovery: ${rec.tank.recoveryStatus}</div>` : ''}
      <div>${rec.tank.missions} missions · ${rec.tank.kills} kills · ${rec.tank.distanceKm} km</div>
    </section>

    <section>
      <h2>Crew</h2>
      ${Object.entries(rec.crew.assigned).map(([role, m]) => m
    ? `<div class="rec-crew"><b>${role}</b> ${m.rank} ${m.name} — ${m.state}, exp ${pct(m.experience)}, ${m.missions} missions${m.kills ? `, ${m.kills} kills` : ''}</div>`
    : `<div class="rec-crew bad"><b>${role}</b> — seat empty</div>`).join('')}
    </section>

    ${rec.fallen.length ? `<section><h2>The fallen</h2>
      ${rec.fallen.map((f) => `<div class="rec-fallen">${f.rank} ${f.name} of ${f.hometown} — ${f.role}, ${f.missions} missions. ${f.circumstances?.cause || ''}</div>`).join('')}
    </section>` : ''}

    <section>
      <h2>Missions</h2>
      ${rec.missions.map((m, i) => `<div class="rec-mission">
        <b>${i + 1}. ${m.title}</b> — ${m.date} — ${m.objectiveMet ? 'accomplished' : 'not accomplished'} — tank: ${m.tank}
        ${m.notes?.length ? `<ul>${m.notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      </div>`).join('') || '<div>No missions completed yet.</div>'}
    </section>

    <footer><button data-act="record-close" class="btn btn-primary">Close</button></footer>
  </div>`;
}
