// Shared materials. Kept in one place so LOD swaps and quality settings can
// retarget them all at once, and so the same steel is used everywhere.

import * as THREE from 'three';

const cache = new Map();

/** Dunkelgelb RAL 7028 — the base coat Tigers left the factory in from Feb 1943. */
export const DUNKELGELB = 0xa89464;
export const OLIVGRUEN = 0x6b6b45;
export const ROTBRAUN = 0x7a4a35;
export const STEEL = 0x4a4a4a;
export const DARK_STEEL = 0x2e2e30;
export const TRACK_STEEL = 0x55534e;
export const RUBBER = 0x1c1c1e;
export const INTERIOR_IVORY = 0xd8d2c0;   // Tiger interiors were painted ivory
export const INTERIOR_RED = 0x8a4030;     // red oxide primer on the lower hull
export const SOVIET_GREEN = 0x4a5738;
export const CANVAS = 0x8a8060;
export const BRASS = 0xb08d3a;

export function mat(key, params, type = 'standard') {
  const k = `${type}:${key}`;
  if (cache.has(k)) return cache.get(k);
  const M = type === 'basic' ? THREE.MeshBasicMaterial
    : type === 'lambert' ? THREE.MeshLambertMaterial
      : THREE.MeshStandardMaterial;
  const m = new M(params);
  cache.set(k, m);
  return m;
}

export const M = {
  hull: () => mat('hull', { color: DUNKELGELB, roughness: 0.86, metalness: 0.12 }),
  hullDark: () => mat('hullDark', { color: 0x8f7d55, roughness: 0.9, metalness: 0.12 }),
  turret: () => mat('turret', { color: DUNKELGELB, roughness: 0.84, metalness: 0.14 }),
  mantlet: () => mat('mantlet', { color: 0x9d8a5d, roughness: 0.8, metalness: 0.2 }),
  barrel: () => mat('barrel', { color: 0x8f7d55, roughness: 0.7, metalness: 0.3 }),
  steel: () => mat('steel', { color: STEEL, roughness: 0.65, metalness: 0.55 }),
  darkSteel: () => mat('darkSteel', { color: DARK_STEEL, roughness: 0.7, metalness: 0.5 }),
  track: () => mat('track', { color: TRACK_STEEL, roughness: 0.55, metalness: 0.72 }),
  rubber: () => mat('rubber', { color: RUBBER, roughness: 0.95, metalness: 0.02 }),
  wheel: () => mat('wheel', { color: 0x9a8a60, roughness: 0.85, metalness: 0.15 }),
  interior: () => mat('interior', { color: INTERIOR_IVORY, roughness: 0.9, metalness: 0.05 }),
  interiorLower: () => mat('interiorLower', { color: INTERIOR_RED, roughness: 0.92, metalness: 0.06 }),
  interiorSteel: () => mat('interiorSteel', { color: 0x6a6a6c, roughness: 0.6, metalness: 0.6 }),
  brass: () => mat('brass', { color: BRASS, roughness: 0.42, metalness: 0.85 }),
  glass: () => mat('glass', { color: 0x203040, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55 }),
  canvas: () => mat('canvas', { color: CANVAS, roughness: 0.95, metalness: 0 }),
  soviet: () => mat('soviet', { color: SOVIET_GREEN, roughness: 0.88, metalness: 0.1 }),
  sovietDark: () => mat('sovietDark', { color: 0x3e4a2e, roughness: 0.9, metalness: 0.1 }),
  wood: () => mat('wood', { color: 0x6b5236, roughness: 0.95, metalness: 0 }),
  dirt: () => mat('dirt', { color: 0x5c4a33, roughness: 1, metalness: 0 }),
  cloth: () => mat('cloth', { color: 0x6d6b53, roughness: 0.95, metalness: 0 }),
  skin: () => mat('skin', { color: 0xb08868, roughness: 0.85, metalness: 0 }),
  uniform: () => mat('uniform', { color: 0x3a3f38, roughness: 0.92, metalness: 0 }),  // Panzer black/field grey
  panzerBlack: () => mat('panzerBlack', { color: 0x232326, roughness: 0.9, metalness: 0.02 }),
};

export function disposeAll() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
}
