// Models for everything that is not the Tiger. Built to the same dimensions as
// their data entries so that what you shoot at is the shape you are aiming at,
// but with less fitting detail — the Tiger is the star and gets the budget.

import * as THREE from 'three';
import { M } from './Materials.js';
import { VEHICLES } from '../data/vehicles.js';

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
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function slope(w, h, t, mtl, x, y, z, ax) {
  const m = box(w, h, t, mtl, x, y, z);
  m.rotation.x = ax;
  return m;
}

/** Generic tracked running gear sized to the vehicle. */
function runningGear(dims, wheelCount, wheelDia, mtl, lod) {
  const g = new THREE.Group();
  const hw = dims.width / 2;
  const r = wheelDia / 2;
  const axleY = r + 0.04;
  const len = dims.hullLength * 0.82;
  const seg = lod === 0 ? 14 : 8;
  const wheels = [];

  for (const sx of [-1, 1]) {
    for (let i = 0; i < wheelCount; i++) {
      const z = len / 2 - (i / (wheelCount - 1)) * len;
      const w = cyl(r, r, 0.10, seg, mtl);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * (hw - 0.22), axleY, z);
      g.add(w);
      wheels.push(w);
    }
    // Track: a simple belt box, correct width for the vehicle.
    const trackW = dims.trackWidth || 0.5;
    const belt = new THREE.Group();
    belt.add(box(trackW, 0.06, len + r * 2, M.track(), sx * (hw - 0.22), 0.03, 0));
    belt.add(box(trackW, 0.06, len + r * 2, M.track(), sx * (hw - 0.22), axleY + r + 0.02, 0));
    for (const zEnd of [1, -1]) {
      const cap = cyl(r + 0.03, r + 0.03, trackW, seg, M.track());
      cap.rotation.z = Math.PI / 2;
      cap.position.set(sx * (hw - 0.22), axleY, zEnd * (len / 2 + 0.0));
      belt.add(cap);
    }
    g.add(belt);
  }
  g.userData.wheels = wheels;
  return g;
}

function buildT34(lod) {
  const s = VEHICLES.t34_43;
  const g = new THREE.Group();
  const d = s.dims;
  const hw = d.width / 2;

  // The famous sloped hull: 45 mm glacis at 60 degrees from the vertical.
  g.add(box(d.width - 0.55, 0.55, d.hullLength - 0.4, M.soviet(), 0, 0.62, 0));
  g.add(slope(d.width - 0.30, 1.05, 0.05, M.soviet(), 0, 1.14, d.hullLength / 2 - 0.20, -60 * DEG));
  g.add(slope(d.width - 0.30, 0.70, 0.05, M.soviet(), 0, 0.52, d.hullLength / 2 - 0.05, 53 * DEG));
  g.add(slope(d.width - 0.30, 0.95, 0.05, M.soviet(), 0, 1.05, -(d.hullLength / 2 - 0.15), 47 * DEG));
  for (const sx of [-1, 1]) {
    const side = box(0.05, 0.62, d.hullLength - 0.5, M.soviet(), sx * (hw - 0.06), 1.05, 0);
    side.rotation.z = sx * 40 * DEG * 0.4;
    g.add(side);
  }
  g.add(box(d.width - 0.30, 0.05, d.hullLength - 0.9, M.soviet(), 0, 1.48, 0));

  // Hexagonal turret with the two-man crew that cost them so much at Kursk.
  const turret = new THREE.Group();
  turret.name = 'turret';
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.90, 0.60, 6), M.soviet());
  shell.position.y = 1.92;
  shell.rotation.y = Math.PI / 6;
  turret.add(shell);
  turret.add(cyl(0.80, 0.80, 0.04, 6, M.soviet(), 0, 2.24, 0));
  // Twin roof hatches — the mid-1943 hexagonal turret has two.
  for (const sx of [-1, 1]) {
    turret.add(cyl(0.24, 0.24, 0.05, lod === 0 ? 14 : 8, M.sovietDark(), sx * 0.34, 2.27, -0.10));
  }
  // Mantlet and the 76.2 mm F-34.
  turret.add(cyl(0.22, 0.22, 0.30, lod === 0 ? 14 : 8, M.sovietDark(), 0, 1.93, 0.86).rotateX(Math.PI / 2));
  const gun = new THREE.Group();
  gun.position.set(0, 1.93, 0.30);
  const barrel = cyl(0.048, 0.056, 2.55, lod === 0 ? 12 : 8, M.sovietDark(), 0, 0, 1.55);
  barrel.rotation.x = Math.PI / 2;
  gun.add(barrel);
  turret.add(gun);
  turret.userData.gun = gun;
  turret.position.z = 0.20;
  g.add(turret);

  g.add(runningGear(d, 5, 0.83, M.sovietDark(), lod));

  if (lod < 2) {
    // Fuel drums on the rear deck — a T-34 trademark, and a fire risk.
    for (const sx of [-1, 1]) {
      const drum = cyl(0.22, 0.22, 0.75, 10, M.sovietDark(), sx * 1.05, 1.30, -(d.hullLength / 2 - 0.55));
      drum.rotation.z = Math.PI / 2;
      g.add(drum);
    }
    // Grab rails for tank riders.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.add(box(0.03, 0.09, 0.03, M.sovietDark(), sx * (hw - 0.20), 1.55, 0.6 - i * 0.7));
      }
    }
  }

  g.userData = { turret, gun, wheels: g.children.find((c) => c.userData?.wheels)?.userData.wheels || [] };
  return g;
}

function buildT70(lod) {
  const s = VEHICLES.t70m;
  const g = new THREE.Group();
  const d = s.dims;
  g.add(box(d.width - 0.5, 0.50, d.hullLength - 0.3, M.soviet(), 0, 0.55, 0));
  g.add(slope(d.width - 0.3, 0.80, 0.045, M.soviet(), 0, 0.90, d.hullLength / 2 - 0.15, -60 * DEG));
  g.add(box(d.width - 0.3, 0.35, d.hullLength - 0.5, M.soviet(), 0, 0.95, -0.2));

  const turret = new THREE.Group();
  turret.name = 'turret';
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.50, 0.42, 6), M.soviet());
  shell.position.y = 1.62;
  turret.add(shell);
  turret.add(cyl(0.44, 0.44, 0.03, 6, M.sovietDark(), 0, 1.84, 0));
  const gun = new THREE.Group();
  gun.position.set(0, 1.64, 0.30);
  const barrel = cyl(0.03, 0.035, 1.60, 8, M.sovietDark(), 0, 0, 0.90);
  barrel.rotation.x = Math.PI / 2;
  gun.add(barrel);
  turret.add(gun);
  turret.userData.gun = gun;
  g.add(turret);
  g.add(runningGear(d, 5, 0.55, M.sovietDark(), lod));
  g.userData = { turret, gun };
  return g;
}

function buildKV1s(lod) {
  const s = VEHICLES.kv1s;
  const g = new THREE.Group();
  const d = s.dims;
  const hw = d.width / 2;
  g.add(box(d.width - 0.6, 0.60, d.hullLength - 0.3, M.soviet(), 0, 0.70, 0));
  g.add(box(d.width - 0.3, 0.55, d.hullLength - 0.6, M.soviet(), 0, 1.28, 0));
  g.add(slope(d.width - 0.3, 0.85, 0.06, M.soviet(), 0, 1.22, d.hullLength / 2 - 0.10, -60 * DEG));

  const turret = new THREE.Group();
  turret.name = 'turret';
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.94, 0.66, lod === 0 ? 16 : 8), M.soviet());
  shell.position.y = 2.02;
  turret.add(shell);
  turret.add(cyl(0.86, 0.86, 0.04, lod === 0 ? 16 : 8, M.soviet(), 0, 2.37, 0));
  turret.add(cyl(0.24, 0.24, 0.28, 10, M.sovietDark(), 0, 2.03, 0.88).rotateX(Math.PI / 2));
  const gun = new THREE.Group();
  gun.position.set(0, 2.03, 0.35);
  const barrel = cyl(0.05, 0.058, 2.50, lod === 0 ? 12 : 8, M.sovietDark(), 0, 0, 1.50);
  barrel.rotation.x = Math.PI / 2;
  gun.add(barrel);
  turret.add(gun);
  turret.userData.gun = gun;
  turret.position.z = 0.10;
  g.add(turret);
  g.add(runningGear(d, 6, 0.60, M.sovietDark(), lod));
  g.userData = { turret, gun };
  return g;
}

function buildCasemate(specId, lod) {
  const s = VEHICLES[specId];
  const g = new THREE.Group();
  const d = s.dims;
  const hw = d.width / 2;
  const big = specId === 'su152';
  const small = specId === 'su76m';

  g.add(box(d.width - 0.55, 0.55, d.hullLength - 0.3, M.soviet(), 0, 0.62, 0));

  // The casemate. This is the shape that reads at long range and is why an
  // SU-122 and an SU-152 get confused with each other.
  const chH = big ? 1.00 : small ? 0.62 : 0.85;
  const chY = big ? 1.60 : small ? 1.15 : 1.35;
  g.add(box(d.width - 0.25, chH, d.hullLength * 0.62, M.soviet(), 0, chY, 0.55));
  g.add(slope(d.width - 0.25, chH * 1.15, 0.06, M.soviet(), 0, chY, d.hullLength * 0.42, -(big ? 30 : 45) * DEG));
  if (!small) g.add(box(d.width - 0.30, 0.05, d.hullLength * 0.55, M.soviet(), 0, chY + chH / 2, 0.55));

  // The gun. On the SU-152 it is enormous and it has a muzzle brake.
  const gun = new THREE.Group();
  const L2 = s.L;
  gun.position.set(0, L2.trunnionY, L2.trunnionZ);
  const bl = L2.barrelLength;
  const rad = big ? 0.085 : small ? 0.042 : 0.070;
  const barrel = cyl(rad, rad * 1.15, bl, lod === 0 ? 14 : 8, M.sovietDark(), 0, 0, bl / 2);
  barrel.rotation.x = Math.PI / 2;
  gun.add(barrel);
  if (big) {
    const brake = cyl(0.13, 0.13, 0.32, 12, M.sovietDark(), 0, 0, bl - 0.05);
    brake.rotation.x = Math.PI / 2;
    gun.add(brake);
  }
  // Mantlet.
  const mant = cyl(big ? 0.30 : 0.22, big ? 0.30 : 0.22, 0.24, lod === 0 ? 14 : 8, M.sovietDark(), 0, 0, 0.10);
  mant.rotation.x = Math.PI / 2;
  gun.add(mant);
  g.add(gun);

  g.add(runningGear(d, specId === 'su152' ? 6 : 5, specId === 'su76m' ? 0.55 : 0.83, M.sovietDark(), lod));
  g.userData = { gun, fixed: true };
  return g;
}

function buildTowedGun(specId, lod) {
  const s = VEHICLES[specId];
  const g = new THREE.Group();
  const big = specId === 'k52_aa';

  // Shield, carriage, trails and wheels. Dug in, these are extremely hard to see,
  // which is exactly the point.
  const shieldW = big ? 1.9 : 1.6;
  const shield = box(shieldW, big ? 1.0 : 0.85, 0.02, M.sovietDark(), 0, big ? 0.95 : 0.72, 0.50);
  shield.rotation.x = -20 * DEG;
  g.add(shield);
  g.add(box(0.30, 0.24, 0.70, M.sovietDark(), 0, big ? 0.85 : 0.62, 0.05));

  // Trails.
  for (const sx of [-1, 1]) {
    const trail = box(0.10, 0.10, 2.0, M.sovietDark(), sx * 0.35, 0.28, -1.0);
    trail.rotation.y = sx * 8 * DEG;
    g.add(trail);
  }
  // Wheels.
  for (const sx of [-1, 1]) {
    const w = cyl(big ? 0.40 : 0.32, big ? 0.40 : 0.32, 0.12, lod === 0 ? 14 : 8, M.rubber());
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (shieldW / 2 - 0.15), big ? 0.40 : 0.32, 0.05);
    g.add(w);
  }

  // Barrel.
  const gun = new THREE.Group();
  gun.position.set(0, s.L.trunnionY, s.L.trunnionZ);
  const barrel = cyl(big ? 0.055 : 0.042, big ? 0.062 : 0.048, s.L.barrelLength, lod === 0 ? 12 : 8,
    M.sovietDark(), 0, 0, s.L.barrelLength / 2);
  barrel.rotation.x = Math.PI / 2;
  gun.add(barrel);
  if (big) {
    const brake = cyl(0.085, 0.085, 0.22, 10, M.sovietDark(), 0, 0, s.L.barrelLength - 0.05);
    brake.rotation.x = Math.PI / 2;
    gun.add(brake);
  }
  g.add(gun);
  g.userData = { gun, fixed: true, static: true };
  return g;
}

function buildPanzer(specId, lod) {
  const s = VEHICLES[specId];
  const g = new THREE.Group();
  const d = s.dims;
  const hw = d.width / 2;
  const isStug = specId === 'stug3g';

  g.add(box(d.width - 0.5, 0.55, d.hullLength - 0.3, M.hullDark(), 0, 0.62, 0));
  g.add(box(d.width, 0.55, d.hullLength - 0.4, M.hull(), 0, 1.18, 0));
  g.add(slope(d.width - 0.1, 0.60, 0.06, M.hull(), 0, 1.15, d.hullLength / 2 - 0.05, -10 * DEG));

  if (isStug) {
    // Low casemate with the Saukopf mantlet.
    g.add(box(d.width - 0.1, 0.55, d.hullLength * 0.55, M.hull(), 0, 1.50, 0.35));
    g.add(slope(d.width - 0.1, 0.70, 0.07, M.hull(), 0, 1.45, d.hullLength * 0.42, -21 * DEG));
    const gun = new THREE.Group();
    gun.position.set(0, s.L.trunnionY, s.L.trunnionZ);
    const barrel = cyl(0.048, 0.056, s.L.barrelLength, lod === 0 ? 12 : 8, M.barrel(), 0, 0, s.L.barrelLength / 2);
    barrel.rotation.x = Math.PI / 2;
    gun.add(barrel);
    const brake = cyl(0.085, 0.085, 0.22, 10, M.darkSteel(), 0, 0, s.L.barrelLength - 0.02);
    brake.rotation.x = Math.PI / 2;
    gun.add(brake);
    const saukopf = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), M.mantlet());
    saukopf.scale.set(1, 0.85, 1.3);
    gun.add(saukopf);
    g.add(gun);
    g.userData = { gun, fixed: true };
  } else {
    const turret = new THREE.Group();
    turret.name = 'turret';
    const tw = specId === 'pz4h' ? 1.62 : 1.50;
    turret.add(box(tw, 0.52, 1.70, M.turret(), 0, 2.05, 0));
    turret.add(box(tw - 0.06, 0.04, 1.66, M.turret(), 0, 2.33, 0));
    // Cupola.
    turret.add(cyl(0.22, 0.22, 0.20, lod === 0 ? 14 : 8, M.turret(), 0, 2.42, -0.50));
    const gun = new THREE.Group();
    gun.position.set(0, s.L.trunnionY, s.L.trunnionZ);
    const barrel = cyl(0.042, 0.05, s.L.barrelLength, lod === 0 ? 12 : 8, M.barrel(), 0, 0, s.L.barrelLength / 2);
    barrel.rotation.x = Math.PI / 2;
    gun.add(barrel);
    if (specId === 'pz4h') {
      const brake = cyl(0.075, 0.075, 0.20, 10, M.darkSteel(), 0, 0, s.L.barrelLength - 0.02);
      brake.rotation.x = Math.PI / 2;
      gun.add(brake);
    }
    turret.add(gun);
    turret.userData.gun = gun;
    turret.position.z = s.L.turretCentreZ;
    g.add(turret);
    g.userData = { turret, gun };

    if (specId === 'pz4h' && lod < 2 && s.schurzen) {
      // Schürzen: the 5 mm skirt plates that made a Panzer IV look like a Tiger
      // from the front at a distance, and got a lot of Soviet crews killed.
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          g.add(box(0.01, 0.55, 0.70, M.hullDark(), sx * (hw + 0.14), 1.20, 1.5 - i * 0.78));
        }
      }
      for (const sx of [-1, 1]) {
        turret.add(box(0.01, 0.42, 1.30, M.hullDark(), sx * 0.90, 2.05, -0.10));
      }
    }
  }

  g.add(runningGear(d, specId === 'pz4h' ? 8 : 6, specId === 'pz4h' ? 0.47 : 0.52, M.wheel(), lod));
  return g;
}

function buildFamo(lod) {
  const s = VEHICLES.famo;
  const g = new THREE.Group();
  const d = s.dims;
  // Bonnet and cab.
  g.add(box(1.7, 0.75, 2.0, M.hull(), 0, 1.05, 2.60));
  g.add(box(1.9, 0.85, 1.3, M.hull(), 0, 1.45, 1.10));
  g.add(box(1.8, 0.05, 1.2, M.canvas(), 0, 1.90, 1.10));
  // The long open cargo body where the recovery gear rides.
  g.add(box(2.3, 0.60, 4.9, M.hull(), 0, 1.10, -1.85));
  g.add(box(2.4, 0.06, 4.9, M.hullDark(), 0, 0.80, -1.85));
  // Winch and cable drum.
  g.add(cyl(0.28, 0.28, 0.85, 12, M.steel(), 0, 1.30, -2.10).rotateZ(Math.PI / 2));
  // Front road wheels, rear tracks — it is a half-track.
  for (const sx of [-1, 1]) {
    const w = cyl(0.50, 0.50, 0.20, lod === 0 ? 14 : 8, M.rubber());
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * 1.10, 0.50, 3.55);
    g.add(w);
    for (let i = 0; i < 6; i++) {
      const rw = cyl(0.32, 0.32, 0.14, lod === 0 ? 12 : 6, M.wheel());
      rw.rotation.z = Math.PI / 2;
      rw.position.set(sx * 1.05, 0.36, 1.0 - i * 0.72);
      g.add(rw);
    }
    g.add(box(0.44, 0.06, 4.4, M.track(), sx * 1.05, 0.03, -0.80));
    g.add(box(0.44, 0.06, 4.4, M.track(), sx * 1.05, 0.72, -0.80));
  }
  g.userData = { isRecovery: true };
  return g;
}

function buildHalftrack(lod) {
  const g = new THREE.Group();
  g.add(box(2.0, 0.55, 3.8, M.hull(), 0, 0.85, -0.6));
  g.add(box(1.7, 0.60, 1.9, M.hull(), 0, 0.90, 2.05));
  // The angular armoured sides that make a 251 unmistakable.
  for (const sx of [-1, 1]) {
    const side = box(0.04, 0.55, 3.8, M.hull(), sx * 1.0, 1.30, -0.6);
    side.rotation.z = sx * 25 * DEG;
    g.add(side);
  }
  const front = box(1.9, 0.55, 0.04, M.hull(), 0, 1.25, 1.10);
  front.rotation.x = -25 * DEG;
  g.add(front);
  for (const sx of [-1, 1]) {
    const w = cyl(0.42, 0.42, 0.18, lod === 0 ? 12 : 8, M.rubber());
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * 0.92, 0.42, 2.55);
    g.add(w);
    for (let i = 0; i < 5; i++) {
      const rw = cyl(0.26, 0.26, 0.12, 8, M.wheel());
      rw.rotation.z = Math.PI / 2;
      rw.position.set(sx * 0.88, 0.30, 0.6 - i * 0.60);
      g.add(rw);
    }
    g.add(box(0.28, 0.05, 3.0, M.track(), sx * 0.88, 0.03, -0.60));
    g.add(box(0.28, 0.05, 3.0, M.track(), sx * 0.88, 0.58, -0.60));
  }
  return g;
}

function buildTruck(lod) {
  const g = new THREE.Group();
  g.add(box(1.9, 0.70, 1.6, M.hull(), 0, 1.10, 2.10));   // cab
  g.add(box(1.7, 0.60, 1.2, M.hull(), 0, 1.15, 0.90));   // bonnet? (cab-behind-engine)
  g.add(box(2.1, 1.20, 3.2, M.canvas(), 0, 1.55, -0.80));  // tilt
  g.add(box(2.2, 0.10, 3.4, M.wood(), 0, 0.92, -0.80));    // bed
  for (const sx of [-1, 1]) {
    for (const z of [2.35, -1.0, -1.9]) {
      const w = cyl(0.45, 0.45, 0.22, lod === 0 ? 12 : 8, M.rubber());
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * 0.95, 0.45, z);
      g.add(w);
    }
  }
  return g;
}

const BUILDERS = {
  t34_43: buildT34, t70m: buildT70, kv1s: buildKV1s,
  su122: (l) => buildCasemate('su122', l),
  su152: (l) => buildCasemate('su152', l),
  su76m: (l) => buildCasemate('su76m', l),
  zis3_atg: (l) => buildTowedGun('zis3_atg', l),
  k53_atg: (l) => buildTowedGun('k53_atg', l),
  k52_aa: (l) => buildTowedGun('k52_aa', l),
  pz4h: (l) => buildPanzer('pz4h', l),
  pz3m: (l) => buildPanzer('pz3m', l),
  stug3g: (l) => buildPanzer('stug3g', l),
  famo: buildFamo,
  sdkfz251: buildHalftrack,
  opel_blitz: buildTruck,
};

export function buildVehicleModel(specId, lod = 0) {
  const fn = BUILDERS[specId];
  if (!fn) {
    // Fail visibly rather than silently: a magenta box is a bug report.
    const g = new THREE.Group();
    g.add(box(3, 2, 6, new THREE.MeshBasicMaterial({ color: 0xff00ff })));
    return g;
  }
  const m = fn(lod);
  m.name = specId;
  m.userData.specId = specId;
  m.userData.lod = lod;
  return m;
}

/** Animate a non-Tiger vehicle model from its simulation state. */
export function updateVehicleModel(model, vehicle, dt) {
  const u = model.userData;
  if (u.turret) u.turret.rotation.y = vehicle.turretAz || 0;
  if (u.gun) u.gun.rotation.x = -(vehicle.gunElev || 0);
  if (u.wheels && vehicle.driveline) {
    const rot = ((vehicle.driveline.speed || 0) / (Math.PI * 0.8)) * Math.PI * 2 * dt;
    for (const w of u.wheels) w.rotation.x += rot;
  }
}

/** A knocked-out vehicle: blackened, tilted, hatches blown open. */
export function applyDestroyed(model) {
  if (model.userData.destroyedApplied) return;
  model.userData.destroyedApplied = true;
  const burnt = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.98, metalness: 0.1 });
  model.traverse((o) => { if (o.isMesh) o.material = burnt; });
  model.rotation.z += (Math.random() - 0.5) * 0.10;
  model.rotation.x += (Math.random() - 0.5) * 0.06;
  if (model.userData.turret && Math.random() < 0.25) {
    // The turret came off. It happened often enough to Soviet tanks that the
    // Germans had a phrase for it.
    model.userData.turret.position.y += 0.35;
    model.userData.turret.rotation.z = (Math.random() - 0.5) * 0.9;
    model.userData.turret.rotation.y += Math.random() * 2;
  }
}
