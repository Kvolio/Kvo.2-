// Crew and infantry figures. Deliberately simple in geometry but correct in
// behaviour: a man walking to a damaged track carries tools, kneels beside it
// and works; a man abandoning a burning tank runs bent over.
//
// Panzer crews wore the black Sonderbekleidung with a field cap; the workshop
// and logistics people wore field grey or reed-green drill.

import * as THREE from 'three';
import { M } from './Materials.js';

const DEG = Math.PI / 180;

function box(w, h, d, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtl);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const KIT = {
  panzer: () => M.panzerBlack(),
  infantry: () => M.uniform(),
  workshop: () => M.cloth(),
};

/**
 * @param {object} opts { kit, headOnly, lod }
 */
export function buildFigure(opts = {}) {
  const kit = KIT[opts.kit || 'panzer']();
  const skin = M.skin();
  const g = new THREE.Group();
  g.name = 'figure';

  // Head and cap — the black Feldmütze with its Totenkopf for Panzer crews.
  const head = new THREE.Group();
  head.add(box(0.17, 0.21, 0.19, skin, 0, 0.09, 0));
  head.add(box(0.19, 0.06, 0.21, kit, 0, 0.22, 0));
  head.position.set(0, 1.52, 0);
  g.add(head);
  g.userData.head = head;

  if (opts.headOnly) {
    // Just a head and shoulders, for a commander sticking out of a hatch.
    g.add(box(0.44, 0.24, 0.24, kit, 0, 1.34, 0));
    // Headset and throat mic.
    g.add(box(0.20, 0.05, 0.05, M.darkSteel(), 0, 1.58, 0));
    return g;
  }

  // Torso.
  const torso = box(0.42, 0.54, 0.24, kit, 0, 1.12, 0);
  g.add(torso);
  g.userData.torso = torso;

  // Arms.
  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.25, 1.34, 0);
    const upper = box(0.11, 0.30, 0.12, kit, 0, -0.15, 0);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.30, 0);
    elbow.add(box(0.10, 0.28, 0.11, kit, 0, -0.14, 0));
    elbow.add(box(0.09, 0.10, 0.09, skin, 0, -0.30, 0));
    shoulder.add(elbow);
    shoulder.userData.elbow = elbow;
    g.add(shoulder);
    arms.push(shoulder);
  }
  g.userData.arms = arms;

  // Legs.
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.11, 0.86, 0);
    hip.add(box(0.15, 0.42, 0.16, kit, 0, -0.21, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    knee.add(box(0.13, 0.40, 0.14, kit, 0, -0.20, 0));
    knee.add(box(0.14, 0.09, 0.26, M.darkSteel(), 0, -0.42, 0.04));   // boot
    hip.add(knee);
    hip.userData.knee = knee;
    g.add(hip);
    legs.push(hip);
  }
  g.userData.legs = legs;

  g.userData.phase = Math.random() * 10;
  g.userData.pose = 'idle';
  return g;
}

/** Tools a repair party carries: a track pin, a hammer, a crowbar. */
export function buildToolbox() {
  const g = new THREE.Group();
  g.add(box(0.30, 0.18, 0.20, M.darkSteel()));
  g.add(box(0.05, 0.05, 0.55, M.steel(), 0, 0.12, 0));
  return g;
}

/**
 * Pose and animate a figure.
 * @param {THREE.Group} fig
 * @param {string} pose  idle | walk | run | work | kneel | climb | prone | carry
 */
export function poseFigure(fig, pose, dt, speed = 1) {
  const u = fig.userData;
  if (!u.arms) return;
  u.phase += dt * (pose === 'run' ? 9 : pose === 'walk' ? 5 : 2.2) * speed;
  const s = Math.sin(u.phase);
  const c = Math.cos(u.phase);
  u.pose = pose;

  const set = (grp, x, ex = 0) => { grp.rotation.x = x; if (grp.userData.elbow) grp.userData.elbow.rotation.x = ex; if (grp.userData.knee) grp.userData.knee.rotation.x = ex; };

  switch (pose) {
    case 'walk':
      set(u.arms[0], s * 0.55, -0.25);
      set(u.arms[1], -s * 0.55, -0.25);
      set(u.legs[0], -s * 0.55, Math.max(0, s) * 0.5);
      set(u.legs[1], s * 0.55, Math.max(0, -s) * 0.5);
      fig.position.y = (fig.userData.baseY ?? 0) + Math.abs(c) * 0.03;
      fig.rotation.z = 0;
      break;
    case 'run':
      set(u.arms[0], s * 1.0, -1.0);
      set(u.arms[1], -s * 1.0, -1.0);
      set(u.legs[0], -s * 0.9, Math.max(0, s) * 1.1);
      set(u.legs[1], s * 0.9, Math.max(0, -s) * 1.1);
      // Running under fire, bent forward.
      if (u.torso) u.torso.rotation.x = 0.30;
      fig.position.y = (fig.userData.baseY ?? 0) + Math.abs(c) * 0.05;
      break;
    case 'work':
      // Kneeling and hammering at something on the ground.
      set(u.legs[0], -1.5, 1.5);
      set(u.legs[1], -1.5, 1.5);
      set(u.arms[0], -1.1 + s * 0.55, -0.6);
      set(u.arms[1], -1.1 - s * 0.35, -0.5);
      if (u.torso) u.torso.rotation.x = 0.45;
      fig.position.y = (fig.userData.baseY ?? 0) - 0.42;
      break;
    case 'kneel':
      set(u.legs[0], -1.5, 1.5);
      set(u.legs[1], -0.8, 1.2);
      set(u.arms[0], -0.4, -0.5);
      set(u.arms[1], -0.4, -0.5);
      fig.position.y = (fig.userData.baseY ?? 0) - 0.35;
      break;
    case 'climb':
      set(u.arms[0], -2.4 + s * 0.3, -0.4);
      set(u.arms[1], -2.4 - s * 0.3, -0.4);
      set(u.legs[0], -0.5 + s * 0.4, 0.9);
      set(u.legs[1], -0.5 - s * 0.4, 0.9);
      break;
    case 'carry':
      set(u.arms[0], -0.9, -1.3);
      set(u.arms[1], -0.9, -1.3);
      set(u.legs[0], -s * 0.4, Math.max(0, s) * 0.4);
      set(u.legs[1], s * 0.4, Math.max(0, -s) * 0.4);
      break;
    case 'prone':
      fig.rotation.x = -Math.PI / 2 + 0.1;
      fig.position.y = (fig.userData.baseY ?? 0) - 1.15;
      break;
    case 'wounded':
      set(u.legs[0], -1.4, 1.4);
      set(u.legs[1], -1.4, 1.4);
      set(u.arms[0], -0.2 + Math.sin(u.phase * 0.4) * 0.1, -0.9);
      set(u.arms[1], 0.2, -1.4);
      if (u.torso) u.torso.rotation.x = 0.6;
      fig.position.y = (fig.userData.baseY ?? 0) - 0.55;
      break;
    case 'idle':
    default:
      // Small idle motion so nobody stands like a shop mannequin.
      set(u.arms[0], Math.sin(u.phase * 0.3) * 0.06, -0.15);
      set(u.arms[1], Math.sin(u.phase * 0.3 + 1) * 0.06, -0.15);
      set(u.legs[0], 0, 0);
      set(u.legs[1], 0, 0);
      if (u.torso) u.torso.rotation.x = Math.sin(u.phase * 0.22) * 0.02;
      if (u.head) u.head.rotation.y = Math.sin(u.phase * 0.17) * 0.35;
      fig.position.y = fig.userData.baseY ?? 0;
      break;
  }
}

/**
 * Idle behaviours for the staging area. These are the specific things a Tiger
 * crew does to its tank before an action, not generic milling about.
 */
export const STAGING_BEHAVIOURS = {
  driver: [
    { pose: 'kneel', label: 'inspecting the track tension', at: [-1.7, 0, 1.2], duration: 22 },
    { pose: 'work', label: 'checking the front road wheels', at: [-1.8, 0, 2.0], duration: 18 },
    { pose: 'climb', label: 'getting into the driver’s hatch', at: [-1.2, 0, 2.4], duration: 12 },
    { pose: 'idle', label: 'talking to the radio operator', at: [-0.6, 0, 3.6], duration: 16 },
  ],
  gunner: [
    { pose: 'idle', label: 'sighting along the barrel', at: [0.4, 0, 5.0], duration: 20 },
    { pose: 'climb', label: 'checking the mantlet', at: [0.9, 0, 2.0], duration: 14 },
    { pose: 'work', label: 'cleaning the sight', at: [-1.0, 0, 1.4], duration: 24 },
  ],
  loader: [
    { pose: 'carry', label: 'carrying a round to the tank', at: [2.6, 0, -0.5], duration: 26 },
    { pose: 'kneel', label: 'counting the ammunition crates', at: [3.2, 0, -1.4], duration: 20 },
    { pose: 'climb', label: 'passing rounds up through the loader’s hatch', at: [1.6, 0, 0.4], duration: 22 },
  ],
  radio: [
    { pose: 'idle', label: 'on the radio to battalion', at: [1.6, 0, 3.4], duration: 24 },
    { pose: 'work', label: 'checking the hull machine gun', at: [1.4, 0, 3.2], duration: 18 },
    { pose: 'kneel', label: 'stowing belt bags', at: [2.0, 0, 2.6], duration: 16 },
  ],
};
