// ===========================================================================
//  THE COMMAND TENT
//
//  The mission does not begin beside the Tiger. It begins here, in a canvas
//  tent with a sand table, a map board, a field telephone and an officer who
//  tells you what battalion thinks is out there — which is not the same as what
//  is out there.
//
//  The sand table is a real, buildable object: the mission's terrain rendered
//  in miniature with markers on it, so studying it is studying the actual
//  ground you are about to fight over.
// ===========================================================================

import * as THREE from 'three';
import { M } from '../render/Materials.js';
import { buildFigure, poseFigure } from '../render/CrewModels.js';
import { clamp01 } from '../core/MathUtil.js';

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

/**
 * Build a miniature of the mission terrain in a wooden frame.
 * The heights come from the same Terrain object the battle uses, so what the
 * commander studies is genuinely the ground he will fight on.
 */
function buildSandTable(terrain, mission, opts = {}) {
  const g = new THREE.Group();
  g.name = 'sand_table';
  const size = 2.4;                        // metres of table
  const height = 0.90;
  const scale = size / terrain.size;       // world metres -> table metres

  // Trestle frame.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(box(0.09, height, 0.09, frameMat, x * (size / 2 - 0.1), height / 2, z * (size / 2 - 0.1)));
  }
  g.add(box(size + 0.12, 0.07, size + 0.12, frameMat, 0, height, 0));
  // Retaining rim.
  for (const [dx, dz, w, d] of [[0, 1, size, 0.08], [0, -1, size, 0.08], [1, 0, 0.08, size], [-1, 0, 0.08, size]]) {
    g.add(box(w, 0.10, d, frameMat, dx * size / 2, height + 0.08, dz * size / 2));
  }

  // ---- The terrain surface ------------------------------------------------
  const res = 56;
  const geo = new THREE.PlaneGeometry(size, size, res - 1, res - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const vScale = 0.055;                   // vertical exaggeration, as a real sand table has

  for (let i = 0; i < pos.count; i++) {
    const tx = pos.getX(i) / scale;
    const tz = pos.getZ(i) / scale;
    const h = terrain.heightAt(tx, tz);
    pos.setY(i, h * scale * (vScale / scale) * 0.9 + 0.02);

    // Colour by ground type, the way a sand table is dressed with sawdust and paint.
    const ground = terrain.groundAt(tx, tz);
    let c = [0.72, 0.64, 0.45];                                  // sand / field
    if (ground === 'wood') c = [0.24, 0.33, 0.17];
    else if (ground === 'village') c = [0.55, 0.45, 0.36];
    else if (ground === 'track') c = [0.62, 0.55, 0.42];
    else if (ground === 'mud') c = [0.36, 0.30, 0.22];
    // Shade the high ground so ridges read at a glance.
    const shade = 0.82 + clamp01((h + 12) / 34) * 0.35;
    colors[i * 3] = c[0] * shade;
    colors[i * 3 + 1] = c[1] * shade;
    colors[i * 3 + 2] = c[2] * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const surface = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  surface.position.y = height + 0.04;
  surface.receiveShadow = true;
  g.add(surface);
  g.userData.surface = surface;
  g.userData.scale = scale;
  g.userData.tableY = height + 0.04;

  // ---- Markers ------------------------------------------------------------
  // Little wooden blocks and flags, as they actually used. Blue for us, red for
  // them, and the red ones are only where somebody REPORTED something.
  const markers = new THREE.Group();
  markers.name = 'markers';
  const toTable = (wx, wz, y = 0.03) => new THREE.Vector3(wx * scale, height + 0.04 + y, wz * scale);

  const blue = new THREE.MeshStandardMaterial({ color: 0x2a5a9a, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9a2a2a, roughness: 0.7 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xb08830, roughness: 0.7 });

  g.userData.addMarker = (wx, wz, kind, label) => {
    const mat = kind === 'friendly' ? blue : kind === 'objective' ? amber : red;
    const m = box(0.055, 0.030, 0.075, mat);
    m.position.copy(toTable(wx, wz, 0.015));
    m.userData = { kind, label, worldX: wx, worldZ: wz };
    markers.add(m);
    // A pin flag so it reads from across the table.
    const pin = cyl(0.004, 0.004, 0.09, 4, M.darkSteel());
    pin.position.copy(toTable(wx, wz, 0.06));
    markers.add(pin);
    const flag = box(0.045, 0.028, 0.003, mat);
    flag.position.copy(toTable(wx, wz, 0.095));
    flag.position.x += 0.022;
    markers.add(flag);
    return m;
  };
  g.add(markers);
  g.userData.markers = markers;

  // Named terrain features get a small card.
  for (const lm of terrain.landmarks().slice(0, 8)) {
    const card = box(0.10, 0.002, 0.045, new THREE.MeshStandardMaterial({ color: 0xd8d0b8 }));
    card.position.copy(toTable(lm.x, lm.z, 0.008));
    card.userData = { kind: 'landmark', label: lm.name };
    markers.add(card);
  }

  // ---- Table furniture ----------------------------------------------------
  // A ruler, dividers, a grease pencil and a map case, because officers had them.
  g.add(box(0.42, 0.006, 0.03, new THREE.MeshStandardMaterial({ color: 0xc8b890 }),
    -0.75, height + 0.09, 0.85));
  g.add(cyl(0.005, 0.005, 0.13, 5, M.darkSteel(), -0.55, height + 0.12, 0.90));
  g.add(box(0.30, 0.035, 0.22, new THREE.MeshStandardMaterial({ color: 0x4a3a28 }),
    0.80, height + 0.11, 0.82));

  return g;
}

/** The map board on its easel, with the operational overlay. */
function buildMapBoard() {
  const g = new THREE.Group();
  g.name = 'map_board';
  const easel = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    const leg = cyl(0.03, 0.03, 2.0, 5, easel, sx * 0.55, 1.0, 0.25);
    leg.rotation.x = 12 * DEG;
    g.add(leg);
  }
  const board = box(1.5, 1.1, 0.04, new THREE.MeshStandardMaterial({ color: 0xd9cfae, roughness: 1 }),
    0, 1.45, 0);
  board.rotation.x = -12 * DEG;
  g.add(board);
  g.userData.board = board;

  // Grid lines and a couple of chinagraph arrows drawn on the overlay.
  const ink = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 1 });
  for (let i = 1; i < 6; i++) {
    const l = box(1.44, 0.004, 0.006, ink, 0, 1.45 - 0.5 + i * 0.17, 0.023);
    l.rotation.x = -12 * DEG;
    g.add(l);
    const v = box(0.006, 1.04, 0.004, ink, -0.72 + i * 0.24, 1.45, 0.023);
    v.rotation.x = -12 * DEG;
    g.add(v);
  }
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x2a5a9a });
  const arrow = box(0.60, 0.020, 0.006, arrowMat, -0.10, 1.40, 0.026);
  arrow.rotation.set(-12 * DEG, 0, 22 * DEG);
  g.add(arrow);
  const enemyMark = box(0.28, 0.018, 0.006, new THREE.MeshStandardMaterial({ color: 0x9a2a2a }),
    0.30, 1.62, 0.026);
  enemyMark.rotation.x = -12 * DEG;
  g.add(enemyMark);

  return g;
}

/** The logistics board — what the company actually has left. */
function buildLogisticsBoard() {
  const g = new THREE.Group();
  g.name = 'logistics_board';
  g.add(cyl(0.035, 0.035, 1.9, 5, M.wood(), 0, 0.95, 0));
  const board = box(1.05, 0.75, 0.03,
    new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 1 }), 0, 1.55, 0);
  g.add(board);
  // Chalk lines.
  const chalk = new THREE.MeshStandardMaterial({ color: 0xd8d8cc });
  for (let i = 0; i < 6; i++) {
    g.add(box(0.55 + Math.random() * 0.3, 0.012, 0.004, chalk, -0.16, 1.82 - i * 0.11, 0.018));
  }
  g.userData.board = board;
  return g;
}

/**
 * Build the whole command post.
 * @param {Terrain} terrain
 * @param {object} mission
 * @param {Rng} rng
 */
export function buildBriefingTent(terrain, mission, rng, opts = {}) {
  const g = new THREE.Group();
  g.name = 'briefing_tent';

  // ---- The tent -----------------------------------------------------------
  const W = 9, D = 11, WALL = 2.1, RIDGE = 3.6;
  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0x8f8a6a, roughness: 1, side: THREE.DoubleSide,
  });

  // Side walls.
  for (const sx of [-1, 1]) {
    g.add(box(0.06, WALL, D, canvasMat, sx * W / 2, WALL / 2, 0));
  }
  // Back wall, and a front wall with a door flap gap.
  g.add(box(W, WALL, 0.06, canvasMat, 0, WALL / 2, -D / 2));
  for (const sx of [-1, 1]) {
    g.add(box(W / 2 - 1.0, WALL, 0.06, canvasMat, sx * (W / 4 + 0.5), WALL / 2, D / 2));
  }
  // Ridge roof.
  const slopeLen = Math.hypot(W / 2, RIDGE - WALL);
  for (const sx of [-1, 1]) {
    const r = box(slopeLen, 0.06, D + 0.4, canvasMat, sx * W / 4, (WALL + RIDGE) / 2, 0);
    r.rotation.z = sx * -Math.atan2(RIDGE - WALL, W / 2);
    g.add(r);
  }
  // Ridge pole and uprights.
  g.add(box(0.10, 0.10, D, M.wood(), 0, RIDGE, 0));
  for (const z of [-D / 2 + 0.4, 0, D / 2 - 0.4]) {
    g.add(cyl(0.06, 0.06, RIDGE, 6, M.wood(), 0, RIDGE / 2, z));
  }
  // Guy ropes.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const rope = cyl(0.012, 0.012, 2.6, 4, M.darkSteel(),
        sx * (W / 2 + 0.9), 1.0, -D / 2 + 1.2 + i * (D / 4));
      rope.rotation.z = sx * 32 * DEG;
      g.add(rope);
    }
  }
  // A trodden earth floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  g.add(floor);

  // ---- Furniture ----------------------------------------------------------
  const sandTable = buildSandTable(terrain, mission, opts);
  sandTable.position.set(0, 0, -0.6);
  g.add(sandTable);
  g.userData.sandTable = sandTable;

  const mapBoard = buildMapBoard();
  mapBoard.position.set(-3.1, 0, -3.6);
  mapBoard.rotation.y = 32 * DEG;
  g.add(mapBoard);
  g.userData.mapBoard = mapBoard;

  const logBoard = buildLogisticsBoard();
  logBoard.position.set(3.2, 0, -3.4);
  logBoard.rotation.y = -34 * DEG;
  g.add(logBoard);
  g.userData.logisticsBoard = logBoard;

  // A field table with the radio set and the field telephone.
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 });
  const desk = new THREE.Group();
  desk.add(box(1.7, 0.06, 0.75, deskMat, 0, 0.78, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    desk.add(box(0.07, 0.78, 0.07, deskMat, x * 0.78, 0.39, z * 0.30));
  }
  // Feldfernsprecher 33 field telephone in its bakelite case.
  desk.add(box(0.26, 0.15, 0.20, new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.7 }),
    -0.45, 0.88, 0));
  desk.add(cyl(0.022, 0.022, 0.18, 6, M.darkSteel(), -0.45, 1.02, 0.05));
  // Paperwork, a lamp, a mug.
  desk.add(box(0.30, 0.012, 0.22, new THREE.MeshStandardMaterial({ color: 0xd8d0b8 }), 0.20, 0.82, 0.05));
  const lamp = cyl(0.09, 0.05, 0.20, 8,
    new THREE.MeshStandardMaterial({ color: 0xffe8b0, emissive: 0x554020, roughness: 0.5 }), 0.62, 0.92, -0.15);
  desk.add(lamp);
  desk.position.set(3.0, 0, 1.6);
  desk.rotation.y = -50 * DEG;
  g.add(desk);
  g.userData.desk = desk;
  g.userData.lamp = lamp;

  // Folding stools.
  for (let i = 0; i < 4; i++) {
    const stool = new THREE.Group();
    stool.add(box(0.36, 0.05, 0.32, M.canvas(), 0, 0.45, 0));
    for (const sx of [-1, 1]) {
      const leg = box(0.04, 0.48, 0.04, M.wood(), sx * 0.15, 0.24, 0);
      leg.rotation.z = sx * 12 * DEG;
      stool.add(leg);
    }
    stool.position.set(-2.6 + i * 1.2, 0, 3.4);
    stool.rotation.y = rng.next() * 0.6;
    g.add(stool);
  }

  // ---- The people ---------------------------------------------------------
  const people = [];
  const officer = buildFigure({ kit: 'infantry' });
  officer.position.set(-1.2, 0, 1.4);
  officer.rotation.y = 160 * DEG;
  officer.userData.baseY = 0;
  officer.userData.roleLabel = 'Hauptmann — battalion operations officer';
  officer.userData.behaviour = 'briefing';
  g.add(officer);
  people.push(officer);

  const intel = buildFigure({ kit: 'infantry' });
  intel.position.set(1.5, 0, 1.5);
  intel.rotation.y = -160 * DEG;
  intel.userData.baseY = 0;
  intel.userData.roleLabel = 'Leutnant — intelligence';
  intel.userData.behaviour = 'pointing';
  g.add(intel);
  people.push(intel);

  const clerk = buildFigure({ kit: 'infantry' });
  clerk.position.set(3.4, 0, 2.3);
  clerk.rotation.y = -70 * DEG;
  clerk.userData.baseY = 0;
  clerk.userData.roleLabel = 'Unteroffizier — signals';
  clerk.userData.behaviour = 'desk';
  g.add(clerk);
  people.push(clerk);

  const quartermaster = buildFigure({ kit: 'infantry' });
  quartermaster.position.set(3.0, 0, -2.6);
  quartermaster.rotation.y = 200 * DEG;
  quartermaster.userData.baseY = 0;
  quartermaster.userData.roleLabel = 'Zahlmeister — supply';
  quartermaster.userData.behaviour = 'board';
  g.add(quartermaster);
  people.push(quartermaster);

  g.userData.people = people;

  // ---- Interaction points -------------------------------------------------
  // These are what the contextual prompts attach to.
  g.userData.interactions = [
    { id: 'sandtable', label: 'Study the sand table', pos: new THREE.Vector3(0, 1.0, 1.2), radius: 2.2 },
    { id: 'map', label: 'Read the operational map', pos: new THREE.Vector3(-3.1, 1.4, -3.0), radius: 1.8 },
    { id: 'logistics', label: 'Check the logistics board', pos: new THREE.Vector3(3.2, 1.5, -2.9), radius: 1.8 },
    { id: 'officer', label: 'Speak to the operations officer', pos: new THREE.Vector3(-1.2, 1.4, 1.4), radius: 1.8 },
    { id: 'intel', label: 'Ask about enemy strength', pos: new THREE.Vector3(1.5, 1.4, 1.5), radius: 1.8 },
    { id: 'depart', label: 'Leave for the staging area', pos: new THREE.Vector3(0, 1.0, 5.4), radius: 2.4 },
  ];

  return g;
}

/** Idle animation for the tent staff. */
export function updateBriefingTent(tent, dt, t) {
  for (const p of tent.userData.people || []) {
    const b = p.userData.behaviour;
    if (b === 'pointing') {
      poseFigure(p, 'idle', dt);
      // He leans over the sand table and points at things.
      const arm = p.userData.arms?.[0];
      if (arm) {
        arm.rotation.x = -1.15 + Math.sin(t * 0.6) * 0.25;
        if (arm.userData.elbow) arm.userData.elbow.rotation.x = -0.35;
      }
      if (p.userData.torso) p.userData.torso.rotation.x = 0.30;
    } else if (b === 'desk') {
      poseFigure(p, 'idle', dt);
      const arm = p.userData.arms?.[1];
      if (arm) arm.rotation.x = -1.3;
    } else if (b === 'board') {
      poseFigure(p, 'idle', dt);
      const arm = p.userData.arms?.[0];
      if (arm) arm.rotation.x = -1.5 + Math.sin(t * 1.1) * 0.4;
    } else {
      poseFigure(p, 'idle', dt);
    }
  }
}

/**
 * Put the mission's intelligence picture onto the sand table.
 * Reported enemy positions are deliberately offset from the truth by an amount
 * set by the mission's intelligence quality — the markers show what battalion
 * BELIEVES, and the briefing says so out loud.
 */
export function populateSandTable(tent, mission, terrain, rng, enemyPlacements = []) {
  const st = tent.userData.sandTable;
  if (!st?.userData.addMarker) return [];
  // Clear old markers except the landmark cards.
  const keep = st.userData.markers.children.filter((c) => c.userData?.kind === 'landmark');
  st.userData.markers.clear();
  for (const k of keep) st.userData.markers.add(k);

  const q = mission.briefing?.intelligenceQuality ?? 0.6;
  const placed = [];

  for (const e of enemyPlacements) {
    // Some reported positions are simply wrong, and some real units were never
    // reported at all. Both happen here.
    if (rng.next() > q + 0.25) continue;                 // never reported
    const err = (1 - q) * 350;
    const mx = e.x + rng.range(-err, err);
    const mz = e.z + rng.range(-err, err);
    const m = st.userData.addMarker(mx, mz, 'enemy', e.label || e.type);
    placed.push({ marker: m, truth: e, reportedAt: { x: mx, z: mz } });
  }

  // Phantom contacts: a unit that has already moved on, reported anyway.
  const phantoms = Math.round((1 - q) * 3);
  for (let i = 0; i < phantoms; i++) {
    const x = rng.range(-terrain.half * 0.6, terrain.half * 0.6);
    const z = rng.range(-terrain.half * 0.6, terrain.half * 0.6);
    st.userData.addMarker(x, z, 'enemy', 'reported — unconfirmed');
  }

  // Friendly positions and the objective.
  st.userData.addMarker(0, -terrain.half * 0.55, 'friendly', 'own start line');
  st.userData.addMarker(0, terrain.half * 0.5, 'objective', mission.objectives?.[0]?.label || 'objective');

  return placed;
}
