// ===========================================================================
//  TIGER I Ausf. H — INTERIOR
//
//  This is where the player spends the game, so it is built to the same
//  standard as the outside. Crew stations are at the coordinates in
//  src/data/tiger1h.js, which means what you see through the cupola matches
//  what the damage model traces a shell through.
//
//  Tiger interiors were painted ivory (Elfenbein) above the sponson line to
//  reflect what little light got in, over red oxide primer lower down.
//
//  Fittings, from the commander's seat clockwise:
//    * the gunner's TZF 9b BINOCULAR sight with its twin eyepieces, elevation
//      handwheel, traverse handwheel and the hydraulic traverse foot rocker
//    * the 8.8 cm breech with its horizontal falling wedge, recoil guard and
//      spent-case bag
//    * the loader's folding seat, his ready rack of four rounds, and the
//      turret rear escape hatch behind his shoulder
//    * sponson ammunition bins either side
//    * forward, the driver's steering wheel, pre-selector lever and instrument
//      panel with the fire warning lamp, and the radio operator's Fu 5 with the
//      hull MG 34 beside it
// ===========================================================================

import * as THREE from 'three';
import { L, STATIONS, AMMO_RACKS } from '../data/tiger1h.js';
import { M } from './Materials.js';

const DEG = Math.PI / 180;

function box(w, h, d, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mtl);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, seg, mtl, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mtl);
  m.position.set(x, y, z);
  return m;
}

/** A shell: 8.8 cm fixed round, brass case and painted projectile. */
function buildRound(kind = 'ap') {
  const g = new THREE.Group();
  const caseLen = 0.57;
  const c = cyl(0.048, 0.052, caseLen, 10, M.brass(), 0, 0, 0);
  c.rotation.x = Math.PI / 2;
  g.add(c);
  const colour = kind === 'he' ? 0x8a7a30 : kind === 'smoke' ? 0x4a5a6a : 0x2e2e33;
  const projMat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, metalness: 0.4 });
  const p = cyl(0.030, 0.044, 0.30, 10, projMat, 0, 0, caseLen / 2 + 0.15);
  p.rotation.x = Math.PI / 2;
  g.add(p);
  // The white or coloured tip band German ammunition carried.
  const band = cyl(0.045, 0.045, 0.02, 10,
    new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.8 }), 0, 0, caseLen / 2 + 0.02);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  return g;
}

/** The gunner's station: TZF 9b binocular sight and the controls. */
function buildGunnerStation() {
  const g = new THREE.Group();
  g.name = 'gunner_station';
  const st = STATIONS.gunner;

  // Seat: a small pan with a back rest, adjustable, hung off the turret wall.
  g.add(box(0.36, 0.06, 0.34, M.interiorSteel(), st.seat[0], st.seat[1], st.seat[2]));
  g.add(box(0.36, 0.34, 0.05, M.interiorSteel(), st.seat[0], st.seat[1] + 0.20, st.seat[2] - 0.16));

  // The TZF 9b. Binocular, so TWO eyepieces — this is the mid-1943 sight.
  const sight = new THREE.Group();
  sight.name = 'tzf9b';
  const body = box(0.17, 0.13, 0.52, M.interiorSteel(), 0, 0, 0);
  sight.add(body);
  for (const sx of [-1, 1]) {
    const eye = cyl(0.028, 0.032, 0.075, 10, M.darkSteel(), sx * 0.037, 0, -0.30);
    eye.rotation.x = Math.PI / 2;
    sight.add(eye);
    // The rubber brow pad the gunner presses his face into.
    const pad = cyl(0.034, 0.034, 0.02, 10, M.rubber(), sx * 0.037, 0, -0.345);
    pad.rotation.x = Math.PI / 2;
    sight.add(pad);
  }
  // Range drum and the graticule illumination lamp.
  sight.add(cyl(0.045, 0.045, 0.03, 12, M.brass(), 0.11, 0.01, -0.10));
  sight.add(box(0.04, 0.04, 0.05, M.brass(), -0.10, 0.06, -0.14));
  sight.position.set(-0.34, 2.14, 1.00);
  g.add(sight);
  g.userData.sight = sight;

  // Elevation handwheel, right hand. The electric trigger sits on its rim.
  const elevWheel = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 6, 16), M.interiorSteel());
  elevWheel.position.set(-0.16, 1.98, 0.86);
  elevWheel.rotation.y = Math.PI / 2;
  g.add(elevWheel);
  g.userData.elevWheel = elevWheel;
  g.add(box(0.035, 0.05, 0.035, M.darkSteel(), -0.16, 2.07, 0.90));   // firing trigger

  // Traverse handwheel, left hand. 720 turns for a full circle.
  const travWheel = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.013, 6, 16), M.interiorSteel());
  travWheel.position.set(-0.55, 1.97, 0.80);
  travWheel.rotation.y = Math.PI / 2;
  g.add(travWheel);
  g.userData.travWheel = travWheel;

  // The hydraulic traverse foot rocker on the floor.
  const pedal = box(0.16, 0.03, 0.24, M.darkSteel(), -0.36, 1.79, 0.70);
  pedal.rotation.x = 8 * DEG;
  g.add(pedal);

  // Azimuth indicator dial above the sight.
  const dial = cyl(0.058, 0.058, 0.02, 16, M.brass(), -0.34, 2.32, 0.92);
  dial.rotation.x = Math.PI / 2;
  g.add(dial);
  g.userData.azimuthDial = dial;

  return g;
}

/** The 8.8 cm KwK 36 breech end, recoil guard and spent-case bag. */
function buildBreech() {
  const g = new THREE.Group();
  g.name = 'breech';

  // Breech ring and the horizontal falling wedge.
  g.add(box(0.42, 0.46, 0.44, M.interiorSteel(), 0, 2.08, 0.62));
  const wedge = box(0.34, 0.30, 0.07, M.darkSteel(), 0, 2.06, 0.40);
  g.add(wedge);
  g.userData.wedge = wedge;

  // The barrel running forward out of the breech, through the cradle.
  const tube = cyl(0.10, 0.10, 1.05, 14, M.interiorSteel(), 0, 2.10, 1.20);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  // Recoil cylinders above and below.
  for (const dy of [0.17, -0.17]) {
    const rc = cyl(0.055, 0.055, 0.85, 10, M.interiorSteel(), 0, 2.10 + dy, 1.10);
    rc.rotation.x = Math.PI / 2;
    g.add(rc);
  }
  // Cradle and trunnion bearings.
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.26, 0.34, M.interiorSteel(), sx * 0.26, 2.10, 1.05));
  }

  // The recoil guard — the cage that stops the breech taking the loader's arm
  // off when it runs back 580 mm.
  const guard = new THREE.Group();
  for (const sx of [-1, 1]) {
    guard.add(box(0.035, 0.50, 0.035, M.interiorSteel(), sx * 0.30, 2.05, 0.30));
  }
  guard.add(box(0.66, 0.035, 0.035, M.interiorSteel(), 0, 2.30, 0.30));
  guard.add(box(0.66, 0.035, 0.035, M.interiorSteel(), 0, 1.84, 0.30));
  g.add(guard);

  // Spent case bag slung under the breech.
  g.add(box(0.40, 0.30, 0.34, M.canvas(), 0, 1.78, 0.34));

  // Elevation quadrant and the gun's own arc.
  g.add(box(0.05, 0.24, 0.24, M.interiorSteel(), -0.24, 2.02, 0.78));

  return g;
}

/** The loader's side: folding seat, ready rack, escape hatch, coax MG. */
function buildLoaderStation() {
  const g = new THREE.Group();
  g.name = 'loader_station';
  const st = STATIONS.loader;

  // Folding seat — a Tiger loader worked standing, and folded it out of the way.
  const seat = box(0.34, 0.05, 0.30, M.interiorSteel(), st.seat[0], st.seat[1], st.seat[2]);
  seat.rotation.x = -70 * DEG;    // folded up against the turret wall
  g.add(seat);

  // The four-round ready rack. This is what he reaches for first, and the reason
  // the fifth round of an engagement takes longer than the first.
  const rack = new THREE.Group();
  rack.name = 'ready_rack';
  const r = AMMO_RACKS.find((x) => x.ready);
  rack.add(box(r.size[0], r.size[1], r.size[2], M.interiorSteel(), r.pos[0], r.pos[1], r.pos[2]));
  const rounds = [];
  for (let i = 0; i < 4; i++) {
    const rd = buildRound(i === 3 ? 'he' : 'ap');
    rd.position.set(r.pos[0] - 0.06 + (i % 2) * 0.12, r.pos[1] - 0.10 + Math.floor(i / 2) * 0.18, r.pos[2]);
    rd.rotation.y = 90 * DEG;
    rack.add(rd);
    rounds.push(rd);
  }
  rack.userData.rounds = rounds;
  g.add(rack);
  g.userData.readyRack = rack;

  // Coaxial MG 34 and its belt bag.
  g.add(cyl(0.035, 0.035, 0.55, 8, M.darkSteel(), 0.24, 2.12, 1.05).rotateX(Math.PI / 2));
  g.add(box(0.16, 0.20, 0.20, M.canvas(), 0.30, 1.94, 0.86));

  // The turret rear escape hatch, over the loader's shoulder.
  const hatch = cyl(0.24, 0.24, 0.05, 16, M.interiorSteel(), 0.36, 2.10, -0.76);
  hatch.rotation.x = Math.PI / 2;
  g.add(hatch);
  g.userData.escapeHatch = hatch;

  // The loader's own traverse handwheel.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 14), M.interiorSteel());
  wheel.position.set(0.52, 1.98, 0.60);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);

  return g;
}

/** The commander's own position: seat, cupola interior, vision blocks. */
function buildCommanderStation() {
  const g = new THREE.Group();
  g.name = 'commander_station';
  const st = STATIONS.commander;
  const cx = st.seat[0], cz = st.seat[2];

  // Adjustable seat on a pillar, raised for head-out and dropped to button up.
  const pillar = cyl(0.05, 0.06, 0.42, 10, M.interiorSteel(), cx, st.seat[1] - 0.22, cz);
  g.add(pillar);
  const pan = box(0.34, 0.06, 0.32, M.interiorSteel(), cx, st.seat[1], cz);
  g.add(pan);
  g.userData.seat = pan;
  g.add(box(0.34, 0.30, 0.05, M.interiorSteel(), cx, st.seat[1] + 0.18, cz - 0.15));

  // Cupola interior: the drum wall, and the five laminated glass vision blocks
  // the commander actually looks through when he is buttoned up.
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.245, L.cupolaTopY - L.turretRoofY, 20, 1, true),
    M.interior());
  drum.material.side = THREE.BackSide;
  drum.position.set(cx, (L.turretRoofY + L.cupolaTopY) / 2, cz + 0.07);
  g.add(drum);
  // Hidden while the commander is buttoned up, because from inside the cupola he
  // is looking THROUGH the vision blocks, not at the drum wall an inch from his face.
  g.userData.cupolaDrum = drum;

  const blocks = [];
  for (let i = 0; i < 5; i++) {
    const a = -130 * DEG + i * 65 * DEG;
    const b = box(0.13, 0.045, 0.03, M.glass(),
      cx + Math.sin(a) * 0.235, L.turretRoofY + 0.30, cz + 0.07 + Math.cos(a) * 0.235);
    b.rotation.y = a;
    g.add(b);
    blocks.push(b);
  }
  g.userData.visionBlocks = blocks;

  // The azimuth ring the commander reads to give the gunner a bearing.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.010, 6, 24), M.brass());
  ring.position.set(cx, L.turretRoofY + 0.06, cz + 0.07);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // Headset and throat microphone hanging on their hook — the Bordsprechanlage.
  g.add(box(0.10, 0.05, 0.03, M.darkSteel(), cx + 0.22, 2.30, cz - 0.16));

  // The commander's 6x30 binoculars in their case.
  g.add(box(0.14, 0.10, 0.07, M.darkSteel(), cx - 0.20, 2.24, cz - 0.10));

  return g;
}

/** Forward hull: the driver and the radio operator, seen from the turret. */
function buildHullStations() {
  const g = new THREE.Group();
  g.name = 'hull_stations';
  const d = STATIONS.driver, r = STATIONS.radio;

  // --- Driver, front left ---
  g.add(box(0.36, 0.06, 0.34, M.interiorSteel(), d.seat[0], d.seat[1], d.seat[2]));
  g.add(box(0.36, 0.36, 0.05, M.interiorSteel(), d.seat[0], d.seat[1] + 0.21, d.seat[2] - 0.16));

  // The steering wheel — the Tiger steered like a lorry, through the L 801
  // controlled differential, and that is genuinely unusual for a 57-tonne tank.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.017, 6, 20), M.darkSteel());
  wheel.position.set(d.seat[0], d.seat[1] + 0.34, d.seat[2] + 0.42);
  wheel.rotation.x = 68 * DEG;
  g.add(wheel);
  g.userData.steeringWheel = wheel;
  g.add(cyl(0.03, 0.03, 0.40, 8, M.interiorSteel(), d.seat[0], d.seat[1] + 0.18, d.seat[2] + 0.28)
    .rotateX(-22 * DEG));

  // The Olvar pre-selector lever, right of the seat.
  const lever = cyl(0.016, 0.016, 0.26, 8, M.interiorSteel(), d.seat[0] + 0.24, d.seat[1] + 0.20, d.seat[2] + 0.16);
  lever.rotation.x = -18 * DEG;
  g.add(lever);
  g.add(cyl(0.026, 0.026, 0.04, 8, M.wood(), d.seat[0] + 0.24, d.seat[1] + 0.33, d.seat[2] + 0.12));

  // Instrument panel, with the fire warning lamp that the Feuerlöschanlage lights.
  const panel = box(0.42, 0.22, 0.04, M.darkSteel(), d.seat[0] + 0.05, d.seat[1] + 0.52, d.seat[2] + 0.50);
  panel.rotation.x = -22 * DEG;
  g.add(panel);
  for (let i = 0; i < 4; i++) {
    const dial = cyl(0.035, 0.035, 0.012, 12, M.brass(),
      d.seat[0] - 0.12 + i * 0.10, d.seat[1] + 0.53, d.seat[2] + 0.52);
    dial.rotation.x = 68 * DEG;
    g.add(dial);
  }
  const lamp = cyl(0.018, 0.018, 0.014, 10,
    new THREE.MeshStandardMaterial({ color: 0x501010, emissive: 0x000000, roughness: 0.5 }),
    d.seat[0] + 0.19, d.seat[1] + 0.56, d.seat[2] + 0.50);
  lamp.rotation.x = 68 * DEG;
  lamp.name = 'fire_warning_lamp';
  g.add(lamp);
  g.userData.fireLamp = lamp;

  // Driver's visor with its laminated block, and the KFF 2 episcope beside it.
  g.add(box(0.32, 0.10, 0.03, M.glass(), d.seat[0], d.seat[1] + 0.42, d.seat[2] + 0.72));
  g.add(box(0.16, 0.09, 0.10, M.interiorSteel(), d.seat[0] + 0.14, d.seat[1] + 0.56, d.seat[2] + 0.62));

  // --- Radio operator, front right ---
  g.add(box(0.36, 0.06, 0.34, M.interiorSteel(), r.seat[0], r.seat[1], r.seat[2]));
  g.add(box(0.36, 0.36, 0.05, M.interiorSteel(), r.seat[0], r.seat[1] + 0.21, r.seat[2] - 0.16));

  // The Fu 5 set: a 10 W transmitter and its Ukw.E.e receiver, stacked on the
  // sponson to his left, which is where his hand falls.
  const radio = new THREE.Group();
  radio.name = 'fu5';
  radio.add(box(0.44, 0.17, 0.28, M.darkSteel(), 0, 0, 0));
  radio.add(box(0.44, 0.15, 0.28, M.darkSteel(), 0, 0.17, 0));
  for (let i = 0; i < 3; i++) {
    radio.add(cyl(0.022, 0.022, 0.012, 10, M.brass(), -0.14 + i * 0.10, 0.02, 0.145).rotateX(Math.PI / 2));
  }
  radio.add(cyl(0.03, 0.03, 0.012, 12, M.brass(), 0.15, 0.19, 0.145).rotateX(Math.PI / 2));
  radio.position.set(1.14, 1.28, 2.30);
  g.add(radio);
  g.userData.radio = radio;

  // The hull MG 34 in its ball mount, with the KZF 2 sight above it.
  const mg = new THREE.Group();
  mg.add(cyl(0.032, 0.032, 0.60, 8, M.darkSteel(), 0, 0, 0.20).rotateX(Math.PI / 2));
  mg.add(box(0.10, 0.14, 0.24, M.darkSteel(), 0, -0.04, -0.10));
  mg.add(box(0.05, 0.10, 0.06, M.wood(), 0, -0.10, -0.26));     // shoulder piece
  mg.add(box(0.07, 0.05, 0.10, M.interiorSteel(), -0.07, 0.07, 0.02));  // KZF 2
  mg.position.set(0.63, 1.36, 2.72);
  g.add(mg);
  g.userData.hullMg = mg;
  // Belt bag.
  g.add(box(0.18, 0.22, 0.22, M.canvas(), 0.90, 1.14, 2.72));

  // The Olvar gearbox between the two of them, under its cover.
  g.add(box(0.92, 0.60, 0.86, M.interiorSteel(), 0, 0.86, 2.05));
  g.add(box(0.96, 0.05, 0.90, M.interior(), 0, 1.17, 2.05));

  return g;
}

/** Sponson ammunition bins, and the rounds inside them. */
function buildAmmoStowage(lod) {
  const g = new THREE.Group();
  g.name = 'ammo_stowage';
  const perRack = {};
  for (const r of AMMO_RACKS) {
    if (r.ready) continue;   // the ready rack lives with the loader
    const bin = box(r.size[0], r.size[1], r.size[2], M.interiorSteel(), r.pos[0], r.pos[1], r.pos[2]);
    bin.material = M.interiorSteel();
    g.add(bin);
    // Hinged bin lids.
    const lid = box(r.size[0] + 0.02, 0.02, r.size[2], M.interior(),
      r.pos[0], r.pos[1] + r.size[1] / 2, r.pos[2]);
    g.add(lid);

    if (lod === 0) {
      // Visible rounds in the open bins. The number is decorative here; the
      // authoritative count lives in Vehicle.rackStock.
      const rounds = [];
      const n = Math.min(6, r.capacity);
      for (let i = 0; i < n; i++) {
        const rd = buildRound('ap');
        rd.position.set(
          r.pos[0], r.pos[1] - r.size[1] * 0.2 + (i % 2) * 0.14,
          r.pos[2] - r.size[2] * 0.35 + Math.floor(i / 2) * (r.size[2] * 0.28));
        rd.rotation.y = 90 * DEG;
        rd.scale.setScalar(0.95);
        g.add(rd);
        rounds.push(rd);
      }
      perRack[r.id] = rounds;
    }
  }
  g.userData.rounds = perRack;
  return g;
}

/**
 * Build the whole fighting compartment.
 * @param {object} opts { lod }
 */
export function buildInterior(opts = {}) {
  const lod = opts.lod ?? 0;
  const g = new THREE.Group();
  g.name = 'TigerInterior';

  // ---- Interior surfaces ---------------------------------------------------
  // Turret walls, seen from inside, painted ivory.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.90, 0.90, L.turretRoofY - L.turretRingY, 24, 1, true,
      Math.PI * 0.32, Math.PI * 1.36),
    M.interior());
  wall.material = M.interior().clone();
  wall.material.side = THREE.BackSide;
  wall.position.set(0, (L.turretRingY + L.turretRoofY) / 2, 0.06);
  g.add(wall);

  // Turret front interior and roof.
  g.add(box(1.80, L.turretRoofY - L.turretRingY, 0.04, M.interior(), 0, (L.turretRingY + L.turretRoofY) / 2, 1.18));
  const roof = box(1.82, 0.03, 2.00, M.interior(), 0, L.turretRoofY - 0.02, 0.22);
  g.add(roof);

  // Turret basket floor — it rotates with the turret, and the crew stand on it.
  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(L.turretRingDia / 2 - 0.04, L.turretRingDia / 2 - 0.04, 0.03, 24),
    M.interiorSteel());
  basket.position.set(0, 1.76, 0.10);
  g.add(basket);
  // The turret ring itself.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(L.turretRingDia / 2, 0.035, 6, 28), M.interiorSteel());
  ring.position.set(0, L.turretRingY, 0.10);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  // Hull interior below the ring: red oxide primer, as it left the works.
  // The FLOOR is only as wide as the tub between the tracks, and the sponson
  // walls start at the sponson floor — below that line a Tiger is open, and
  // anything drawn there pokes out through the running gear.
  g.add(box(L.hullWidthLower - 0.06, 0.02, 5.0, M.interiorLower(), 0, L.hullFloorY + 0.02, 0.2));
  for (const sx of [-1, 1]) {
    // Tub side, from the floor up to the sponson.
    g.add(box(0.03, L.sponsonFloorY - L.hullFloorY, 5.0, M.interiorLower(),
      sx * (L.hullHalfWL - 0.02), (L.hullFloorY + L.sponsonFloorY) / 2, 0.2));
    // Sponson underside and outer wall, above the track line.
    g.add(box(L.hullHalfWU - L.hullHalfWL, 0.03, 5.0, M.interiorLower(),
      sx * (L.hullHalfWL + (L.hullHalfWU - L.hullHalfWL) / 2), L.sponsonFloorY, 0.2));
    g.add(box(0.03, L.hullRoofY - L.sponsonFloorY, 5.0, M.interiorLower(),
      sx * (L.hullHalfWU - 0.10), (L.sponsonFloorY + L.hullRoofY) / 2, 0.2));
  }
  // Forward bulkhead and the driver's compartment ceiling.
  g.add(box(L.hullWidthUpper - 0.20, 0.03, 1.6, M.interior(), 0, L.hullRoofY - 0.03, 2.35));

  // ---- Stations ------------------------------------------------------------
  const commander = buildCommanderStation();
  const gunner = buildGunnerStation();
  const loader = buildLoaderStation();
  const breech = buildBreech();
  g.add(commander, gunner, loader, breech);

  const hull = buildHullStations();
  g.add(hull);

  const ammo = buildAmmoStowage(lod);
  g.add(ammo);

  // ---- Fittings ------------------------------------------------------------
  if (lod === 0) {
    // The hand-held fire extinguisher in the fighting compartment. This is the
    // ONLY fire protection the crew space has — the automatic system covers the
    // engine bay and nothing else.
    const ext = cyl(0.045, 0.045, 0.30, 10, new THREE.MeshStandardMaterial({ color: 0x9a2020, roughness: 0.6 }),
      -0.80, 1.30, 1.30);
    ext.name = 'hand_extinguisher';
    g.add(ext);
    g.userData.handExtinguisher = ext;

    // Intercom junction box.
    g.add(box(0.12, 0.10, 0.06, M.darkSteel(), -0.70, 2.20, -0.40));
    // Turret light.
    const lamp = cyl(0.05, 0.05, 0.05, 10,
      new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0x554020, roughness: 0.4 }),
      0.20, L.turretRoofY - 0.05, -0.30);
    g.add(lamp);
    g.userData.turretLamp = lamp;
    // Gas mask canisters and a water bottle, stowed where crews stowed them.
    for (const sx of [-1, 1]) {
      g.add(cyl(0.055, 0.055, 0.24, 8, M.darkSteel(), sx * 0.80, 1.94, -0.55));
    }
  }

  g.userData = {
    lod, commander, gunner, loader, breech, hull, ammo,
    sight: gunner.userData.sight,
    cupolaDrum: commander.userData.cupolaDrum,
    fireLamp: hull.userData.fireLamp,
    readyRack: loader.userData.readyRack,
    visionBlocks: commander.userData.visionBlocks,
    steeringWheel: hull.userData.steeringWheel,
    commanderSeat: commander.userData.seat,
    handExtinguisher: g.userData?.handExtinguisher,
    turretLamp: g.userData?.turretLamp,
  };
  return g;
}

/** Animate the interior from the vehicle's state. */
export function updateInterior(model, vehicle, dt) {
  const u = model.userData;
  if (!u) return;

  // The driver's fire warning lamp, lit by the Feuerlöschanlage thermostat.
  if (u.fireLamp) {
    const lit = vehicle.fire?.warningLamp || vehicle.fire?.stage === 'detected';
    u.fireLamp.material.emissive.setHex(lit ? 0xff2010 : 0x000000);
  }

  // The gunner's handwheels turn as he lays the gun.
  if (u.gunner?.userData.elevWheel) {
    u.gunner.userData.elevWheel.rotation.x += (vehicle.gunElev - (u._lastElev ?? vehicle.gunElev)) * 40;
    u._lastElev = vehicle.gunElev;
  }
  if (u.gunner?.userData.travWheel) {
    const d = (vehicle.turretAz - (u._lastAz ?? vehicle.turretAz));
    u.gunner.userData.travWheel.rotation.x += d * 60;   // 720 turns per circle
    u._lastAz = vehicle.turretAz;
  }
  if (u.gunner?.userData.azimuthDial) {
    u.gunner.userData.azimuthDial.rotation.y = -vehicle.turretAz;
  }

  // The breech runs back on recoil, then returns.
  if (u.breech) {
    u.breech.position.z = -(vehicle.recoil || 0) * 0.58;
  }

  // The ready rack empties as the loader works through it.
  if (u.readyRack?.userData.rounds) {
    const stock = vehicle.rackStock?.ready_r ?? 4;
    u.readyRack.userData.rounds.forEach((r, i) => { r.visible = i < stock; });
  }

  // Sponson bins empty too, coarsely.
  if (u.ammo?.userData.rounds) {
    for (const [rackId, rounds] of Object.entries(u.ammo.userData.rounds)) {
      const rack = model.userData.ammo;
      const stock = vehicle.rackStock?.[rackId] ?? 0;
      const cap = (vehicle.spec.AMMO_RACKS.find((x) => x.id === rackId)?.capacity) || 1;
      const shown = Math.ceil((stock / cap) * rounds.length);
      rounds.forEach((r, i) => { r.visible = i < shown; });
    }
  }

  // The commander's seat rises when he goes head-out and drops when he buttons up.
  if (u.commanderSeat) {
    const target = vehicle.commanderHeadOut ? 0.30 : 0;
    u.commanderSeat.position.y += ((STATIONS.commander.seat[1] + target) - u.commanderSeat.position.y)
      * Math.min(1, dt * 3);
  }

  // Damaged optics go dark.
  if (u.visionBlocks) {
    const broken = vehicle.components?.cupola_optics?.destroyed;
    for (const b of u.visionBlocks) b.material = broken ? M.darkSteel() : M.glass();
  }
}
