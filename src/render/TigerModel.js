// ===========================================================================
//  TIGER I Ausf. H — EXTERIOR MODEL
//
//  Built procedurally from the dimensions in src/data/tiger1h.js, which come
//  from docs/HISTORICAL-RESEARCH.md. Nothing here is eyeballed: the hull is
//  6.316 m long, the superstructure is 3.547 m wide, the tracks are 725 mm, the
//  barrel is 4.930 m, and the top of the cupola is at exactly 3.00 m.
//
//  CONFIGURATION LOCK (May/June 1943, Fgst. 250200–250380):
//    * EARLY DRUM CUPOLA with five vision slits and a flip-up hatch.
//      NOT the seven-periscope cast cupola, which begins at Fgst. 250391.
//    * TWO sight apertures in the mantlet for the BINOCULAR TZF 9b.
//    * NO Zimmerit.
//    * Rubber-tyred interleaved road wheels, 8 stations, 24 wheels per side.
//    * Feifel air cleaners on the rear plate.
//    * Turret smoke candle dischargers and hull S-mine dischargers fitted.
//    * Pistol port in the turret rear, NOT a Nahverteidigungswaffe.
//
//  Level of detail is achieved by dropping fittings, not by making the tank the
//  wrong shape. LOD0 has the tools and the weld beads; LOD2 has the same hull.
// ===========================================================================

import * as THREE from 'three';
import { L, TIGER_1H } from '../data/tiger1h.js';
import { M } from './Materials.js';

const DEG = Math.PI / 180;

// Track link thickness, and the heights of the drive sprocket and idler centres.
// A Tiger's sprocket sits noticeably higher than its road wheels, which is what
// gives the running gear its characteristic rising line at the front.
const TRACK_THICKNESS = 0.055;
const SPROCKET_Y = 0.86;
const IDLER_Y = 0.74;

/** Small helper: a box positioned by its centre. */
function box(w, h, d, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtl);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, seg, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mtl);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A sloped plate: a thin box rotated about X by `angleFromVertical`. */
function plate(w, h, thickness, mtl, x, y, z, tiltX = 0, tiltY = 0, tiltZ = 0) {
  const m = box(w, h, thickness, mtl, x, y, z);
  m.rotation.set(tiltX, tiltY, tiltZ);
  return m;
}

/**
 * The interleaved Schachtellaufwerk. Eight torsion-bar stations per side,
 * carrying 24 wheels per side in three overlapping ranks. This arrangement is
 * the single most recognisable thing about a Tiger's running gear, and it is
 * also why changing an inner road wheel took the crew half a day.
 */
function buildRunningGear(side, lod) {
  const g = new THREE.Group();
  const sx = side;                       // +1 right, -1 left
  const wheelR = L.roadWheelDia / 2;      // 0.40 m
  // The road wheels ride ON the track, and the track lies on the ground, so the
  // axle line sits one wheel radius plus one track thickness above y = 0.
  // The 0.47 m ground clearance is then the hull floor, which is just above it.
  const axleY = wheelR + TRACK_THICKNESS;

  // Eight stations, evenly spaced along the 3.61 m of track contact.
  const stations = 8;
  const first = L.trackContact / 2 - 0.30;
  const spacing = (L.trackContact - 0.60) / (stations - 1);

  // Three ranks at different lateral offsets — that is the interleaving.
  const rankOffsets = lod === 0 ? [1.06, 1.30, 1.52] : lod === 1 ? [1.10, 1.42] : [1.28];
  const wheelSeg = lod === 0 ? 20 : lod === 1 ? 12 : 8;

  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.10, wheelSeg);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyreGeo = new THREE.CylinderGeometry(wheelR + 0.005, wheelR + 0.005, 0.075, wheelSeg);
  tyreGeo.rotateZ(Math.PI / 2);

  const wheels = [];
  for (let r = 0; r < rankOffsets.length; r++) {
    // Ranks are staggered by half a station, which is what makes them interleave.
    const offset = (r % 2) * spacing * 0.5;
    const count = r === 1 ? stations : stations - (r === 2 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const z = first - i * spacing - offset;
      if (Math.abs(z) > L.trackContact / 2 + 0.2) continue;
      const disc = new THREE.Mesh(wheelGeo, M.wheel());
      disc.position.set(sx * rankOffsets[r], axleY, z);
      disc.castShadow = true;
      g.add(disc);
      // Rubber tyre — deleted from production in early 1944, present here.
      const tyre = new THREE.Mesh(tyreGeo, M.rubber());
      tyre.position.copy(disc.position);
      tyre.position.x += sx * 0.014;
      g.add(tyre);
      wheels.push(disc);
    }
  }

  // Drive sprocket, front. Toothed ring, drives the track.
  const sprocketR = L.sprocketDia / 2;
  const sprocket = new THREE.Group();
  const hub = cyl(sprocketR * 0.55, sprocketR * 0.55, 0.16, lod === 0 ? 18 : 10, M.steel());
  hub.rotation.z = Math.PI / 2;
  sprocket.add(hub);
  if (lod < 2) {
    const teeth = lod === 0 ? 18 : 10;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const t = box(0.14, 0.10, 0.07, M.steel(),
        0, Math.sin(a) * sprocketR * 0.86, Math.cos(a) * sprocketR * 0.86);
      t.rotation.x = -a;
      sprocket.add(t);
    }
  }
  sprocket.position.set(sx * 1.30, SPROCKET_Y, L.hullHalfL - 0.42);
  g.add(sprocket);

  // Idler, rear, with the track tensioner.
  const idler = cyl(0.33, 0.33, 0.14, lod === 0 ? 16 : 8, M.wheel());
  idler.rotation.z = Math.PI / 2;
  idler.position.set(sx * 1.30, IDLER_Y, -(L.hullHalfL - 0.34));
  g.add(idler);

  g.userData.wheels = wheels;
  g.userData.sprocket = sprocket;
  g.userData.idler = idler;
  return g;
}

/**
 * The 725 mm Kgs 63/725/130 combat track, 96 links per side.
 * Drawn as an instanced belt around the running gear so it costs one draw call.
 */
function buildTrack(side, lod) {
  const sx = side;
  const linkCount = lod === 0 ? 62 : lod === 1 ? 40 : 24;
  const linkGeo = new THREE.BoxGeometry(L.trackWidth, TRACK_THICKNESS, 0.24);
  const inst = new THREE.InstancedMesh(linkGeo, M.track(), linkCount);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // The track path: an elongated loop around sprocket, idler and road wheels.
  const wheelR = L.roadWheelDia / 2;
  const axleY = wheelR + TRACK_THICKNESS;
  const frontZ = L.hullHalfL - 0.42;
  const rearZ = -(L.hullHalfL - 0.34);
  // The Tiger has no separate return rollers: the top run rides on the tops of
  // the outer road wheels, which is why it sags between them.
  const topY = axleY + wheelR + TRACK_THICKNESS;
  const botY = TRACK_THICKNESS / 2;

  const path = [];
  const straightTop = Math.round(linkCount * 0.30);
  const straightBot = Math.round(linkCount * 0.34);
  const nose = Math.round((linkCount - straightTop - straightBot) / 2);

  // Top run (sprocket -> idler), sagging slightly between return rollers.
  for (let i = 0; i < straightTop; i++) {
    const t = i / (straightTop - 1);
    const z = frontZ + (rearZ - frontZ) * t;
    const sag = Math.sin(t * Math.PI * 3) * 0.028;
    path.push({ z, y: topY - sag, rot: 0 });
  }
  // Around the idler.
  const idlerR = 0.36;
  for (let i = 0; i < nose; i++) {
    const a = (i / nose) * Math.PI;
    path.push({ z: rearZ - Math.sin(a) * idlerR, y: IDLER_Y + Math.cos(a) * idlerR, rot: -a });
  }
  // Bottom run (idler -> sprocket), flat on the ground.
  for (let i = 0; i < straightBot; i++) {
    const t = i / (straightBot - 1);
    path.push({ z: rearZ + (frontZ - rearZ) * t, y: botY, rot: 0 });
  }
  // Around the sprocket.
  const sprocketR = L.sprocketDia / 2 + 0.02;
  for (let i = 0; i < nose; i++) {
    const a = (i / nose) * Math.PI;
    path.push({ z: frontZ + Math.sin(a) * sprocketR, y: SPROCKET_Y - Math.cos(a) * sprocketR, rot: a });
  }

  const dummy = new THREE.Object3D();
  for (let i = 0; i < linkCount; i++) {
    const p = path[i % path.length];
    dummy.position.set(sx * 1.49, p.y, p.z);
    dummy.rotation.set(p.rot, 0, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.userData = { path, sx, linkCount, offset: 0 };
  return inst;
}

/** The engine deck: armoured louvres, radiator hatches, and the crew's stowage. */
function buildEngineDeck(lod) {
  const g = new THREE.Group();
  const deckY = L.hullRoofY + 0.01;

  // Central engine access hatch.
  g.add(box(1.10, 0.05, 1.05, M.hullDark(), 0, deckY, -2.10));

  // Four radiator/fan access hatches, two each side.
  for (const sx of [-1, 1]) {
    for (const z of [-1.55, -2.62]) {
      g.add(box(0.72, 0.045, 0.80, M.hullDark(), sx * 1.18, deckY, z));
      if (lod < 2) {
        // Armoured louvres over the fan intakes.
        for (let i = 0; i < 5; i++) {
          const lv = box(0.66, 0.035, 0.055, M.steel(), sx * 1.18, deckY + 0.035, z - 0.28 + i * 0.14);
          lv.rotation.x = 22 * DEG;
          g.add(lv);
        }
      }
    }
  }

  if (lod < 2) {
    // Air intake cowls on the centre line.
    for (const z of [-1.35, -2.85]) {
      g.add(box(0.42, 0.10, 0.34, M.steel(), 0, deckY + 0.05, z));
    }
    // Tools on the deck: shovel, crowbar, axe, wire cutters, fire extinguisher.
    g.add(box(0.06, 0.05, 0.95, M.wood(), -1.62, deckY + 0.04, -1.10));      // shovel handle
    g.add(box(0.16, 0.03, 0.22, M.steel(), -1.62, deckY + 0.04, -1.66));     // shovel blade
    g.add(box(0.05, 0.05, 1.15, M.steel(), 1.62, deckY + 0.04, -1.30));      // crowbar
    g.add(box(0.07, 0.06, 0.62, M.wood(), 1.48, deckY + 0.04, -2.40));       // axe
    const ext = cyl(0.05, 0.05, 0.34, 10, M.steel(), -1.45, deckY + 0.06, -2.55);
    ext.rotation.x = Math.PI / 2;
    g.add(ext);                                                              // hand extinguisher
    // The 20-tonne jack and its wooden block, stowed ACROSS the rear plate.
    g.add(box(0.62, 0.16, 0.16, M.steel(), 0.62, 1.30, -3.22));
    g.add(box(0.26, 0.20, 0.24, M.wood(), -0.86, 1.30, -3.22));
  }

  return g;
}

/**
 * The Feifel air cleaner system: two cylinders on the rear plate with trunking
 * over the engine deck. Standard until late 1943 and frequently stripped off in
 * the field, so it is a removable child group.
 */
function buildFeifel() {
  const g = new THREE.Group();
  g.name = 'feifel';
  for (const sx of [-1, 1]) {
    const c = cyl(0.20, 0.20, 0.58, 14, M.steel(), sx * 1.05, 1.62, -3.28);
    g.add(c);
    g.add(cyl(0.21, 0.21, 0.05, 14, M.darkSteel(), sx * 1.05, 1.93, -3.28));
    // Trunking forward to the engine bay.
    const pipe = cyl(0.075, 0.075, 0.75, 8, M.steel(), sx * 1.05, 1.80, -2.95);
    pipe.rotation.x = Math.PI / 2 - 0.35;
    g.add(pipe);
  }
  return g;
}

/** Twin armoured exhaust stacks on the rear plate. */
function buildExhausts() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    // The armoured guard added in early 1943.
    g.add(cyl(0.13, 0.15, 0.78, 12, M.darkSteel(), sx * 0.62, 1.42, -3.24));
    g.add(cyl(0.09, 0.09, 0.30, 10, M.steel(), sx * 0.62, 1.92, -3.24));
    // Deflector cap.
    g.add(box(0.24, 0.03, 0.22, M.steel(), sx * 0.62, 2.06, -3.24));
  }
  return g;
}

/**
 * The EARLY DRUM CUPOLA. This is the configuration lock made visible.
 * A tall drum with five vision slits, laminated glass blocks behind sliding
 * armoured covers, and a single flip-up hatch hinged at the rear. No periscopes,
 * no pivoting hatch, no anti-aircraft machine gun ring.
 */
function buildCupola(lod) {
  const g = new THREE.Group();
  g.name = 'cupola';
  const R = 0.245;
  const H = L.cupolaTopY - L.turretRoofY;     // 0.48 m
  const baseY = L.turretRoofY;

  const drum = cyl(R, R + 0.012, H, lod === 0 ? 24 : 12, M.turret(), 0, baseY + H / 2, 0);
  g.add(drum);
  // Reinforcing band at the base.
  g.add(cyl(R + 0.03, R + 0.03, 0.06, lod === 0 ? 24 : 12, M.hullDark(), 0, baseY + 0.04, 0));

  // FIVE vision slits, evenly spaced around the forward 260 degrees.
  if (lod < 2) {
    for (let i = 0; i < 5; i++) {
      const a = -130 * DEG + i * 65 * DEG;
      const slit = box(0.135, 0.035, 0.035, M.glass(),
        Math.sin(a) * (R + 0.004), baseY + H * 0.62, Math.cos(a) * (R + 0.004));
      slit.rotation.y = a;
      g.add(slit);
      // The sliding armoured cover above each slit.
      const cover = box(0.17, 0.055, 0.03, M.steel(),
        Math.sin(a) * (R + 0.018), baseY + H * 0.74, Math.cos(a) * (R + 0.018));
      cover.rotation.y = a;
      g.add(cover);
    }
  }

  // The flip-up hatch, hinged at the rear. Animated by hatchAngle.
  const hatchPivot = new THREE.Group();
  hatchPivot.position.set(0, baseY + H, -R * 0.92);
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.045, lod === 0 ? 20 : 10), M.turret());
  hatch.position.set(0, 0.022, R * 0.92);
  hatch.castShadow = true;
  hatchPivot.add(hatch);
  if (lod < 2) {
    // The grab handle on the inside face.
    const handle = box(0.14, 0.025, 0.025, M.steel(), 0, -0.02, R * 1.35);
    hatchPivot.add(handle);
  }
  g.add(hatchPivot);
  g.userData.hatchPivot = hatchPivot;

  return g;
}

/**
 * The turret: a horseshoe of 80 mm side plate with a 100 mm front, carrying the
 * Walzenblende mantlet with TWO sight apertures for the binocular TZF 9b.
 */
function buildTurret(lod) {
  const g = new THREE.Group();
  g.name = 'turret';
  const ringY = L.turretRingY;
  const roofY = L.turretRoofY;
  const h = roofY - ringY;               // 0.77 m
  const midY = ringY + h / 2;

  // The turret shell. The Tiger's turret is a near-cylinder at the back with a
  // flat front plate, so it is built as a horseshoe of segments plus a front.
  const outerR = 0.94;
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(outerR, outerR, h, lod === 0 ? 28 : 14, 1, true,
      Math.PI * 0.32, Math.PI * 1.36),
    M.turret());
  shell.position.set(0, midY, 0.06);
  shell.castShadow = true; shell.receiveShadow = true;
  g.add(shell);

  // Straight side walls forward of the horseshoe.
  for (const sx of [-1, 1]) {
    g.add(box(0.08, h, 1.12, M.turret(), sx * 0.92, midY, 0.62));
  }
  // The 100 mm front plate.
  g.add(box(1.86, h, 0.10, M.turret(), 0, midY, 1.24));
  // Roof.
  const roof = box(1.86, 0.045, 2.05, M.turret(), 0, roofY, 0.22);
  g.add(roof);

  // ---- Mantlet (Walzenblende) --------------------------------------------
  const mantlet = new THREE.Group();
  const mCore = cyl(0.34, 0.34, 1.52, lod === 0 ? 20 : 10, M.mantlet(), 0, 0, 0);
  mCore.rotation.z = Math.PI / 2;
  mantlet.add(mCore);
  // The trunnion bosses — around 200 mm, the thickest steel on the tank.
  for (const sx of [-1, 1]) {
    const boss = cyl(0.30, 0.26, 0.20, lod === 0 ? 16 : 8, M.mantlet(), sx * 0.66, 0, 0.03);
    boss.rotation.z = Math.PI / 2;
    mantlet.add(boss);
  }
  mantlet.position.set(0, L.trunnionY, 1.36);

  // TWO sight apertures — the binocular TZF 9b. A monocular TZF 9c tank has one.
  // This is the single easiest way to date a Tiger in a photograph.
  if (lod < 2) {
    for (const sx of [-1, -0.72]) {
      const ap = cyl(0.038, 0.038, 0.09, 10, M.darkSteel(), sx * 0.32, 0.04, 0.30);
      ap.rotation.x = Math.PI / 2;
      mantlet.add(ap);
    }
    // Coaxial MG 34 port, right of the gun.
    const mgPort = cyl(0.045, 0.045, 0.12, 10, M.darkSteel(), 0.26, -0.02, 0.30);
    mgPort.rotation.x = Math.PI / 2;
    mantlet.add(mgPort);
    const mgBarrel = cyl(0.018, 0.018, 0.30, 8, M.darkSteel(), 0.26, -0.02, 0.44);
    mgBarrel.rotation.x = Math.PI / 2;
    mantlet.add(mgBarrel);
  }
  g.add(mantlet);
  g.userData.mantlet = mantlet;

  // ---- 8.8 cm KwK 36 L/56 barrel -----------------------------------------
  const gunGroup = new THREE.Group();
  gunGroup.position.set(0, L.trunnionY, L.trunnionZ);
  // The L/56 tube is 4.930 m from the breech face, and most of the rear half of
  // that is inside the turret. What is drawn here is the exposed length, sized
  // so that the muzzle lands at exactly L.muzzleZ and the whole vehicle
  // measures 8.45 m with the gun forward.
  const muzzleLocalZ = L.muzzleZ - L.turretCentreZ - L.trunnionZ;
  const BRAKE_LEN = 0.30;
  const barrelStart = 0.70;                       // emerges from the mantlet
  const barrelEnd = muzzleLocalZ - BRAKE_LEN;
  const barrelLen = barrelEnd - barrelStart;
  const barrel = cyl(0.062, 0.078, barrelLen, lod === 0 ? 16 : 8, M.barrel(),
    0, 0, barrelStart + barrelLen / 2);
  barrel.rotation.x = Math.PI / 2;
  gunGroup.add(barrel);
  // The double-baffle muzzle brake.
  const brake = cyl(0.105, 0.105, BRAKE_LEN, lod === 0 ? 14 : 8, M.darkSteel(),
    0, 0, barrelEnd + BRAKE_LEN / 2);
  brake.rotation.x = Math.PI / 2;
  gunGroup.add(brake);
  if (lod < 2) {
    // The two baffle slots.
    for (const z of [barrelEnd + 0.09, barrelEnd + 0.21]) {
      gunGroup.add(box(0.24, 0.055, 0.04, M.darkSteel(), 0, 0, z));
    }
  }
  gunGroup.userData.muzzleLocalZ = muzzleLocalZ;
  g.add(gunGroup);
  g.userData.gun = gunGroup;

  // ---- Roof fittings ------------------------------------------------------
  // Loader's hatch, right side, hinged.
  const loaderPivot = new THREE.Group();
  loaderPivot.position.set(0.72, roofY + 0.02, 0.30);
  const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.04, lod === 0 ? 16 : 8), M.turret());
  lh.position.set(-0.235, 0.02, 0);
  loaderPivot.add(lh);
  g.add(loaderPivot);
  g.userData.loaderHatch = loaderPivot;

  if (lod < 2) {
    // Loader's fixed roof periscope, facing forward.
    g.add(box(0.10, 0.05, 0.13, M.steel(), 0.50, roofY + 0.045, 0.72));
    // Ventilator dome, centre rear of the roof.
    g.add(cyl(0.11, 0.11, 0.06, 12, M.steel(), 0, roofY + 0.04, -0.30));
    // Lifting eyes.
    for (const p of [[-0.70, -0.55], [0.70, -0.55], [0, 1.05]]) {
      g.add(box(0.06, 0.09, 0.10, M.steel(), p[0], roofY + 0.06, p[1]));
    }
  }

  // ---- Rear: escape hatch and pistol port ---------------------------------
  const rearZ = -0.80;
  // Circular escape hatch, right of centre.
  const eh = cyl(0.24, 0.24, 0.05, lod === 0 ? 16 : 8, M.hullDark(), 0.36, L.trunnionY - 0.02, rearZ);
  eh.rotation.x = Math.PI / 2;
  g.add(eh);
  if (lod < 2) {
    // Pistol port, left of centre. A Nahverteidigungswaffe would sit in the
    // roof instead — that is a December 1943 fitting and is deliberately absent.
    const pp = cyl(0.075, 0.075, 0.06, 10, M.darkSteel(), -0.52, L.trunnionY + 0.04, rearZ);
    pp.rotation.x = Math.PI / 2;
    g.add(pp);
  }

  // ---- Turret sides -------------------------------------------------------
  if (lod < 2) {
    // Smoke candle dischargers, three per side. Deletion was ordered around
    // June 1943 after they caused fires; 503's Tigers still carried them.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const t = cyl(0.033, 0.033, 0.16, 8, M.darkSteel(),
          sx * 0.96, L.trunnionY + 0.30, 0.62 - i * 0.14);
        t.rotation.z = sx * 22 * DEG;
        g.add(t);
      }
    }
    // Spare track links hung on the turret sides — every Tiger crew did this.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.add(box(0.045, 0.20, 0.16, M.track(), sx * 0.99, L.trunnionY - 0.18, -0.10 - i * 0.19));
      }
    }
  }

  // ---- Cupola -------------------------------------------------------------
  const cupola = buildCupola(lod);
  cupola.position.set(-0.46, 0, 0.12);
  g.add(cupola);
  g.userData.cupola = cupola;

  return g;
}

/** Hull front: nose, driver's plate with visor, glacis, MG ball mount. */
function buildHullFront(lod) {
  const g = new THREE.Group();

  // 100 mm nose plate at 24 degrees.
  const nose = plate(L.hullWidthUpper - 0.02, 0.80, 0.10, M.hull(),
    0, 0.80, L.hullHalfL - 0.06, 24 * DEG);
  g.add(nose);

  // 100 mm driver's plate at 9 degrees. The Tiger's front is essentially flat,
  // which is exactly why the Soviets needed the 85 mm gun.
  const front = plate(L.hullWidthUpper, 0.85, 0.10, M.hull(),
    0, 1.42, L.hullHalfL - 0.10, -9 * DEG);
  g.add(front);

  // 60 mm glacis at 80 degrees — almost horizontal.
  const glacis = plate(L.hullWidthUpper, 0.62, 0.06, M.hull(),
    0, 1.72, 2.62, 80 * DEG);
  g.add(glacis);

  if (lod < 2) {
    // Driver's visor (Fahrersehklappe) with its sliding armoured shutter.
    const visor = box(0.44, 0.20, 0.06, M.hullDark(), -0.60, 1.46, L.hullHalfL - 0.02);
    visor.rotation.x = -9 * DEG;
    g.add(visor);
    const slot = box(0.32, 0.035, 0.03, M.glass(), -0.60, 1.46, L.hullHalfL + 0.02);
    slot.rotation.x = -9 * DEG;
    g.add(slot);

    // Hull MG 34 in its Kugelblende 50 ball mount, front-right.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 10), M.hullDark());
    ball.position.set(0.63, 1.38, L.hullHalfL - 0.02);
    g.add(ball);
    const mg = cyl(0.024, 0.024, 0.44, 8, M.darkSteel(), 0.63, 1.38, L.hullHalfL + 0.20);
    mg.rotation.x = Math.PI / 2;
    g.add(mg);

    // Bosch headlight on the glacis.
    const lamp = cyl(0.075, 0.075, 0.09, 12, M.darkSteel(), -1.10, 1.80, 2.48);
    lamp.rotation.x = Math.PI / 2 - 0.2;
    g.add(lamp);

    // Spare track links on the glacis — standard crew practice.
    for (let i = 0; i < 6; i++) {
      g.add(box(0.20, 0.05, 0.16, M.track(), -0.75 + i * 0.30, 1.79, 2.20));
    }

    // Towing shackles on the nose.
    for (const sx of [-1, 1]) {
      g.add(box(0.10, 0.14, 0.16, M.steel(), sx * 1.30, 0.72, L.hullHalfL + 0.02));
    }
  }
  return g;
}

/** Hull roof: driver's and radio operator's hatches, S-mine dischargers. */
function buildHullRoof(lod) {
  const g = new THREE.Group();
  const y = L.hullRoofY;

  g.add(box(L.hullWidthUpper, 0.05, 1.20, M.hull(), 0, y, 2.40));       // forward roof
  for (const sx of [-1, 1]) {                                           // sponson roofs
    g.add(box(0.86, 0.05, 2.10, M.hull(), sx * 1.34, y, 0.30));
  }

  // Driver's and radio operator's hatches — pivot-and-slide, hinged outboard.
  const hatches = {};
  for (const [name, sx] of [['driver_hatch', -1], ['radio_hatch', 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 1.16, y + 0.02, 2.42);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.045, lod === 0 ? 16 : 8), M.hull());
    h.position.set(-sx * 0.30, 0.022, 0);
    h.castShadow = true;
    pivot.add(h);
    g.add(pivot);
    hatches[name] = pivot;
  }
  g.userData.hatches = hatches;

  if (lod < 2) {
    // The five S-mine dischargers (Minenabwurfvorrichtung). Deleted around
    // October 1943; present on this vehicle.
    const positions = [[-1.62, 2.90], [1.62, 2.90], [-1.68, 0.10], [1.68, 0.10], [0, -3.02]];
    for (const [x, z] of positions) {
      g.add(cyl(0.045, 0.045, 0.13, 8, M.darkSteel(), x, y + 0.065, z));
    }
    // Periscope for the radio operator.
    g.add(box(0.10, 0.05, 0.12, M.steel(), 0.95, y + 0.045, 2.72));
  }
  return g;
}

/** Fenders, tow cables and the cleaning-rod tube along the hull sides. */
function buildHullSides(lod) {
  const g = new THREE.Group();

  // 80 mm superstructure sides — the Tiger's real weak spot, and it is flat.
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.78, 5.10, M.hull(), sx * L.hullHalfWU, 1.36, 0.20));
  }
  // 60 mm lower tub sides.
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.56, 5.80, M.hullDark(), sx * L.hullHalfWL, 0.75, 0.10));
  }

  if (lod < 2) {
    // Hinged fenders over the tracks.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = 2.30 - i * 1.55;
        const f = box(0.62, 0.03, 1.45, M.hullDark(), sx * 1.52, L.sponsonFloorY + 0.42, z);
        g.add(f);
      }
    }
    // Two 30 mm tow cables coiled along the hull sides.
    for (const sx of [-1, 1]) {
      const cable = new THREE.Mesh(
        new THREE.TorusGeometry(0.30, 0.022, 6, lod === 0 ? 14 : 8), M.darkSteel());
      cable.rotation.y = Math.PI / 2;
      cable.position.set(sx * (L.hullHalfWU + 0.04), 1.10, -1.30);
      g.add(cable);
      // The run of cable along the sponson.
      const run = cyl(0.020, 0.020, 2.10, 6, M.darkSteel(), sx * (L.hullHalfWU + 0.04), 1.02, 0.30);
      run.rotation.x = Math.PI / 2;
      g.add(run);
    }
    // Cleaning rod tube on the left fender.
    const tube = cyl(0.045, 0.045, 1.65, 8, M.steel(), -1.52, L.sponsonFloorY + 0.50, -0.60);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
  }
  return g;
}

/**
 * Build a Tiger I Ausf. H.
 * @param {object} opts { lod: 0|1|2, feifel: boolean, turmNummer: string }
 */
export function buildTiger(opts = {}) {
  const lod = opts.lod ?? 0;
  const root = new THREE.Group();
  root.name = 'TigerIAusfH';

  // ---- Lower hull tub ------------------------------------------------------
  root.add(box(L.hullWidthLower, 0.55, L.hullLength - 0.30, M.hullDark(), 0, 0.75, 0));
  root.add(box(L.hullWidthLower, 0.05, L.hullLength - 0.30, M.hullDark(), 0, L.hullFloorY, 0));

  // ---- Superstructure box --------------------------------------------------
  root.add(box(L.hullWidthUpper - 0.16, 0.78, 5.05, M.hull(), 0, 1.36, 0.18));

  // ---- Rear plate ----------------------------------------------------------
  const rear = plate(L.hullWidthUpper, 0.95, 0.08, M.hull(), 0, 1.22, -(L.hullHalfL - 0.02), 8 * DEG);
  root.add(rear);
  root.add(plate(L.hullWidthLower, 0.42, 0.08, M.hullDark(), 0, 0.66, -(L.hullHalfL - 0.10), -20 * DEG));

  root.add(buildHullFront(lod));
  root.add(buildHullRoof(lod));
  root.add(buildHullSides(lod));
  root.add(buildEngineDeck(lod));
  root.add(buildExhausts());

  if (opts.feifel !== false) root.add(buildFeifel());

  // ---- Running gear and tracks --------------------------------------------
  const gearL = buildRunningGear(-1, lod);
  const gearR = buildRunningGear(1, lod);
  root.add(gearL, gearR);
  const trackL = buildTrack(-1, lod);
  const trackR = buildTrack(1, lod);
  root.add(trackL, trackR);

  // ---- Turret --------------------------------------------------------------
  const turret = buildTurret(lod);
  turret.position.set(0, 0, L.turretCentreZ);
  root.add(turret);

  root.userData = {
    lod,
    turret,
    gun: turret.userData.gun,
    mantlet: turret.userData.mantlet,
    cupola: turret.userData.cupola,
    cupolaHatch: turret.userData.cupola.userData.hatchPivot,
    loaderHatch: turret.userData.loaderHatch,
    hullHatches: root.children.find((c) => c.userData?.hatches)?.userData.hatches
      || {},
    tracks: { left: trackL, right: trackR },
    gear: { left: gearL, right: gearR },
    spec: TIGER_1H,
  };

  // Collect the hull hatches from wherever they ended up in the hierarchy.
  root.traverse((o) => { if (o.userData?.hatches) root.userData.hullHatches = o.userData.hatches; });

  return root;
}

/**
 * Animate a built Tiger from a Vehicle's state.
 * Turret azimuth, gun elevation, recoil, hatches, track motion and road wheels.
 */
export function updateTiger(model, vehicle, dt) {
  const u = model.userData;
  if (!u) return;

  u.turret.rotation.y = vehicle.turretAz || 0;
  if (u.gun) u.gun.rotation.x = -(vehicle.gunElev || 0);

  // Recoil: the barrel runs back 580 mm and returns.
  if (u.gun) {
    const r = vehicle.recoil || 0;
    u.gun.position.z = L.trunnionZ - r * 0.58;
  }

  // Hatches.
  if (u.cupolaHatch) {
    const target = vehicle.hatchOpen?.cupola_hatch ? -105 * DEG : 0;
    u.cupolaHatch.rotation.x += (target - u.cupolaHatch.rotation.x) * Math.min(1, dt * 4);
  }
  if (u.loaderHatch) {
    const target = vehicle.hatchOpen?.loader_hatch ? -95 * DEG : 0;
    u.loaderHatch.rotation.z += (target - u.loaderHatch.rotation.z) * Math.min(1, dt * 4);
  }
  for (const [name, pivot] of Object.entries(u.hullHatches || {})) {
    const target = vehicle.hatchOpen?.[name] ? 85 * DEG : 0;
    const sign = name === 'driver_hatch' ? 1 : -1;
    pivot.rotation.z += (target * sign - pivot.rotation.z) * Math.min(1, dt * 3.5);
  }

  // Tracks: scroll the link belt at the speed each track is actually running.
  const dl = vehicle.driveline;
  if (dl && u.tracks) {
    animateTrack(u.tracks.left, dl.trackSpeedL ?? dl.speed ?? 0, dt,
      vehicle.components?.track_l?.destroyed);
    animateTrack(u.tracks.right, dl.trackSpeedR ?? dl.speed ?? 0, dt,
      vehicle.components?.track_r?.destroyed);

    // Road wheels turn with the track.
    const wheelCirc = Math.PI * L.roadWheelDia;
    for (const [gear, spd] of [[u.gear.left, dl.trackSpeedL], [u.gear.right, dl.trackSpeedR]]) {
      const rot = ((spd || 0) / wheelCirc) * Math.PI * 2 * dt;
      for (const w of gear.userData.wheels || []) w.rotation.x += rot;
      if (gear.userData.sprocket) gear.userData.sprocket.rotation.x += rot * 0.95;
      if (gear.userData.idler) gear.userData.idler.rotation.x += rot;
    }
  }
}

const _dummy = new THREE.Object3D();
function animateTrack(inst, speed, dt, broken) {
  const d = inst.userData;
  if (!d) return;
  if (broken) {
    // A thrown track sags and stops. It stays visible because it is still there,
    // draped over the running gear and in the mud.
    if (!d.brokenApplied) {
      d.brokenApplied = true;
      for (let i = 0; i < d.linkCount; i++) {
        const p = d.path[i % d.path.length];
        _dummy.position.set(d.sx * 1.49, Math.min(p.y, 0.12), p.z);
        _dummy.rotation.set(p.rot + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.2, 0);
        _dummy.updateMatrix();
        inst.setMatrixAt(i, _dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    }
    return;
  }
  d.brokenApplied = false;
  d.offset = (d.offset + (speed * dt) / 0.24) % d.path.length;
  if (Math.abs(speed) < 0.02) return;
  const off = d.offset;
  for (let i = 0; i < d.linkCount; i++) {
    const p = d.path[(Math.floor(i + off) % d.path.length + d.path.length) % d.path.length];
    _dummy.position.set(d.sx * 1.49, p.y, p.z);
    _dummy.rotation.set(p.rot, 0, 0);
    _dummy.updateMatrix();
    inst.setMatrixAt(i, _dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
}


/**
 * Measure a built Tiger against the historical figures.
 *
 * The published 8.45 m overall length is the hull plus the gun. It does not
 * include the exhaust stacks and Feifel cylinders that stand proud of the rear
 * plate, so this reports both numbers and compares the right one.
 *
 * Used by tests/model.test.js — if someone changes a dimension by accident, the
 * test fails rather than the Tiger quietly becoming the wrong shape.
 */
export function measureTiger(THREE_NS, model) {
  const box = new THREE_NS.Box3().setFromObject(model);
  const size = box.getSize(new THREE_NS.Vector3());

  // The rear armour plate, which is what the published length measures to.
  const hullRearZ = -(L.hullHalfL - 0.02) - 0.11;
  const muzzleZ = box.max.z;

  return {
    widthOverTracks: size.x,
    lengthGunForward: muzzleZ - hullRearZ,
    lengthOverAll: size.z,          // including exhausts and Feifel gear
    heightToCupola: box.max.y,
    lowestPoint: box.min.y,
    muzzleZ,
    spec: {
      widthOverTracks: TIGER_1H.dims.width,
      lengthGunForward: TIGER_1H.dims.lengthWithGun,
      heightToCupola: TIGER_1H.dims.height,
    },
  };
}
