// ===========================================================================
//  THE STAGING AREA / FIELD WORKSHOP
//
//  A working armoured unit's rear area at first light: the Tiger with its crew
//  around it doing specific jobs, other vehicles, an ammunition dump, fuel
//  drums, a recovery half-track, mechanics with a hoist, and the ordinary
//  clutter of a company that has been in the field for a week.
//
//  It should look like somewhere people work, not a menu.
// ===========================================================================

import * as THREE from 'three';
import { M } from '../render/Materials.js';
import { buildTiger } from '../render/TigerModel.js';
import { buildVehicleModel } from '../render/VehicleModels.js';
import { buildFigure, poseFigure, STAGING_BEHAVIOURS } from '../render/CrewModels.js';
import {
  buildAmmoCrate, buildFuelDrum, buildJerrycan, buildTrackStack,
  buildSpareRoadWheel, buildTree, buildSignalPole, buildIzba,
} from './Props.js';

const DEG = Math.PI / 180;

function box(w, h, d, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtl);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, seg, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mtl);
  m.position.set(x, y, z);
  return m;
}

/** A workshop gantry: sheerlegs and a chain hoist for lifting a Tiger's turret. */
function buildHoist() {
  const g = new THREE.Group();
  const beam = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.8, metalness: 0.4 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.09, 0.11, 5.2, 6, beam, sx * 2.4, 2.6, sz * 1.6);
      leg.rotation.z = sx * -8 * DEG;
      leg.rotation.x = sz * -6 * DEG;
      g.add(leg);
    }
  }
  g.add(box(5.4, 0.16, 0.16, beam, 0, 5.1, -1.4));
  g.add(box(5.4, 0.16, 0.16, beam, 0, 5.1, 1.4));
  g.add(box(0.30, 0.30, 3.2, beam, 0, 5.28, 0));
  // Chain and hook.
  g.add(cyl(0.02, 0.02, 2.4, 4, M.darkSteel(), 0.6, 4.0, 0));
  g.add(box(0.14, 0.22, 0.10, M.darkSteel(), 0.6, 2.75, 0));
  return g;
}

/** Camouflage netting on poles over a parked vehicle. */
function buildCamoNet(w, d) {
  const g = new THREE.Group();
  const net = new THREE.MeshStandardMaterial({
    color: 0x5f6a44, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.72,
  });
  g.add(box(w, 0.04, d, net, 0, 3.4, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(cyl(0.05, 0.05, 3.4, 5, M.wood(), sx * w / 2 * 0.9, 1.7, sz * d / 2 * 0.9));
  }
  return g;
}

/**
 * @param {object} opts
 *   { rng, terrain, campaign, crew, lod, tigerTurmNummer, includeRecovery }
 */
export function buildStagingArea(opts = {}) {
  const { rng, terrain, lod = 0 } = opts;
  const g = new THREE.Group();
  g.name = 'staging_area';

  // ---- Ground: a hard-standing beaten flat by tracks ----------------------
  const pad = new THREE.Mesh(new THREE.CircleGeometry(46, 28),
    new THREE.MeshStandardMaterial({ color: 0x4d4130, roughness: 1 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  pad.receiveShadow = true;
  g.add(pad);

  // Track ruts across it.
  for (let i = 0; i < 6; i++) {
    const rut = box(0.9, 0.02, 60, new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 1 }),
      -18 + i * 7 + rng.range(-2, 2), 0.03, rng.range(-6, 6));
    rut.rotation.y = rng.range(-0.25, 0.25);
    g.add(rut);
  }

  // ---- THE TIGER ----------------------------------------------------------
  const tiger = buildTiger({ lod, feifel: true });
  tiger.position.set(0, 0, 0);
  tiger.rotation.y = -12 * DEG;
  g.add(tiger);
  g.userData.tigerModel = tiger;

  // Camouflage netting over it, half rolled back for the morning.
  if (lod === 0) {
    const net = buildCamoNet(7, 10);
    net.position.set(0, 0, -1);
    g.add(net);
  }

  // ---- The crew, each doing a specific job --------------------------------
  const crewFigures = {};
  const roles = ['driver', 'gunner', 'loader', 'radio'];
  for (const role of roles) {
    const fig = buildFigure({ kit: 'panzer' });
    const behaviours = STAGING_BEHAVIOURS[role];
    const b = behaviours[0];
    fig.position.set(b.at[0], 0, b.at[2]);
    fig.rotation.y = rng.range(0, Math.PI * 2);
    fig.userData.baseY = 0;
    fig.userData.role = role;
    fig.userData.behaviours = behaviours;
    fig.userData.behaviourIndex = 0;
    fig.userData.behaviourTimer = b.duration * rng.range(0.3, 1.0);
    fig.userData.currentLabel = b.label;
    g.add(fig);
    crewFigures[role] = fig;
  }
  g.userData.crewFigures = crewFigures;

  // ---- Ammunition dump ----------------------------------------------------
  const dump = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const c = buildAmmoCrate(rng);
    c.position.set(
      12 + (i % 4) * 1.1,
      Math.floor(i / 8) * 0.38,
      -4 + Math.floor((i % 8) / 4) * 0.55 + rng.range(-0.1, 0.1));
    c.rotation.y = rng.range(-0.1, 0.1);
    dump.add(c);
  }
  // A tarpaulin over half of it.
  dump.add(box(5.2, 0.05, 2.4, M.canvas(), 13.5, 0.82, -3.7));
  g.add(dump);
  g.userData.ammoDump = dump;

  // ---- Fuel point ---------------------------------------------------------
  const fuel = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const d = buildFuelDrum(rng);
    d.position.set(-14 - (i % 3) * 0.75, 0, 4 + Math.floor(i / 3) * 0.75);
    fuel.add(d);
  }
  for (let i = 0; i < 14; i++) {
    const j = buildJerrycan();
    j.position.set(-11 + (i % 7) * 0.22, 0, 6.5 + Math.floor(i / 7) * 0.4);
    fuel.add(j);
  }
  g.add(fuel);
  g.userData.fuelPoint = fuel;

  // ---- Spares and the workshop -------------------------------------------
  const workshop = new THREE.Group();
  const hoist = buildHoist();
  hoist.position.set(-16, 0, -10);
  workshop.add(hoist);

  for (let i = 0; i < 3; i++) {
    const st = buildTrackStack(rng.int(4, 9));
    st.position.set(-13 + i * 1.4, 0, -6);
    st.rotation.y = rng.range(-0.2, 0.2);
    workshop.add(st);
  }
  for (let i = 0; i < 4; i++) {
    const w = buildSpareRoadWheel();
    w.position.set(-19 + i * 1.0, 0, -6.5);
    w.rotation.y = rng.range(0, 1);
    workshop.add(w);
  }
  // Work bench with tools.
  workshop.add(box(2.6, 0.08, 0.8, M.wood(), -18, 0.85, -13));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    workshop.add(box(0.08, 0.85, 0.08, M.wood(), -18 + x * 1.2, 0.42, -13 + z * 0.32));
  }
  for (let i = 0; i < 5; i++) {
    workshop.add(box(0.06, 0.06, 0.3, M.steel(), -19 + i * 0.4, 0.92, -13));
  }
  g.add(workshop);
  g.userData.workshop = workshop;

  // Mechanics, working.
  const mechanics = [];
  for (let i = 0; i < 3; i++) {
    const m = buildFigure({ kit: 'workshop' });
    m.position.set(-17 + i * 2.2, 0, -11 + rng.range(-1.5, 1.5));
    m.rotation.y = rng.range(0, Math.PI * 2);
    m.userData.baseY = 0;
    m.userData.pose = i === 0 ? 'work' : i === 1 ? 'kneel' : 'idle';
    g.add(m);
    mechanics.push(m);
  }
  g.userData.mechanics = mechanics;

  // ---- Other vehicles -----------------------------------------------------
  const vehicles = [];
  const parked = [
    { id: 'pz4h', x: 14, z: 10, ry: -95 },
    { id: 'pz4h', x: 14, z: 17, ry: -95 },
    { id: 'stug3g', x: -14, z: 14, ry: 88 },
    { id: 'sdkfz251', x: 5, z: 20, ry: 170 },
    { id: 'opel_blitz', x: -5, z: 21, ry: 178 },
    { id: 'opel_blitz', x: -9, z: 21, ry: 175 },
  ];
  if (opts.includeRecovery !== false) parked.push({ id: 'famo', x: 20, z: -8, ry: -60 });

  for (const p of parked) {
    const m = buildVehicleModel(p.id, lod === 0 ? 1 : 2);
    m.position.set(p.x, 0, p.z);
    m.rotation.y = p.ry * DEG;
    g.add(m);
    vehicles.push(m);
  }
  g.userData.vehicles = vehicles;

  // ---- Soldiers going about their business --------------------------------
  const soldiers = [];
  for (let i = 0; i < 8; i++) {
    const s = buildFigure({ kit: rng.bool(0.4) ? 'panzer' : 'infantry' });
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(8, 26);
    s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    s.rotation.y = rng.range(0, Math.PI * 2);
    s.userData.baseY = 0;
    s.userData.pose = rng.pick(['idle', 'idle', 'walk', 'kneel', 'carry']);
    s.userData.wanderTarget = null;
    g.add(s);
    soldiers.push(s);
  }
  g.userData.soldiers = soldiers;

  // ---- Surroundings -------------------------------------------------------
  for (let i = 0; i < 14; i++) {
    const t = buildTree(rng, lod === 0 ? 0 : 1);
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(38, 62);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(t);
  }
  for (let i = 0; i < 3; i++) {
    const p = buildSignalPole();
    p.position.set(-30 + i * 22, 0, -34);
    g.add(p);
  }
  // A couple of izbas at the edge — the company is billeted in a village.
  for (let i = 0; i < 2; i++) {
    const h = buildIzba(rng, lod === 0 ? 0 : 1);
    h.position.set(-34 + i * 16, 0, 34);
    h.rotation.y = rng.range(-0.4, 0.4);
    g.add(h);
  }

  // ---- Interaction points -------------------------------------------------
  g.userData.interactions = [
    { id: 'inspect_tiger', label: 'Inspect the Tiger', pos: new THREE.Vector3(-3.6, 1.5, 0), radius: 3.0 },
    { id: 'climb_on', label: 'Climb onto the Tiger', pos: new THREE.Vector3(-2.2, 1.0, 1.4), radius: 2.4, action: 'climb' },
    { id: 'ammo_load', label: 'Check the ammunition load', pos: new THREE.Vector3(13.5, 1.0, -4), radius: 3.5 },
    { id: 'fuel', label: 'Check fuel state', pos: new THREE.Vector3(-14, 1.0, 5), radius: 3.5 },
    { id: 'spares', label: 'Check spare parts', pos: new THREE.Vector3(-13, 1.0, -6), radius: 3.5 },
    { id: 'crew_driver', label: 'Speak to the driver', pos: new THREE.Vector3(-1.7, 1.2, 1.2), radius: 2.0, crew: 'driver' },
    { id: 'crew_gunner', label: 'Speak to the gunner', pos: new THREE.Vector3(0.4, 1.2, 5.0), radius: 2.0, crew: 'gunner' },
    { id: 'crew_loader', label: 'Speak to the loader', pos: new THREE.Vector3(2.6, 1.2, -0.5), radius: 2.0, crew: 'loader' },
    { id: 'crew_radio', label: 'Speak to the radio operator', pos: new THREE.Vector3(1.6, 1.2, 3.4), radius: 2.0, crew: 'radio' },
    { id: 'roster', label: 'Company roster', pos: new THREE.Vector3(-18, 1.2, -13), radius: 3.0 },
    { id: 'mount_up', label: 'Mount up — move out', pos: new THREE.Vector3(0, 1.2, -8), radius: 3.0, action: 'start' },
  ];

  return g;
}

/**
 * Animate the staging area. Crew cycle through their specific jobs; soldiers
 * wander; mechanics work. Nobody stands still.
 */
export function updateStagingArea(area, dt, t, rng) {
  const u = area.userData;

  for (const [role, fig] of Object.entries(u.crewFigures || {})) {
    fig.userData.behaviourTimer -= dt;
    if (fig.userData.behaviourTimer <= 0) {
      const list = fig.userData.behaviours;
      fig.userData.behaviourIndex = (fig.userData.behaviourIndex + 1) % list.length;
      const b = list[fig.userData.behaviourIndex];
      fig.userData.behaviourTimer = b.duration;
      fig.userData.currentLabel = b.label;
      fig.userData.moveTo = new THREE.Vector3(b.at[0], 0, b.at[2]);
      fig.userData.targetPose = b.pose;
    }

    // Walk to the next job, then do it.
    const target = fig.userData.moveTo;
    if (target) {
      const d = target.clone().sub(fig.position);
      d.y = 0;
      const dist = d.length();
      if (dist > 0.4) {
        d.normalize();
        fig.position.addScaledVector(d, 1.3 * dt);
        fig.rotation.y = Math.atan2(d.x, d.z);
        poseFigure(fig, 'walk', dt);
        continue;
      }
      fig.userData.moveTo = null;
    }
    poseFigure(fig, fig.userData.targetPose || 'idle', dt);
  }

  for (const m of u.mechanics || []) poseFigure(m, m.userData.pose, dt);

  for (const s of u.soldiers || []) {
    if (s.userData.pose === 'walk') {
      if (!s.userData.wanderTarget || s.position.distanceTo(s.userData.wanderTarget) < 1.0) {
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 20;
        s.userData.wanderTarget = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      const d = s.userData.wanderTarget.clone().sub(s.position);
      d.y = 0; d.normalize();
      s.position.addScaledVector(d, 1.1 * dt);
      s.rotation.y = Math.atan2(d.x, d.z);
    }
    poseFigure(s, s.userData.pose, dt);
  }
}

/** What the crew are actually doing, for the contextual prompt text. */
export function crewActivity(area, role) {
  return area.userData.crewFigures?.[role]?.userData.currentLabel || null;
}
