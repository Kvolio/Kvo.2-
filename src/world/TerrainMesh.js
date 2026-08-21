// ===========================================================================
//  TERRAIN MESH
//
//  Turns the Terrain heightfield into geometry the player can see.
//
//  The ground is one mesh with a tiled, normal-mapped earth detail texture and
//  a per-vertex colour that tints it by ground type. That combination is what
//  gives both scales at once: close up you see clods and tyre-scale relief from
//  the detail map, and at a kilometre you see rye giving way to grass, a road
//  cutting across a field, and the dark line of a balka — without needing a
//  custom splatting shader.
//
//  Vertex colours also carry a per-vertex ambient darkening in the hollows,
//  which reads as the ground's own occlusion long before the SSAO pass is
//  close enough to contribute.
// ===========================================================================

import * as THREE from 'three';
import { M } from '../render/Materials.js';
import { GROUND } from './Terrain.js';

/** Tint per ground type, multiplied over the shared earth detail texture. */
const TINT = {
  [GROUND.FIELD]: [1.28, 1.16, 0.72],     // standing rye, pale gold
  [GROUND.GRASS]: [0.72, 1.00, 0.52],
  [GROUND.TRACK]: [1.10, 0.98, 0.80],     // dust-pale dirt road
  [GROUND.MUD]: [0.52, 0.44, 0.34],
  [GROUND.WOOD]: [0.42, 0.56, 0.34],
  [GROUND.VILLAGE]: [0.92, 0.84, 0.72],
};

/**
 * @param {Terrain} terrain
 * @param {string} quality  key into QUALITY, decides tessellation
 * @param {object} [opts]   { segments } to override
 */
export function buildTerrainMesh(terrain, quality, opts = {}) {
  const seg = opts.segments ?? SEGMENTS[quality] ?? 192;
  const geo = new THREE.PlaneGeometry(terrain.size, terrain.size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);
  const heights = new Float32Array(count);

  // First pass: heights.
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrain.heightAt(x, z);
    heights[i] = h;
    pos.setY(i, h);
  }

  // Second pass: colour by ground type, with slope and hollow shading.
  const row = seg + 1;
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const g = terrain.groundAt(x, z);
    const tint = TINT[g] || TINT[GROUND.FIELD];

    // Local relief: compare against the neighbours to find hollows and crests.
    const ix = i % row, iz = Math.floor(i / row);
    let sum = 0, n = 0;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jx >= row || jz < 0 || jz >= row) continue;
      sum += heights[jz * row + jx];
      n++;
    }
    const relief = n ? heights[i] - sum / n : 0;

    // Hollows darken, crests catch the light and dry out paler.
    const shade = 1 + Math.max(-0.28, Math.min(0.18, relief * 0.22));
    // Slow large-scale variation so a big field is not one flat colour.
    const drift = 0.92 + ((Math.sin(x * 0.0031) + Math.cos(z * 0.0027)) * 0.5 + 0.5) * 0.16;

    const k = shade * drift;
    colors[i * 3] = tint[0] * k;
    colors[i * 3 + 1] = tint[1] * k;
    colors[i * 3 + 2] = tint[2] * k;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // The detail texture is tiled once every few metres so it reads at walking
  // distance; the vertex colour supplies everything at battlefield scale.
  const tilesPerMetre = 1 / 10;
  const material = M.dirt(Math.round(terrain.size * tilesPerMetre));
  const mat = material.clone();
  mat.vertexColors = true;
  mat.color.setRGB(1, 1, 1);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;         // a 3 km ground plane in the shadow map is waste
  mesh.name = 'terrain';
  mesh.userData.segments = seg;
  return mesh;
}

const SEGMENTS = {
  low: 128, medium: 192, high: 256, ultra: 320, cinematic: 384,
};
