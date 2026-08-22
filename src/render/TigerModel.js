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
import * as MARK from './Markings.js';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const DEG = Math.PI / 180;

// Track link thickness, and the heights of the drive sprocket and idler centres.
// A Tiger's sprocket sits noticeably higher than its road wheels, which is what
// gives the running gear its characteristic rising line at the front.
const TRACK_THICKNESS = 0.055;
const SPROCKET_Y = 0.86;
const IDLER_Y = 0.74;

/**
 * Whether plate edges get a chamfer. Off for the distant LODs, where the extra
 * nine triangles per box buy nothing.
 */
let CHAMFER = true;

/**
 * A box positioned by its centre — with its edges broken, if it is big enough
 * to be a piece of armour rather than a fitting.
 *
 * Every edge on this model was a knife edge, so nothing took an edge highlight
 * and the whole vehicle read as soft and papery under any light. Flame-cut
 * armour plate does not have sharp arrises anyway. The chamfer is a few
 * millimetres and it is the cheapest large improvement available: the rounded
 * geometry keeps the box's exact bounding size, so none of the dimensional
 * contracts move.
 */
function box(w, h, d, mtl, x = 0, y = 0, z = 0) {
  const lo = Math.min(w, h, d), hi = Math.max(w, h, d);
  let geo;
  if (CHAMFER && lo > 0.05 && hi > 0.30) {
    geo = new RoundedBoxGeometry(w, h, d, 1, Math.min(0.010, lo * 0.18));
  } else {
    geo = new THREE.BoxGeometry(w, h, d);
  }
  const m = new THREE.Mesh(geo, mtl);
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

/**
 * A weld bead: a run of overlapping beads along a plate join.
 *
 * Every armour joint on a Tiger is a visible welded seam, often with a stepped
 * or dovetailed interlock underneath it. Without them the hull is a set of
 * featureless slabs, which is what made this model read as plywood rather than
 * as a welded steel structure. They are cheap — one instanced mesh per run.
 *
 * @param {number[]} from  [x,y,z] start of the run
 * @param {number[]} to    [x,y,z] end of the run
 * @param {number} r       bead radius
 * @param {number} lod
 */
function weld(from, to, r, lod) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return null;
  const step = r * 1.5;
  const n = Math.max(2, Math.round(len / step));
  const geo = new THREE.SphereGeometry(r, lod === 0 ? 7 : 5, lod === 0 ? 5 : 3);
  const inst = new THREE.InstancedMesh(geo, M.hullDetail(), n);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    d.position.set(from[0] + dx * t, from[1] + dy * t, from[2] + dz * t);
    // Beads are laid overlapping and slightly irregular, never uniform.
    const wob = Math.sin(i * 2.7) * 0.16 + Math.cos(i * 1.3) * 0.1;
    d.scale.set(1 + wob * 0.25, 0.62 + wob * 0.2, 1 + wob * 0.25);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/**
 * A row of bolt or rivet heads along a line — hatch rims, bracket plates,
 * final-drive housings.
 */
function boltRow(from, to, count, r, lod) {
  const geo = new THREE.CylinderGeometry(r, r, r * 1.1, 6);
  const inst = new THREE.InstancedMesh(geo, M.steel(), count);
  inst.castShadow = true;
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    d.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t);
    // Heads stand proud along the plate normal, which for these runs is X or Y.
    d.rotation.set(0, 0, Math.abs(to[1] - from[1]) > Math.abs(to[0] - from[0]) ? Math.PI / 2 : 0);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

/**
 * Every visible welded seam on the hull, as one group. Positions follow the
 * plate layout in src/data/tiger1h.js, so the welds sit where the plates
 * actually meet rather than where they look nice.
 */
function buildWelds(lod) {
  const g = new THREE.Group();
  g.name = 'welds';
  const r = 0.028;
  const add = (a, b) => { const w = weld(a, b, r, lod); if (w) g.add(w); };

  const HW = L.hullHalfWU, HL = L.hullHalfL;
  const roofY = L.hullRoofY, sponY = 0.97;

  for (const sx of [-1, 1]) {
    // Superstructure side to hull roof — the long seam down each sponson.
    add([sx * HW, roofY, -HL + 0.1], [sx * HW, roofY, HL - 0.6]);
    // Superstructure side to sponson floor.
    add([sx * HW, sponY, -HL + 0.2], [sx * HW, sponY, 2.5]);
    // Side plate to the driver's front plate, up the front corner.
    add([sx * HW, sponY, 2.55], [sx * HW, roofY, 2.55]);
    // Side plate to the rear plate.
    add([sx * HW, sponY, -HL + 0.05], [sx * HW, roofY, -HL + 0.05]);
  }
  // Glacis to driver's plate, across the front.
  add([-HW, 1.70, 2.60], [HW, 1.70, 2.60]);
  // Glacis to hull roof.
  add([-HW, roofY - 0.02, 2.30], [HW, roofY - 0.02, 2.30]);
  // Nose plate to driver's plate.
  add([-HW, 1.02, 3.06], [HW, 1.02, 3.06]);
  // Rear plate to engine deck.
  add([-HW, roofY - 0.02, -HL + 0.08], [HW, roofY - 0.02, -HL + 0.08]);
  // Rear plate to lower rear plate.
  add([-L.hullHalfWL, 0.90, -HL + 0.02], [L.hullHalfWL, 0.90, -HL + 0.02]);

  return g;
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
/**
 * One road wheel. A Tiger's wheel is a painted steel disc with a bolted hub and
 * a RUBBER TYRE ON ITS RIM — not a rubber cylinder. Modelling the tyre as a
 * full-width disc turned the whole running gear into one black slab and hid
 * every wheel behind it, which is exactly what it must not do: the interleaved
 * Schachtellaufwerk is the most recognisable thing about the vehicle.
 */
function buildRoadWheel(lod, rimOnly = false) {
  const g = new THREE.Group();
  const seg = lod === 0 ? 22 : lod === 1 ? 14 : 8;

  // A Tiger road wheel is a PRESSED, DISHED STEEL DISC with a raised rim
  // flange carrying a bonded rubber tyre. Built as a flat cylinder with a
  // torus round it, it read at arm's length as painted cardboard: no dish, no
  // rim, and the tyre lost against its own shadow. Both are lathed
  // cross-sections now, so the wheel has a real profile and a silhouette that
  // survives a close-up.
  //
  // Profiles are (radius, axial) with the axial coordinate running across the
  // hull; the lathe is turned a quarter turn afterwards to put its axis on the
  // axle. Overall diameter is 0.80 m, from docs/TIGER-CONFIGURATION.md.
  const lathe = (pts, mat) => {
    let geo = new THREE.LatheGeometry(
      pts.map(([r, a]) => new THREE.Vector2(r, a)), seg);
    geo = toCreasedNormals(geo, 35 * DEG);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.z = Math.PI / 2;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  // Steel: hub boss, dished web, rim flange. Thicker at the hub, thinnest
  // across the web, standing back out to the flange — which is what makes the
  // light break across it instead of sliding over a flat plate.
  g.add(lathe([
    [0.062, -0.048], [0.112, -0.048], [0.122, -0.038], [0.200, -0.027],
    [0.300, -0.021], [0.336, -0.031], [0.352, -0.044],
    [0.352,  0.044], [0.336,  0.031], [0.300,  0.021], [0.200,  0.027],
    [0.122,  0.038], [0.112,  0.048], [0.062,  0.048],
  ], M.wheel()));

  // Rubber: a flat-faced band with chamfered shoulders, standing proud of the
  // flange. Not a doughnut — a Tiger tyre has a flat running face.
  g.add(lathe([
    [0.352, -0.045], [0.362, -0.050], [0.394, -0.050], [0.400, -0.041],
    [0.400,  0.041], [0.394,  0.050], [0.362,  0.050], [0.352,  0.045],
  ], M.rubber()));

  if (!rimOnly && lod < 2) {
    // Hub cap: a stepped cap with a domed crown, proud of the web on both
    // faces. This is the single most legible thing on a road wheel at 1 m.
    for (const sx of [-1, 1]) {
      g.add(lathe([
        [0.000, sx * 0.086], [0.040, sx * 0.086], [0.058, sx * 0.078],
        [0.064, sx * 0.062], [0.078, sx * 0.056], [0.078, sx * 0.046],
        [0.062, sx * 0.046],
      ], M.steel()));
    }
    // The bolt ring holding the wheel to its stub axle, on both faces.
    const bolts = lod === 0 ? 16 : 8;
    const boltGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.020, 6);
    const boltMesh = new THREE.InstancedMesh(boltGeo, M.steel(), bolts * 2);
    const d = new THREE.Object3D();
    let i = 0;
    for (const sx of [-1, 1]) {
      for (let b = 0; b < bolts; b++) {
        const a = (b / bolts) * Math.PI * 2 + (sx > 0 ? Math.PI / bolts : 0);
        d.position.set(sx * 0.036, Math.sin(a) * 0.150, Math.cos(a) * 0.150);
        d.rotation.set(0, 0, Math.PI / 2);
        d.updateMatrix();
        boltMesh.setMatrixAt(i++, d.matrix);
      }
    }
    boltMesh.instanceMatrix.needsUpdate = true;
    boltMesh.castShadow = true;
    g.add(boltMesh);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
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

  // Three ranks, outermost last so it draws over the ones behind it. The outer
  // rank is nearly flush with the track's inner face, which is what gives a
  // Tiger its solid wall of overlapping wheels.
  const rankOffsets = lod === 0 ? [1.14, 1.33, 1.52] : lod === 1 ? [1.20, 1.48] : [1.42];

  // One wheel is built and then instanced by cloning its group, because a
  // Tiger has forty-eight of them and they are all identical.
  const template = buildRoadWheel(lod);
  const wheels = [];

  for (let r = 0; r < rankOffsets.length; r++) {
    // Ranks are staggered by half a station, which is what makes them interleave.
    const offset = (r % 2) * spacing * 0.5;
    // Eight per rank, three ranks: the 24 road wheels a rubber-tyred Tiger I
    // carries on each side. It was 23 because the outer rank silently dropped
    // one, which is the kind of thing that is invisible until something counts.
    // NOTE: the exact axle arrangement — how many wheels ride on each of the
    // eight torsion-bar stations, and therefore how the ranks stagger — is a
    // row still marked "derive from diagram" in docs/TIGER-CONFIGURATION.md.
    const count = stations;
    for (let i = 0; i < count; i++) {
      const z = first - i * spacing - offset;
      if (Math.abs(z) > L.trackContact / 2 + 0.2) continue;
      const w = template.clone();
      w.position.set(sx * rankOffsets[r], axleY, z);
      g.add(w);
      wheels.push(w);
    }
  }

  // TORSION-BAR SUSPENSION. Eight stations per side, each a bearing boss on the
  // hull side, a trailing swing arm, and the stub axle the wheels ride on.
  // Without them the wheels hang in space against a blank slab, which is what
  // stops the running gear reading as machinery rather than as decoration.
  if (lod < 2) {
    const bossX = sx * (L.hullHalfWL + 0.03);
    for (let i = 0; i < stations; i++) {
      const z = first - i * spacing;
      // The bearing boss where the torsion bar arm passes through the hull.
      const boss = cyl(0.105, 0.115, 0.10, lod === 0 ? 14 : 8, M.hullDetail(),
        bossX, axleY + 0.16, z + 0.24);
      boss.rotation.z = Math.PI / 2;
      g.add(boss);
      // The arm itself, trailing forward and down to the axle line. A tapered
      // section, because a swing arm is a forging and not a plank.
      const armLen = Math.hypot(0.24, 0.16);
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.075, armLen, lod === 0 ? 10 : 6), M.hullDetail());
      arm.position.set(sx * (L.hullHalfWL + 0.06), axleY + 0.08, z + 0.12);
      arm.rotation.set(Math.atan2(0.24, 0.16), 0, 0);
      arm.castShadow = true;
      g.add(arm);
      // The stub axle the innermost wheel rank turns on.
      const stub = cyl(0.048, 0.048, 0.16, lod === 0 ? 10 : 6, M.steel(),
        sx * (L.hullHalfWL + 0.06), axleY, z);
      stub.rotation.z = Math.PI / 2;
      g.add(stub);
    }
  }

  // DRIVE SPROCKET. Twin toothed rings on a hub, with the track's guide horns
  // running in the gap between them and a tooth standing in every link gap.
  // Built as a hub with a cross of bars and two arc plates it had no teeth at
  // all, nothing engaged anything, and the links passed straight through it.
  const sprocketR = L.sprocketDia / 2;
  const sprocket = new THREE.Group();

  // Final drive housing: the bolted circular casing on the hull side that the
  // sprocket turns on. It is a large, prominent feature on every photograph and
  // it was entirely absent.
  const housing = cyl(0.27, 0.29, 0.16, lod === 0 ? 20 : 10, M.hullDetail(), -sx * 0.16, 0, 0);
  housing.rotation.z = Math.PI / 2;
  sprocket.add(housing);
  if (lod === 0) {
    const hb = 12;
    const hbGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.022, 6);
    const hbMesh = new THREE.InstancedMesh(hbGeo, M.steel(), hb);
    const hd = new THREE.Object3D();
    for (let i = 0; i < hb; i++) {
      const a = (i / hb) * Math.PI * 2;
      hd.position.set(-sx * 0.245, Math.sin(a) * 0.225, Math.cos(a) * 0.225);
      hd.rotation.set(0, 0, Math.PI / 2);
      hd.updateMatrix();
      hbMesh.setMatrixAt(i, hd.matrix);
    }
    hbMesh.instanceMatrix.needsUpdate = true;
    sprocket.add(hbMesh);
  }

  // Hub, and the two tooth rings either side of the guide-horn gap.
  const hub = cyl(0.17, 0.17, 0.24, lod === 0 ? 18 : 10, M.steel());
  hub.rotation.z = Math.PI / 2;
  sprocket.add(hub);

  // One tooth per link, so the pitch of the teeth is the pitch of the track.
  const wrapR = sprocketR + TRACK_THICKNESS / 2;
  const teeth = lod === 0 ? Math.round((2 * Math.PI * wrapR) / 0.135) : 11;
  const rootR = sprocketR * 0.80;
  for (const ringX of [-0.085, 0.085]) {
    const ring = cyl(rootR, rootR, 0.030, lod === 0 ? 24 : 12, M.steel());
    ring.rotation.z = Math.PI / 2;
    ring.position.x = ringX;
    sprocket.add(ring);
    if (lod < 2) {
      // Teeth as tapered blocks standing off the ring, tip just short of the
      // link centreline so each one sits in a link gap rather than through it.
      const tipR = sprocketR - TRACK_THICKNESS * 0.35;
      const tGeo = new THREE.CylinderGeometry(0.022, 0.040, tipR - rootR + 0.02, 4);
      const tMesh = new THREE.InstancedMesh(tGeo, M.steel(), teeth);
      const td = new THREE.Object3D();
      const rMid = (rootR + tipR) / 2;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        td.position.set(ringX, Math.sin(a) * rMid, Math.cos(a) * rMid);
        td.rotation.set(-a, 0, 0);
        td.updateMatrix();
        tMesh.setMatrixAt(i, td.matrix);
      }
      tMesh.instanceMatrix.needsUpdate = true;
      tMesh.castShadow = true;
      sprocket.add(tMesh);
    }
  }
  sprocket.position.set(sx * 1.30, SPROCKET_Y, L.hullHalfL - 0.42);
  sprocket.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(sprocket);

  // Idler, rear, with the track tensioner. Dished, like the road wheels.
  const idler = buildRoadWheel(lod, true);
  idler.scale.setScalar(0.84);
  idler.position.set(sx * 1.30, IDLER_Y, -(L.hullHalfL - 0.34));
  g.add(idler);

  g.userData.wheels = wheels;
  g.userData.sprocket = sprocket;
  g.userData.idler = idler;
  return g;
}

/**
 * ONE TRACK LINK of the Kgs 63/725/130 combat track.
 *
 * A single box gave a track that read as a flat black band at any distance
 * closer than twenty metres. A real link has a scalloped edge from its pin
 * bosses, a grouser bar across the ground face, and the pin ends standing proud
 * outboard — and those three things are what make a track look like a chain of
 * castings rather than a strip of tape.
 *
 * Everything is merged into ONE geometry so the whole run is still a single
 * instanced draw call. 725 mm wide, 130 mm pitch, from the configuration lock.
 */
function buildTrackLink(pitch, lod) {
  const W = L.trackWidth;
  const parts = [];
  const add = (geo, x, y, z, rx = 0) => {
    if (rx) geo.rotateX(rx);
    geo.translate(x, y, z);
    parts.push(geo);
  };

  // The link plate itself, slightly short of the pitch so the links read as
  // separate pieces rather than as one extrusion.
  // Narrower than the full 725 mm so the pin ends can stand proud of the plate
  // and still finish flush with it: the published width over tracks is the
  // OVERALL figure, pin heads included, and the tank measured 3.737 m the
  // moment they were allowed outside it.
  add(new THREE.BoxGeometry(W * 0.955, TRACK_THICKNESS * 0.78, pitch * 0.84), 0, 0, 0);

  // The grouser bar across the ground face — the thing that bites.
  add(new THREE.BoxGeometry(W * 0.92, TRACK_THICKNESS * 0.34, pitch * 0.30),
    0, -TRACK_THICKNESS * 0.44, -pitch * 0.14);

  if (lod < 2) {
    const seg = lod === 0 ? 8 : 5;
    // Pin bosses at the leading edge, the knuckles that interleave with the
    // next link. Their axis runs across the track, on the pin's own line.
    // Kept small against the plate. Built at 0.30 of the track thickness with a
    // thin plate behind them, they were the biggest thing on the link and the
    // whole run read as a chain of sausages rather than a chain of castings.
    for (const bx of [-0.26, 0, 0.26]) {
      const b = new THREE.CylinderGeometry(TRACK_THICKNESS * 0.21, TRACK_THICKNESS * 0.21, W * 0.20, seg);
      b.rotateZ(Math.PI / 2);
      b.translate(bx * W, 0, pitch * 0.42);
      parts.push(b);
    }
    // Pin ends, proud of the outer edge. These are what give the track its
    // scalloped silhouette in every photograph of a Tiger.
    for (const sxx of [-1, 1]) {
      const e = new THREE.CylinderGeometry(TRACK_THICKNESS * 0.26, TRACK_THICKNESS * 0.22, 0.018, seg);
      e.rotateZ(Math.PI / 2);
      e.translate(sxx * (W / 2 - 0.009), 0, pitch * 0.42);
      parts.push(e);
    }
  }

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged || new THREE.BoxGeometry(W, TRACK_THICKNESS, pitch * 0.94);
}

/**
 * THE TRACK LOOP.
 *
 * A Tiger has no return rollers: the upper run lies ON THE ROAD WHEEL TOPS, the
 * lower run lies flat on the ground under them, and the two are joined by
 * straight runs that are TANGENT to the drive sprocket and the idler. Get any
 * of those tangents wrong and the track leaves the wheels — which is exactly
 * what it was doing. The loop was built as four disconnected pieces with a gap
 * of about a metre at each end, and the arc-length sampler cut straight across
 * them, so links flew diagonally out below and inboard of the running gear.
 *
 * Everything below is constructed rather than eyeballed: given a point the
 * track must pass through, the tangent point on a wheel is solved for, and the
 * wrap arc runs between consecutive tangent points. Nothing floats.
 */
function trackPath() {
  const wheelR = L.roadWheelDia / 2;
  const axleY = wheelR + TRACK_THICKNESS;
  const half = TRACK_THICKNESS / 2;

  // Radii to the LINK CENTRELINE, which is what the sampler places links on.
  const sprocketR = L.sprocketDia / 2 + half;
  const idlerR = 0.34 + half;
  const frontZ = L.hullHalfL - 0.42;
  const rearZ = -(L.hullHalfL - 0.34);

  const groundY = half;                       // links resting on the ground
  const topY = axleY + wheelR + half;         // links resting on the wheel tops
  const contactFront = L.trackContact / 2;
  const contactRear = -L.trackContact / 2;
  const wheelFrontZ = 1.60;                   // where the top run first lands
  const wheelRearZ = -1.60;

  /**
   * The point at which a line drawn from P touches a circle.
   * `side` picks which of the two tangents: +1 the one reached by turning
   * anticlockwise from P->centre, -1 the other.
   */
  const tangent = (pz, py, cz, cy, r, side) => {
    const dz = cz - pz, dy = cy - py;
    const d = Math.hypot(dz, dy);
    if (d <= r) return { z: cz, y: cy };      // degenerate; should not happen
    const base = Math.atan2(dy, dz);
    // The angle at P between the line to the centre and the tangent is
    // asin(r/d), not acos. With acos the "tangent point" came out a metre off
    // the circle and the top run peaked high above the sprocket.
    const off = Math.asin(r / d);
    const a = base + side * off;
    const len = Math.sqrt(d * d - r * r);
    return { z: pz + Math.cos(a) * len, y: py + Math.sin(a) * len };
  };

  const angleOn = (t, cz, cy) => Math.atan2(t.z - cz, t.y - cy);

  // Where the track meets each wheel.
  const spFront = tangent(contactFront, groundY, frontZ, SPROCKET_Y, sprocketR, -1);
  const spRear = tangent(wheelFrontZ, topY, frontZ, SPROCKET_Y, sprocketR, 1);
  const idRear = tangent(contactRear, groundY, rearZ, IDLER_Y, idlerR, 1);
  const idFront = tangent(wheelRearZ, topY, rearZ, IDLER_Y, idlerR, -1);

  const pts = [];
  const push = (z, y) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(z - last.z, y - last.y) < 1e-6) return;
    pts.push({ z, y });
  };
  const arc = (cz, cy, r, a0, a1, steps) => {
    // Angles measured as atan2(z - cz, y - cy), so 0 is straight up.
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + d * (i / steps);
      push(cz + Math.sin(a) * r, cy + Math.cos(a) * r);
    }
  };
  const line = (a, b, steps) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      push(a.z + (b.z - a.z) * t, a.y + (b.y - a.y) * t);
    }
  };

  // Ground contact, rear to front.
  push(contactRear, groundY);
  line({ z: contactRear, y: groundY }, { z: contactFront, y: groundY }, 16);
  // Up onto the sprocket and around the front of it.
  line({ z: contactFront, y: groundY }, spFront, 3);
  arc(frontZ, SPROCKET_Y, sprocketR,
    angleOn(spFront, frontZ, SPROCKET_Y), angleOn(spRear, frontZ, SPROCKET_Y), 12);
  // Down onto the road wheel tops, back along them, and up onto the idler.
  line(spRear, { z: wheelFrontZ, y: topY }, 3);
  line({ z: wheelFrontZ, y: topY }, { z: wheelRearZ, y: topY }, 14);
  line({ z: wheelRearZ, y: topY }, idFront, 3);
  arc(rearZ, IDLER_Y, idlerR,
    angleOn(idFront, rearZ, IDLER_Y), angleOn(idRear, rearZ, IDLER_Y), 12);
  // Back down to the ground, closing the loop.
  line(idRear, { z: contactRear, y: groundY }, 3);

  const segments = [];
  let length = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b.z - a.z, b.y - a.y);
    segments.push({ a, b, d, at: length });
    length += d;
  }
  return { segments, length };
}

function sampleTrack(path, distance) {
  const d = ((distance % path.length) + path.length) % path.length;
  for (const seg of path.segments) {
    if (d <= seg.at + seg.d) {
      const t = seg.d < 1e-6 ? 0 : (d - seg.at) / seg.d;
      return {
        z: seg.a.z + (seg.b.z - seg.a.z) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
        rot: Math.atan2(seg.b.y - seg.a.y, seg.b.z - seg.a.z),
      };
    }
  }
  const last = path.segments[path.segments.length - 1];
  return { z: last.b.z, y: last.b.y, rot: 0 };
}

function buildTrack(side, lod) {
  const sx = side;
  const path = trackPath();
  const linkPitch = lod === 0 ? 0.135 : lod === 1 ? 0.22 : 0.34;
  const linkCount = Math.max(12, Math.round(path.length / linkPitch));

  const linkGeo = buildTrackLink(linkPitch, lod);
  const inst = new THREE.InstancedMesh(linkGeo, M.track(), linkCount);
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const place = (mesh, yOffset) => {
    for (let i = 0; i < linkCount; i++) {
      const p = sampleTrack(path, i * linkPitch);
      dummy.position.set(sx * 1.49, p.y + yOffset, p.z);
      dummy.rotation.set(-p.rot, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(inst, 0);

  // Guide horns: they stand between the two halves of the sprocket, and they
  // are what actually keeps a Tiger's track on.
  let horns = null;
  if (lod < 2) {
    const hornGeo = new THREE.BoxGeometry(0.055, 0.075, linkPitch * 0.5);
    horns = new THREE.InstancedMesh(hornGeo, M.track(), linkCount);
    horns.castShadow = true;
    horns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    place(horns, 0.058);
  }

  const group = new THREE.Group();
  group.add(inst);
  if (horns) group.add(horns);
  group.userData = { links: inst, horns, path, sx, linkCount, linkPitch, offset: 0 };
  return group;
}

/** The engine deck: armoured louvres, radiator hatches, and the crew's stowage. */
function buildEngineDeck(lod) {
  const g = new THREE.Group();
  const deckY = L.hullRoofY + 0.01;

  // Central engine access hatch: a raised plate with a rim, hinges and a
  // handle, not a rectangle laid on the deck.
  g.add(box(1.10, 0.05, 1.05, M.hullDark(), 0, deckY + 0.015, -2.10));
  if (lod < 2) {
    for (const dz of [-0.56, 0.56]) {
      g.add(box(1.20, 0.045, 0.06, M.hullDetail(), 0, deckY + 0.005, -2.10 + dz));
    }
    for (const dx of [-0.59, 0.59]) {
      g.add(box(0.06, 0.045, 1.16, M.hullDetail(), dx, deckY + 0.005, -2.10));
    }
    for (const hx of [-0.34, 0.34]) {
      g.add(box(0.16, 0.06, 0.10, M.steel(), hx, deckY + 0.04, -2.10 - 0.55));
    }
    const lift = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 10, Math.PI), M.steel());
    lift.position.set(0, deckY + 0.045, -2.10 + 0.42);
    lift.rotation.set(Math.PI / 2, 0, 0);
    g.add(lift);
  }

  // Four armoured air intakes, two each side, over the radiators and fans.
  //
  // These must have DEPTH. Built as flat slats lying on the deck they read as
  // painted-on stripes. The hull under them is solid, so the depth is made by
  // standing a cowl on the deck: a dark well, a frame, and the louvres across
  // the top of the frame with real gaps between them, so light gets in, shadow
  // falls on the well floor, and you can see that the tank breathes.
  for (const sx of [-1, 1]) {
    for (const z of [-1.55, -2.62]) {
      const cx = sx * 1.18;
      const W = 0.72, D = 0.80, RIM = 0.115;
      // The dark well floor and its four walls.
      g.add(box(W, 0.02, D, M.burnt(), cx, deckY + 0.012, z));
      if (lod < 2) {
        g.add(box(0.035, RIM, D, M.hullDark(), cx - W / 2, deckY + RIM / 2, z));
        g.add(box(0.035, RIM, D, M.hullDark(), cx + W / 2, deckY + RIM / 2, z));
        g.add(box(W + 0.07, RIM, 0.035, M.hullDark(), cx, deckY + RIM / 2, z - D / 2));
        g.add(box(W + 0.07, RIM, 0.035, M.hullDark(), cx, deckY + RIM / 2, z + D / 2));
        // The bolted frame flange around the opening.
        g.add(box(W + 0.14, 0.04, 0.055, M.hullDetail(), cx, deckY + 0.02, z - D / 2 - 0.04));
        g.add(box(W + 0.14, 0.04, 0.055, M.hullDetail(), cx, deckY + 0.02, z + D / 2 + 0.04));
        g.add(box(0.055, 0.04, D + 0.14, M.hullDetail(), cx - W / 2 - 0.04, deckY + 0.02, z));
        g.add(box(0.055, 0.04, D + 0.14, M.hullDetail(), cx + W / 2 + 0.04, deckY + 0.02, z));
        // Armoured louvres across the top of the well. Pitched 0.105 apart with
        // a 0.10 chord at 28 degrees, so they overlap enough to keep a grenade
        // out and still leave 17 mm of darkness visible between them.
        for (let i = 0; i < 7; i++) {
          // Painted, like the rest of the deck. In bare metal they read as
          // bright aluminium slats.
          const lv = box(W - 0.03, 0.022, 0.10, M.hullDetail(), cx, deckY + RIM - 0.012,
            z - 0.315 + i * 0.105);
          lv.rotation.x = 28 * DEG;
          g.add(lv);
        }
        // The two coarse protective ribs running across the louvres.
        for (const rx of [-0.20, 0.20]) {
          g.add(box(0.028, 0.022, D - 0.06, M.darkSteel(), cx + rx, deckY + RIM + 0.008, z));
        }
      }
    }
  }

  if (lod < 2) {
    // Air intake cowls on the centre line.
    for (const z of [-1.35, -2.85]) {
      // Painted armour, not bare machined metal. As M.steel() these read as a
      // white untextured blob sitting on the deck.
      g.add(box(0.42, 0.10, 0.34, M.hullDetail(), 0, deckY + 0.05, z));
    }
    // Tools on the deck: shovel, crowbar, axe, wire cutters, fire extinguisher.
    g.add(box(0.06, 0.05, 0.95, M.wood(), -1.62, deckY + 0.04, -1.10));      // shovel handle
    g.add(box(0.16, 0.03, 0.22, M.steel(), -1.62, deckY + 0.04, -1.66));     // shovel blade
    g.add(box(0.05, 0.05, 1.15, M.darkSteel(), 1.62, deckY + 0.04, -1.30));  // crowbar
    g.add(box(0.07, 0.06, 0.62, M.wood(), 1.48, deckY + 0.04, -2.40));       // axe
    const ext = cyl(0.05, 0.05, 0.34, 10, M.darkSteel(), -1.45, deckY + 0.06, -2.55);
    ext.rotation.x = Math.PI / 2;
    g.add(ext);                                                              // hand extinguisher
    // The 20-tonne jack and its wooden block, stowed ACROSS the rear plate.
    g.add(box(0.62, 0.16, 0.16, M.darkSteel(), 0.62, 1.30, -3.22));
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
  // The published 3.00 m overall height is measured to the top of the cupola
  // WITH THE HATCH CLOSED, so the hatch plate has to come out of the drum's
  // height rather than sit on top of it. Built the other way the tank stood
  // 3.045 m tall — inside the old test's tolerance, and caught the moment the
  // orthographic check applied a real one.
  const HATCH_T = 0.045;
  const baseY = L.turretRoofY;
  const H = L.cupolaTopY - HATCH_T - baseY;   // 0.435 m of drum

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
    new THREE.CylinderGeometry(R + 0.02, R + 0.02, HATCH_T, lod === 0 ? 20 : 10), M.turret());
  hatch.position.set(0, HATCH_T / 2, R * 0.92);
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

  // THE TURRET SHELL.
  //
  // A Tiger turret is a HORSESHOE: one continuous wall running from the flat
  // front plate down both parallel sides and round a large-radius rear, with
  // the roof let into the top of it. Built as a cylinder segment with two
  // straight boxes bolted on the front, it had a hard unchamfered crease where
  // the curve met the slab and it read in plan as a rectangle with a cylinder
  // stuck on — which is a large part of why the vehicle stopped reading as a
  // Tiger past twenty metres.
  //
  // It is now one extruded profile with a real wall thickness, so there is no
  // seam anywhere and the plan outline matches the drawing.
  const WALL = 0.085;
  const OUTER_R = 0.94;
  const FRONT_Z = 1.24;

  /**
   * The turret's plan outline, inset by `inset` metres. Built with the shape's
   * y running opposite to the vehicle's z, because the extrusion is turned a
   * quarter turn to stand it up and that flips the axis.
   */
  const turretPlan = (inset) => {
    const R = OUTER_R - inset;
    const frontY = -(FRONT_Z - inset);
    const sh = new THREE.Shape();
    sh.moveTo(-R, frontY);
    sh.lineTo(R, frontY);
    sh.lineTo(R, -0.06);
    sh.absarc(0, -0.06, R, 0, Math.PI, false);
    sh.lineTo(-R, frontY);
    return sh;
  };

  const shellShape = turretPlan(0);
  shellShape.holes.push(new THREE.Path(turretPlan(WALL).getPoints(lod === 0 ? 64 : 28).reverse()));
  const shellGeo = new THREE.ExtrudeGeometry(shellShape, {
    depth: h, bevelEnabled: false, curveSegments: lod === 0 ? 32 : 14,
  });
  shellGeo.rotateX(-Math.PI / 2);
  shellGeo.translate(0, ringY, 0);
  const shell = new THREE.Mesh(shellGeo, M.turret());
  shell.castShadow = true; shell.receiveShadow = true;
  g.add(shell);

  // Roof, let INTO the shell rather than laid on top of it like a lid.
  const roofShape = turretPlan(WALL * 0.35);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.045, bevelEnabled: false, curveSegments: lod === 0 ? 32 : 14,
  });
  roofGeo.rotateX(-Math.PI / 2);
  roofGeo.translate(0, roofY - 0.045, 0);
  const roof = new THREE.Mesh(roofGeo, M.turret());
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);

  if (lod < 2) {
    // The weld line where the roof is let into the shell, along the front and
    // down both straight sides. The rear is a curve and takes its own bead.
    const wy = roofY - 0.055;
    const rw = weld([-0.90, wy, FRONT_Z - 0.03], [0.90, wy, FRONT_Z - 0.03], 0.022, lod);
    if (rw) g.add(rw);
    for (const sx of [-1, 1]) {
      const sw = weld([sx * 0.90, wy, FRONT_Z - 0.03], [sx * 0.90, wy, -0.06], 0.022, lod);
      if (sw) g.add(sw);
    }
  }

  // ---- Mantlet (Walzenblende) --------------------------------------------
  // A Walzenblende is a CASTING, not a length of tube. Its profile steps down
  // twice on the way out to the trunnions, swells very slightly through the
  // middle, and its surface is foundry-wavy rather than machined. Built as a
  // plain capped cylinder it read as a drainpipe bolted onto the turret.
  const mantlet = new THREE.Group();
  const MHW = 0.76;                                     // half width, 1.52 m
  const MR = 0.352;                                     // radius at the middle
  const mProfile = [
    [0.000, -1.000], [0.190, -1.000], [0.240, -0.967], [0.262, -0.921],
    [0.268, -0.868], [0.300, -0.842], [0.306, -0.789], [0.338, -0.737],
    [0.348, -0.658], [0.352,  0.000], [0.348,  0.658], [0.338,  0.737],
    [0.306,  0.789], [0.300,  0.842], [0.268,  0.868], [0.262,  0.921],
    [0.240,  0.967], [0.190,  1.000], [0.000,  1.000],
  ].map(([r, a]) => new THREE.Vector2(r, a * MHW));
  let mGeo = new THREE.LatheGeometry(mProfile, lod === 0 ? 26 : 12);
  {
    // Foundry surface: low-frequency waviness of a few millimetres, applied
    // along the radius so the silhouette picks it up too. This is what
    // separates a cast component from a rolled one at a glance.
    const pos = mGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rr = Math.hypot(x, z);
      if (rr < 1e-4) continue;
      const d = (Math.sin(x * 7.3 + y * 4.1) * 0.40
               + Math.sin(y * 9.7 - z * 6.2) * 0.35
               + Math.sin(z * 11.3 + x * 5.9) * 0.25) * 0.0055;
      pos.setX(i, x + (x / rr) * d);
      pos.setZ(i, z + (z / rr) * d);
    }
  }
  // NOT computeVertexNormals(). LatheGeometry shares one vertex ring per profile
  // point, so averaging across them rounds every step in the casting away and
  // the Walzenblende comes out as a soft grey loaf. Creasing at 40 degrees keeps
  // the cylindrical body smooth and the steps, shoulders and end faces sharp,
  // which is the difference between a casting and a length of drainpipe.
  mGeo = toCreasedNormals(mGeo, 40 * DEG);
  const mCore = new THREE.Mesh(mGeo, M.mantlet());
  mCore.rotation.z = Math.PI / 2;                       // lathe axis -> across
  mCore.castShadow = true; mCore.receiveShadow = true;
  mantlet.add(mCore);
  // Trunnion stub arms, outboard of the casting and running back into the
  // turret cheeks. Around 200 mm of steel — the thickest on the tank.
  for (const sx of [-1, 1]) {
    const arm = cyl(0.135, 0.135, 0.20, lod === 0 ? 14 : 8, M.mantlet(), sx * 0.80, 0, -0.06);
    arm.rotation.z = Math.PI / 2;
    mantlet.add(arm);
  }
  // Projecting about 0.31 m ahead of the turret front plate. At 1.36 it stood
  // 0.47 m proud and read as a separate pod hung on the front of the turret.
  mantlet.position.set(0, L.trunnionY, 1.20);

  if (lod < 2) {
    // The raised collar the tube passes through, standing proud of the face.
    const collar = cyl(0.118, 0.152, 0.14, lod === 0 ? 16 : 9, M.mantlet(), 0, 0, 0.30);
    collar.rotation.x = Math.PI / 2;
    mantlet.add(collar);

    // TWO sight apertures — the binocular TZF 9b, about 190 mm apart, both on
    // the gunner's side of the gun. A monocular TZF 9c tank has one, and this
    // is the single easiest way to date a Tiger in a photograph.
    // They are dark recessed slots under a brow, not pipes: an aperture that
    // sticks out of the armour reads as plumbing.
    for (const ax of [-0.42, -0.23]) {
      const ay = 0.04;
      const az = Math.sqrt(Math.max(0.01, MR * MR - ay * ay));
      mantlet.add(box(0.072, 0.052, 0.07, M.darkSteel(), ax, ay, az - 0.030));
      mantlet.add(box(0.098, 0.016, 0.055, M.mantlet(), ax, ay + 0.046, az + 0.004));
    }
    // Coaxial MG 34 port, on the loader's side of the gun.
    const my = -0.02;
    const mz = Math.sqrt(Math.max(0.01, MR * MR - my * my));
    const mgPort = cyl(0.052, 0.052, 0.09, 10, M.darkSteel(), 0.26, my, mz - 0.035);
    mgPort.rotation.x = Math.PI / 2;
    mantlet.add(mgPort);
    const mgBarrel = cyl(0.017, 0.017, 0.26, 8, M.darkSteel(), 0.26, my, mz + 0.10);
    mgBarrel.rotation.x = Math.PI / 2;
    mantlet.add(mgBarrel);
    // The flange along the bottom edge of the casting.
    mantlet.add(box(1.28, 0.05, 0.15, M.mantlet(), 0, -0.332, 0.09));
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
  const barrel = cyl(0.062, 0.078, barrelLen, lod === 0 ? 24 : 10, M.barrel(),
    0, 0, barrelStart + barrelLen / 2);
  barrel.rotation.x = Math.PI / 2;
  gunGroup.add(barrel);

  // THE RECOIL SLEEVE. The tube does not emerge from the mantlet at its
  // finished diameter — it comes out inside a much fatter jacket and steps down
  // to the tube about a third of the way along. Without it the 8.8 is a
  // constant-diameter pipe, and a constant-diameter pipe is what every
  // long-gunned tank looks like. The step is one of the clearest things in a
  // side-on photograph of a Tiger.
  const sleeveLen = 0.62;
  const sleeve = cyl(0.092, 0.112, sleeveLen, lod === 0 ? 20 : 10, M.gunSteel(),
    0, 0, barrelStart + sleeveLen / 2 - 0.06);
  sleeve.rotation.x = Math.PI / 2;
  gunGroup.add(sleeve);
  if (lod < 2) {
    // The step ring where the sleeve ends and the tube runs on.
    const step = cyl(0.086, 0.094, 0.035, lod === 0 ? 20 : 10, M.gunSteel(),
      0, 0, barrelStart + sleeveLen - 0.06);
    step.rotation.x = Math.PI / 2;
    gunGroup.add(step);
  }
  // ---- The double-baffle muzzle brake ------------------------------------
  // The Tiger's silhouette signature, and it has to be real geometry: a mount
  // collar, two chambers with open ports out of each side, and an end cap. A
  // plain black cylinder made the 88 read as any long-barrelled gun.
  const brake = new THREE.Group();
  const seg = lod === 0 ? 16 : 9;
  const bz = barrelEnd;

  // Mount collar where it screws onto the tube.
  const collar = cyl(0.098, 0.098, 0.055, seg, M.gunSteel(), 0, 0, bz + 0.028);
  collar.rotation.x = Math.PI / 2;
  brake.add(collar);

  // The brake BODY. It was built as a pair of thin top and bottom slabs with
  // open sides, which from any distance reads as two bars and a gap — the
  // muzzle brake, the signature of the 8.8 cm KwK 36, effectively disappeared
  // and a critic reported the gun as having none at all. It is a solid body
  // now, with the blast ports cut into its sides as recesses, which reads
  // correctly from every angle.
  const bodyLen = BRAKE_LEN - 0.075;
  const body = cyl(0.108, 0.112, bodyLen, seg, M.gunSteel(), 0, 0, bz + 0.055 + bodyLen / 2);
  body.rotation.x = Math.PI / 2;
  brake.add(body);

  const chamberLen = (BRAKE_LEN - 0.075) / 2;
  for (let c = 0; c < 2; c++) {
    const z0 = bz + 0.055 + c * (chamberLen + 0.008);
    // The dividing web between the two chambers, standing proud.
    const web = cyl(0.118, 0.118, 0.020, seg, M.gunSteel(), 0, 0, z0 + chamberLen - 0.01);
    web.rotation.x = Math.PI / 2;
    brake.add(web);
    if (lod < 2) {
      // The blast ports, angled back the way the gases actually leave.
      for (const sxx of [-1, 1]) {
        const port = box(0.030, 0.115, chamberLen * 0.62, M.darkSteel(),
          sxx * 0.098, 0, z0 + chamberLen * 0.42);
        port.rotation.y = sxx * 0.16;
        brake.add(port);
      }
    }
  }

  // The bore running through the whole brake, and the end cap.
  const bore = cyl(0.050, 0.050, BRAKE_LEN, seg, M.gunSteel(), 0, 0, bz + BRAKE_LEN / 2);
  bore.rotation.x = Math.PI / 2;
  brake.add(bore);
  const cap = new THREE.Mesh(new THREE.RingGeometry(0.050, 0.112, seg), M.gunSteel());
  cap.position.set(0, 0, bz + BRAKE_LEN);
  brake.add(cap);

  brake.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  gunGroup.add(brake);
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
    // Smoke candle dischargers, three per side, on a common bracket. Deletion
    // was ordered around June 1943 after they caused fires; 503's Tigers still
    // carried them. They must stand PROUD of the turret side — modelled flush
    // they read as three black holes punched through the armour.
    for (const sx of [-1, 1]) {
      const bracket = box(0.05, 0.10, 0.44, M.hullDetail(), sx * 0.95, L.trunnionY + 0.26, 0.50);
      g.add(bracket);
      for (let i = 0; i < 3; i++) {
        const z = 0.64 - i * 0.14;
        const tube = cyl(0.036, 0.036, 0.19, lod === 0 ? 10 : 6, M.gunSteel(),
          sx * 1.05, L.trunnionY + 0.34, z);
        tube.rotation.z = sx * 26 * DEG;
        g.add(tube);
        // The cap on top of each candle.
        const capY = L.trunnionY + 0.34 + Math.cos(26 * DEG) * 0.10;
        const cap = cyl(0.040, 0.040, 0.022, lod === 0 ? 10 : 6, M.steel(),
          sx * (1.05 + Math.sin(26 * DEG) * 0.10), capY, z);
        cap.rotation.z = sx * 26 * DEG;
        g.add(cap);
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

    // Hull MG 34 in its Kugelblende 50 ball mount, front-right. The ball is
    // SEATED IN A COLLAR, not stuck on the plate: modelled as a bare sphere it
    // read as a debug primitive half-sunk in the glacis.
    const mgZ = L.hullHalfL - 0.06;
    const collar = cyl(0.145, 0.165, 0.10, lod === 0 ? 16 : 8, M.cast(6), 0.63, 1.38, mgZ);
    collar.rotation.x = Math.PI / 2 - 9 * DEG;
    g.add(collar);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, lod === 0 ? 14 : 8, lod === 0 ? 10 : 6), M.cast(8));
    ball.position.set(0.63, 1.38, mgZ + 0.03);
    g.add(ball);
    // The barrel emerges from the ball's own axis, and wears a jacket.
    const mgJacket = cyl(0.030, 0.030, 0.16, 8, M.gunSteel(), 0.63, 1.38, mgZ + 0.14);
    mgJacket.rotation.x = Math.PI / 2;
    g.add(mgJacket);
    const mg = cyl(0.019, 0.019, 0.34, 8, M.gunSteel(), 0.63, 1.38, mgZ + 0.34);
    mg.rotation.x = Math.PI / 2;
    g.add(mg);
    if (lod === 0) g.add(boltRow([0.46, 1.38, mgZ], [0.80, 1.38, mgZ], 2, 0.013, lod));

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
  // They must read as HATCHES: a raised rim standing off the roof plate, a
  // domed lid with a grab handle, a hinge arm and a ring of bolts. Drawn as
  // flush discs they were invisible, and a tank with no way in reads as a prop.
  const hatches = {};
  for (const [name, sx] of [['driver_hatch', -1], ['radio_hatch', 1]]) {
    const hx = sx * 1.16, hz = 2.42;
    // The armoured rim, welded proud of the roof.
    const rim = cyl(0.335, 0.345, 0.055, lod === 0 ? 20 : 10, M.hullDetail(), hx, y + 0.028, hz);
    g.add(rim);
    if (lod === 0) {
      // The weld holding the rim to the roof, and its bolt ring.
      const n = 14;
      const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.016, 6);
      const inst = new THREE.InstancedMesh(boltGeo, M.steel(), n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        d.position.set(hx + Math.sin(a) * 0.375, y + 0.03, hz + Math.cos(a) * 0.375);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    const pivot = new THREE.Group();
    pivot.position.set(hx, y + 0.055, hz);
    // The lid: dished, with a raised centre boss and a grab handle.
    const lid = cyl(0.31, 0.30, 0.05, lod === 0 ? 20 : 10, M.hull(), -sx * 0.30, 0.025, 0);
    pivot.add(lid);
    if (lod < 2) {
      pivot.add(cyl(0.10, 0.10, 0.03, lod === 0 ? 12 : 6, M.hull(), -sx * 0.30, 0.062, 0));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 10, Math.PI), M.steel());
      handle.position.set(-sx * 0.30, 0.075, 0);
      handle.rotation.set(Math.PI / 2, 0, 0);
      pivot.add(handle);
      // The pivot arm the hatch swings out on.
      pivot.add(box(0.10, 0.05, 0.05, M.steel(), -sx * 0.10, 0.02, 0));
    }
    pivot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
  // Run the full length, front plate to rear plate: they used to stop short at
  // both ends and the hull had a gap in it.
  for (const sx of [-1, 1]) {
    g.add(box(0.08, 0.78, 5.90, M.hull(), sx * L.hullHalfWU, 1.36, -0.21));
  }
  // 60 mm lower tub sides, matching the tub they belong to.
  for (const sx of [-1, 1]) {
    g.add(box(0.06, 0.56, L.hullLength - 0.30, M.hullLower(), sx * L.hullHalfWL, 0.75, 0));
  }

  if (lod < 2) {
    // The mudguard: ONE continuous run per side sitting just clear of the top
    // of the track, with a turned-down outer lip and brackets carrying it off
    // the hull. Built as four separate floating plates it read as a row of
    // detached paddles hanging off the side of the tank.
    const fenderY = L.roadWheelDia + TRACK_THICKNESS * 2 + 0.06;
    for (const sx of [-1, 1]) {
      const run = box(0.70, 0.022, 5.55, M.hullDetail(), sx * 1.50, fenderY, 0.05);
      g.add(run);
      // The turned-down outer lip, flush with the outer face of the track.
      g.add(box(0.020, 0.085, 5.55, M.hullDetail(), sx * 1.842, fenderY - 0.042, 0.05));
      // Front and rear mudflap sections, hinged and angled down.
      for (const [z, tilt] of [[2.98, 0.42], [-2.86, -0.42]]) {
        const flap = box(0.70, 0.020, 0.62, M.hullDetail(), sx * 1.50, fenderY - 0.10, z);
        flap.rotation.x = tilt;
        g.add(flap);
      }
      // Support brackets off the hull side, which is what stops it reading as
      // a plate floating in space.
      for (let i = 0; i < 6; i++) {
        const z = 2.45 - i * 0.98;
        g.add(box(0.30, 0.045, 0.05, M.hullDetail(), sx * 1.62, fenderY - 0.035, z));
        g.add(box(0.05, 0.16, 0.05, M.hullDetail(), sx * 1.755, fenderY - 0.10, z));
      }
    }

    // The two 30 mm tow cables. A Tiger carried them clipped flat along the
    // sponson sides with the eyes at each end, not coiled into a hoop.
    for (const sx of [-1, 1]) {
      const x = sx * (L.hullHalfWU + 0.035);
      // ONE continuous run. Built as three separate cylinders with gaps between
      // them it read as a string of beads laid along the sponson rather than as
      // a cable. The sag is put in by splitting it into segments that share
      // their ends, so the run is unbroken.
      const SEGS = lod === 0 ? 8 : 4;
      const z0 = 2.02, z1 = -2.02;
      for (let i = 0; i < SEGS; i++) {
        const ta = i / SEGS, tb = (i + 1) / SEGS;
        const sag = (t) => 1.06 - Math.sin(t * Math.PI) * 0.022;
        const za = z0 + (z1 - z0) * ta, zb = z0 + (z1 - z0) * tb;
        const ya = sag(ta), yb = sag(tb);
        const len = Math.hypot(zb - za, yb - ya);
        const run = cyl(0.018, 0.018, len, lod === 0 ? 8 : 5, M.darkSteel(),
          x, (ya + yb) / 2, (za + zb) / 2);
        run.rotation.x = Math.PI / 2 - Math.atan2(yb - ya, zb - za);
        g.add(run);
      }
      // Cable eyes, spliced at both ends.
      for (const z of [2.02, -2.02]) {
        const eye = new THREE.Mesh(
          new THREE.TorusGeometry(0.075, 0.020, 6, lod === 0 ? 14 : 8), M.steel());
        eye.rotation.y = Math.PI / 2;
        eye.position.set(x, 1.06, z);
        g.add(eye);
      }
      // The clips that hold it to the hull.
      for (const z of [1.9, 0.65, -0.65, -1.9]) {
        g.add(box(0.05, 0.09, 0.05, M.steel(), sx * (L.hullHalfWU - 0.01), 1.06, z));
      }
    }
    // Cleaning rod tube on the left fender.
    const tube = cyl(0.045, 0.045, 1.65, 8, M.steel(), -1.52, L.sponsonFloorY + 0.50, -0.60);
    tube.rotation.x = Math.PI / 2;
    g.add(tube);
  }
  return g;
}

/**
 * UNIT MARKINGS.
 *
 * s.Pz.Abt. 503 at Zitadelle carried a Balkenkreuz on the hull sides and rear
 * and a large white-outline "S"-number on the turret sides. Our tank is S13 —
 * "Tiger 101" is the radio callsign and was never painted on anything.
 *
 * They go on last, as decals sitting a few millimetres proud of the armour,
 * because the hull is built from sixty separate boxes and there is no single
 * UV space to paint into. Placement has to dodge the fittings that are already
 * there: the tow cables on the sponson, the spare track links and the smoke
 * dischargers on the turret side, the exhausts and the jack on the rear plate.
 */
function buildMarkings(lod, turmNummer) {
  const g = new THREE.Group();
  g.name = 'markings';
  if (lod > 1) return g;                       // not legible at distance anyway

  const kreuz = MARK.balkenkreuz();
  const nummer = MARK.turmNummer(turmNummer);

  if (kreuz) {
    // Hull sides, on the 80 mm superstructure plate, above the tow cable run
    // and behind the driver's vision. Outer face of that plate is at 1.8135.
    const sideX = L.hullHalfWU + 0.045;
    for (const sx of [-1, 1]) {
      const d = MARK.flatDecal(kreuz, 0.42, 0.42, sx * sideX, 1.47, -1.55,
        sx > 0 ? '+x' : '-x');
      if (d) g.add(d);
    }
    // Rear plate, on the centre line between the two exhaust stacks. The plate
    // leans back 8 degrees, so the decal has to lean with it or it stands off
    // the armour at one edge and sinks into it at the other.
    const rear = MARK.flatDecal(kreuz, 0.34, 0.34, 0, 1.226, -3.183, '-z');
    if (rear) { rear.rotation.set(8 * DEG, Math.PI, 0); g.add(rear); }
  }

  if (nummer) {
    // Turret sides. Wrapped onto the horseshoe: a flat plane laid on a 0.94 m
    // radius sinks 4 cm into the armour at its corners. Sits above the spare
    // track links (top at 2.04) and behind the smoke discharger bracket.
    for (const th of [Math.PI / 2 + 0.42, -(Math.PI / 2 + 0.42)]) {
      const d = MARK.curvedDecal(nummer, 0.955, 0.52, 0.26, th, 2.19, 0.06);
      if (d) g.add(d);
    }
  }
  return g;
}

/**
 * Build a Tiger I Ausf. H.
 * @param {object} opts { lod: 0|1|2, feifel: boolean, turmNummer: string }
 */
export function buildTiger(opts = {}) {
  const lod = opts.lod ?? 0;
  CHAMFER = lod === 0;
  const root = new THREE.Group();
  root.name = 'TigerIAusfH';

  // ---- Lower hull tub ------------------------------------------------------
  root.add(box(L.hullWidthLower, 0.55, L.hullLength - 0.30, M.hullLower(), 0, 0.75, 0));
  root.add(box(L.hullWidthLower, 0.05, L.hullLength - 0.30, M.hullLower(), 0, L.hullFloorY, 0));

  // ---- Superstructure box --------------------------------------------------
  // Spans from the driver's plate all the way back to the rear plate. It was
  // 5.05 m centred at +0.18, which stopped 0.8 m short of the back of the tank
  // and left a hole you could see daylight through — invisible in every shaded
  // render and obvious the moment the silhouette was rendered.
  root.add(box(L.hullWidthUpper - 0.16, 0.78, 5.86, M.hull(), 0, 1.36, -0.226));

  // ---- Rear plate ----------------------------------------------------------
  // Positioned so the plate's OUTER FACE lands at exactly -L.hullHalfL, because
  // the published 6.316 m hull length is an outside dimension. The plate leans
  // back 8 degrees, so half its thickness projects 0.0396 m along -Z.
  const rear = plate(L.hullWidthUpper, 0.95, 0.08, M.hull(), 0, 1.22, -(L.hullHalfL - 0.0396), 8 * DEG);
  root.add(rear);
  root.add(plate(L.hullWidthLower, 0.42, 0.08, M.hullLower(), 0, 0.66, -(L.hullHalfL - 0.10), -20 * DEG));

  if (lod < 2) root.add(buildWelds(lod));
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

  // ---- Unit markings -------------------------------------------------------
  // The turret number belongs to the turret and traverses with it; the crosses
  // belong to the hull.
  const marks = buildMarkings(lod, opts.turmNummer || 'S13');
  const turretMarks = marks.children.filter((c) => c.geometry?.type === 'CylinderGeometry');
  for (const t of turretMarks) turret.add(t);
  root.add(marks);

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

  // ---- HANDEDNESS ---------------------------------------------------------
  // Every literal above is written in the authoring convention "+X is the
  // crew's right". With forward along +Z and up along +Y that is a LEFT-handed
  // frame, and three.js is right-handed, so the tank rendered mirrored: in an
  // orthographic front view the bow machine gun sat on the viewer's right where
  // the driver's visor belongs, and the cupola was on the wrong side of the
  // roof. src/data/tiger1h.js mirrors the vehicle data once for the same
  // reason; this is the matching mirror for the geometry, so the two agree.
  //
  // three.js handles a negative determinant correctly — it flips the winding
  // for face culling and the normal matrix takes care of the lighting. What it
  // does NOT do is flip rotations, and a mirror conjugates them: rotations
  // about Y and Z come out reversed under it, rotations about X do not. Every
  // animated Y or Z rotation below is negated to compensate, and that is the
  // whole of the cost.
  root.scale.x = -1;

  return root;
}

/**
 * Animate a built Tiger from a Vehicle's state.
 * Turret azimuth, gun elevation, recoil, hatches, track motion and road wheels.
 */
export function updateTiger(model, vehicle, dt) {
  const u = model.userData;
  if (!u) return;

  // Negated: the model root is mirrored (see buildTiger), and a mirror reverses
  // rotations about Y. Without this the turret traverses the wrong way.
  u.turret.rotation.y = -(vehicle.turretAz || 0);
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
    // Negated with the mirror, as above, or the hatch hinges the wrong way.
    const lt = -target;
    u.loaderHatch.rotation.z += (lt - u.loaderHatch.rotation.z) * Math.min(1, dt * 4);
  }
  for (const [name, pivot] of Object.entries(u.hullHatches || {})) {
    const target = vehicle.hatchOpen?.[name] ? 85 * DEG : 0;
    const sign = name === 'driver_hatch' ? 1 : -1;
    pivot.rotation.z += (-target * sign - pivot.rotation.z) * Math.min(1, dt * 3.5);
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

/**
 * Scroll the track around its loop at the speed the track is actually running.
 * Because the path is arc-length parameterised, advancing every link by the
 * same distance keeps them evenly pitched all the way round — including through
 * the sprocket and idler wraps, where the previous version scattered them.
 */
function animateTrack(group, speed, dt, broken) {
  const d = group.userData;
  if (!d?.links) return;

  if (broken) {
    // A thrown track does not scroll. It sags off the running gear and lies in
    // the mud, and it stays visible because it is still there.
    if (!d.brokenApplied) {
      d.brokenApplied = true;
      for (const mesh of [d.links, d.horns]) {
        if (!mesh) continue;
        const yOff = mesh === d.horns ? 0.058 : 0;
        for (let i = 0; i < d.linkCount; i++) {
          const p = sampleTrack(d.path, i * d.linkPitch);
          // Everything above the wheels drops; the ground run stays put.
          const sag = p.y > 0.35 ? Math.min(p.y - 0.06, 0.55) : 0;
          _dummy.position.set(
            d.sx * 1.49 + (Math.random() - 0.5) * 0.10,
            p.y - sag + yOff,
            p.z + (Math.random() - 0.5) * 0.12);
          _dummy.rotation.set(-p.rot + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.2);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return;
  }

  if (d.brokenApplied) d.brokenApplied = false;
  if (Math.abs(speed) < 0.02) return;

  d.offset = (d.offset + speed * dt) % d.path.length;
  for (const mesh of [d.links, d.horns]) {
    if (!mesh) continue;
    const yOff = mesh === d.horns ? 0.058 : 0;
    for (let i = 0; i < d.linkCount; i++) {
      const p = sampleTrack(d.path, i * d.linkPitch + d.offset);
      _dummy.position.set(d.sx * 1.49, p.y + yOff, p.z);
      _dummy.rotation.set(-p.rot, 0, 0);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
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

  // The published length is muzzle to the rear armour plate, and the hull's
  // 6.316 m is an outside dimension, so the reference is simply the back of the
  // hull. The Feifel cylinders hang off behind it and are reported separately.
  const hullRearZ = -L.hullHalfL;
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
