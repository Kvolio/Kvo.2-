// Battlefield and rear-area props. Everything here is 1943 German field
// equipment or Russian village architecture; nothing is generic set dressing.

import * as THREE from 'three';
import { M } from '../render/Materials.js';

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

/** A Russian izba: log walls, thatched or plank roof, a stove chimney. */
export function buildIzba(rng, lod = 0) {
  const g = new THREE.Group();
  const w = 5 + rng.next() * 3;
  const d = 6 + rng.next() * 3;
  const h = 2.4;
  const logs = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.95 });
  g.add(box(w, h, d, logs, 0, h / 2, 0));

  // Pitched roof.
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x54452e, roughness: 0.98 });
  for (const sx of [-1, 1]) {
    const slope = box(w * 0.62, 0.12, d + 0.6, roofMat, sx * w * 0.27, h + 0.62, 0);
    slope.rotation.z = sx * -32 * DEG;
    g.add(slope);
  }
  g.add(box(0.5, 0.9, 0.5, new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.95 }),
    w * 0.2, h + 1.1, -d * 0.2));  // chimney

  if (lod === 0) {
    // Windows and a door.
    for (let i = 0; i < 2; i++) {
      g.add(box(0.8, 0.7, 0.06, M.darkSteel(), -w * 0.22 + i * w * 0.44, 1.5, d / 2 + 0.02));
    }
    g.add(box(0.9, 1.9, 0.06, new THREE.MeshStandardMaterial({ color: 0x4a3a26 }), 0, 0.95, -d / 2 - 0.02));
    // A fence.
    for (let i = 0; i < 8; i++) {
      g.add(box(0.08, 1.0, 0.06, M.wood(), -w / 2 - 1.5, 0.5, -d / 2 + i * (d / 7)));
    }
  }
  // Battle damage: many villages in the salient were shelled flat.
  if (rng.next() < 0.4) {
    g.rotation.z = (rng.next() - 0.5) * 0.14;
    g.children.forEach((c) => { if (rng.next() < 0.3) c.visible = false; });
  }
  return g;
}

/** A tree. Kursk was rye fields and birch/oak windbreaks. */
export function buildTree(rng, lod = 0) {
  const g = new THREE.Group();
  const h = 6 + rng.next() * 7;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 0.95 });
  g.add(cyl(0.16, 0.28, h * 0.55, lod === 0 ? 7 : 5, trunkMat, 0, h * 0.275, 0));
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d5226, roughness: 0.95 });
  const blobs = lod === 0 ? 3 : 1;
  for (let i = 0; i < blobs; i++) {
    const r = h * (0.26 - i * 0.05);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, lod === 0 ? 8 : 5, lod === 0 ? 6 : 4), leafMat);
    s.position.set((rng.next() - 0.5) * 1.5, h * (0.62 + i * 0.14), (rng.next() - 0.5) * 1.5);
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

/** Standing rye. Drawn as instanced quads so a field costs one draw call. */
export function buildCropField(rng, radius, count, lod) {
  const n = lod === 0 ? count : lod === 1 ? Math.floor(count * 0.5) : Math.floor(count * 0.2);
  const geo = new THREE.PlaneGeometry(1.1, 1.0);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xa89a5a, roughness: 1, side: THREE.DoubleSide,
    transparent: true, alphaTest: 0.4,
  });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    d.rotation.y = rng.next() * Math.PI;
    d.scale.setScalar(0.8 + rng.next() * 0.5);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.receiveShadow = true;
  return inst;
}

/** German field equipment: crates, drums, sandbags, tarpaulins. */
export function buildAmmoCrate(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6244, roughness: 0.95 });
  g.add(box(0.95, 0.35, 0.42, mat, 0, 0.175, 0));
  g.add(box(0.98, 0.04, 0.45, M.darkSteel(), 0, 0.36, 0));
  // Stencilled markings.
  g.add(box(0.34, 0.10, 0.005, new THREE.MeshStandardMaterial({ color: 0x2a2a22 }), 0, 0.22, 0.212));
  return g;
}

export function buildFuelDrum(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 0.8, metalness: 0.4 });
  g.add(cyl(0.29, 0.29, 0.88, 12, mat, 0, 0.44, 0));
  for (const y of [0.28, 0.60]) {
    g.add(cyl(0.30, 0.30, 0.045, 12, M.darkSteel(), 0, y, 0));
  }
  return g;
}

/** The 20-litre Wehrmacht-Einheitskanister — the original jerrycan. */
export function buildJerrycan() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4e5238, roughness: 0.75, metalness: 0.35 });
  g.add(box(0.17, 0.47, 0.34, mat, 0, 0.235, 0));
  g.add(box(0.19, 0.05, 0.10, M.darkSteel(), 0, 0.48, -0.08));   // triple handle
  return g;
}

export function buildSandbagWall(rng, length) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d7050, roughness: 1 });
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const n = Math.floor(length / 0.45);
    for (let i = 0; i < n; i++) {
      const b = box(0.42, 0.16, 0.26, mat,
        -length / 2 + i * 0.45 + (r % 2) * 0.2, 0.08 + r * 0.16, (rng.next() - 0.5) * 0.06);
      b.rotation.y = (rng.next() - 0.5) * 0.15;
      g.add(b);
    }
  }
  return g;
}

/** Spare Tiger track links, stacked. Track was always in short supply. */
export function buildTrackStack(count = 6) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    g.add(box(0.725, 0.06, 0.26, M.track(), 0, 0.03 + i * 0.065, (i % 2) * 0.03));
  }
  return g;
}

export function buildSpareRoadWheel() {
  const g = new THREE.Group();
  const w = cyl(0.40, 0.40, 0.10, 16, M.wheel());
  w.rotation.x = Math.PI / 2;
  w.position.y = 0.40;
  g.add(w);
  const t = cyl(0.405, 0.405, 0.075, 16, M.rubber());
  t.rotation.x = Math.PI / 2;
  t.position.y = 0.40;
  g.add(t);
  return g;
}

/** A dug-in anti-tank gun position: parapet, spoil, and camouflage. */
export function buildGunPit(rng) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3e3227, roughness: 1 });
  // The parapet ring — this is what makes a ZiS-3 so hard to see.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 1.4 - Math.PI * 0.7;
    const b = box(1.0, 0.55, 0.7, mat, Math.sin(a) * 2.4, 0.25, Math.cos(a) * 2.4);
    b.rotation.y = a;
    g.add(b);
  }
  // Cut branches over the position.
  const leaf = new THREE.MeshStandardMaterial({ color: 0x44532a, roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const br = box(0.1, 0.06, 1.6, leaf,
      (rng.next() - 0.5) * 3, 0.6 + rng.next() * 0.3, (rng.next() - 0.5) * 3);
    br.rotation.y = rng.next() * Math.PI;
    g.add(br);
  }
  return g;
}

export function buildTrench(rng, length) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3025, roughness: 1 });
  for (let i = 0; i < Math.floor(length / 2); i++) {
    const z = -length / 2 + i * 2;
    g.add(box(2.2, 0.5, 0.9, mat, 0, 0.25, z));                 // spoil parapet
    g.add(box(1.6, 0.05, 1.9, new THREE.MeshStandardMaterial({ color: 0x1a1510 }), 0, 0.02, z + 0.8));
  }
  return g;
}

/** A burnt-out wreck to litter the battlefield with. */
export function buildWreck(rng) {
  const g = new THREE.Group();
  const burnt = new THREE.MeshStandardMaterial({ color: 0x1c1815, roughness: 1 });
  g.add(box(2.8, 0.9, 5.5, burnt, 0, 0.6, 0));
  const turret = cyl(0.85, 0.9, 0.5, 6, burnt, rng.next() * 1.5 - 0.75, 1.35, rng.next() - 0.5);
  turret.rotation.set((rng.next() - 0.5) * 0.6, rng.next() * 3, (rng.next() - 0.5) * 0.6);
  g.add(turret);
  g.rotation.z = (rng.next() - 0.5) * 0.15;
  return g;
}

/** Field telephone wire on poles — the rear areas were strung with it. */
export function buildSignalPole() {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.09, 4.2, 6, M.wood(), 0, 2.1, 0));
  g.add(box(0.9, 0.06, 0.06, M.wood(), 0, 3.9, 0));
  return g;
}
