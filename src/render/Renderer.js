// ===========================================================================
//  RENDERER
//
//  One renderer, one scene graph, two platforms. The quality controls exist so
//  that an iPad and a desktop run THE SAME SIMULATION at different visual
//  settings — never a different game.
//
//  Performance work, in the order it matters on mobile:
//    * level of detail on every vehicle, chosen by distance and by budget
//    * frustum culling (three.js) plus a cheap distance cull for props
//    * object pooling for particles and projectiles (see Effects/Pool)
//    * dynamic resolution: the render target scales to hold the frame budget
//    * shadow map size and cascade distance scale with quality
//    * a single Points draw call for every particle in the world
// ===========================================================================

import * as THREE from 'three';
import { TIME_OF_DAY, WEATHER } from '../data/missions.js';
import { clamp, clamp01, lerp } from '../core/MathUtil.js';

export const QUALITY = {
  low: {
    label: 'Low', pixelRatio: 0.7, shadows: false, shadowMapSize: 512,
    shadowDistance: 90, lodBias: 0.55, propDistance: 320, particleQuality: 'low',
    anisotropy: 1, terrainSegments: 96, fogQuality: 0.6, maxVehicleDetail: 6,
  },
  medium: {
    label: 'Medium', pixelRatio: 1.0, shadows: true, shadowMapSize: 1024,
    shadowDistance: 140, lodBias: 0.8, propDistance: 620, particleQuality: 'medium',
    anisotropy: 2, terrainSegments: 160, fogQuality: 0.8, maxVehicleDetail: 10,
  },
  high: {
    label: 'High', pixelRatio: 1.0, shadows: true, shadowMapSize: 2048,
    shadowDistance: 220, lodBias: 1.0, propDistance: 1100, particleQuality: 'high',
    anisotropy: 8, terrainSegments: 224, fogQuality: 1.0, maxVehicleDetail: 16,
  },
  ultra: {
    label: 'Ultra', pixelRatio: 1.5, shadows: true, shadowMapSize: 4096,
    shadowDistance: 320, lodBias: 1.35, propDistance: 1600, particleQuality: 'high',
    anisotropy: 16, terrainSegments: 288, fogQuality: 1.0, maxVehicleDetail: 24,
  },
};

/** Guess a sensible starting quality from the device. */
export function detectQuality() {
  const ua = navigator.userAgent || '';
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;

  if (!mobile) return cores >= 8 && mem >= 8 ? 'high' : 'medium';
  // Modern iPads and high-end phones will run the full simulation happily.
  const bigScreen = Math.max(screen.width, screen.height) >= 1024;
  if (cores >= 6 && bigScreen) return 'high';
  if (cores >= 6) return 'medium';
  return 'low';
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.qualityName = opts.quality || detectQuality();
    this.q = QUALITY[this.qualityName];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.qualityName !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x8fb0d0);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.06, 4200);

    // ---- Lighting ----------------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.castShadow = this.q.shadows;
    this._configureShadow();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xa8b8c8, 0x5a4a32, 0.55);
    this.scene.add(this.hemi);

    // A dim fill inside the tank so the interior is legible without being lit
    // like a studio. Tigers had one small turret lamp.
    this.interiorLight = new THREE.PointLight(0xffd9a0, 0.0, 6, 2);
    this.scene.add(this.interiorLight);

    this.scene.fog = new THREE.FogExp2(0x9fb4c8, 0.00012);

    // ---- Dynamic resolution -------------------------------------------------
    this.dynamicResolution = opts.dynamicResolution !== false;
    this.resolutionScale = 1;
    this.targetFrameMs = opts.targetFrameMs || 16.7;
    this._frameAcc = 0;
    this._frameCount = 0;

    this.lodGroups = [];
    this.props = [];

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // iOS fires this on rotation and on the URL bar collapsing.
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
  }

  _configureShadow() {
    const s = this.sun.shadow;
    s.mapSize.width = this.q.shadowMapSize;
    s.mapSize.height = this.q.shadowMapSize;
    const d = this.q.shadowDistance;
    s.camera.left = -d; s.camera.right = d;
    s.camera.top = d; s.camera.bottom = -d;
    s.camera.near = 1;
    s.camera.far = d * 4;
    s.bias = -0.0009;
    s.normalBias = 0.03;
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    this._configureShadow();
    this.resolutionScale = 1;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(dpr * this.resolutionScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  /** Set the sky, sun and fog for a mission's time of day and weather. */
  setEnvironment(timeOfDay = 'afternoon', weather = 'clear') {
    const t = TIME_OF_DAY[timeOfDay] || TIME_OF_DAY.afternoon;
    const w = WEATHER[weather] || WEATHER.clear;
    this.env = { ...t, ...w, timeOfDay, weather };

    const sky = new THREE.Color(t.sky);
    // Overcast and rain wash the sky out toward grey.
    sky.lerp(new THREE.Color(0x8a8e94), w.cloud * 0.55);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.density = t.fogDensity * w.fogMul * this.q.fogQuality;

    const el = t.sunAngle * Math.PI / 180;
    const az = 0.7;
    const d = 260;
    this.sun.position.set(Math.cos(az) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(az) * Math.cos(el) * d);
    this.sun.color.set(t.sun);
    this.sun.intensity = 2.4 * t.lightFactor * (1 - w.cloud * 0.55);
    this.hemi.intensity = 0.35 + t.ambient * (0.6 + w.cloud * 0.5);
    this.hemi.color.copy(sky);

    // At night the only useful light is what is burning.
    if (timeOfDay === 'night') {
      this.sun.intensity = 0.10;
      this.hemi.intensity = 0.12;
      this.renderer.toneMappingExposure = 1.5;
    } else {
      this.renderer.toneMappingExposure = 1.0;
    }

    return this.env;
  }

  /** Keep the shadow frustum around the camera so it stays sharp. */
  updateShadowFrustum(focus) {
    if (!this.q.shadows) return;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this._sunOffset ||= this.sun.position.clone().normalize().multiplyScalar(260));
    this.sun.target.updateMatrixWorld();
  }

  /**
   * Register a vehicle for level-of-detail swapping.
   * @param {THREE.Group} group     the container placed in the world
   * @param {Function} builder      builder(lod) -> THREE.Group
   */
  registerLod(group, builder, opts = {}) {
    const entry = {
      group, builder,
      levels: [null, null, null],
      current: -1,
      distances: opts.distances || [70, 220],
      lastCheck: 0,
      important: !!opts.important,
    };
    this.lodGroups.push(entry);
    return entry;
  }

  unregisterLod(group) {
    const i = this.lodGroups.findIndex((e) => e.group === group);
    if (i >= 0) {
      const e = this.lodGroups[i];
      for (const lvl of e.levels) if (lvl) disposeTree(lvl);
      this.lodGroups.splice(i, 1);
    }
  }

  _updateLod(cameraPos) {
    const bias = this.q.lodBias;
    let detailBudget = this.q.maxVehicleDetail;

    // Sort by distance so the nearest vehicles get the detail budget.
    const scored = [];
    for (const e of this.lodGroups) {
      const d = e.group.position.distanceTo(cameraPos);
      scored.push({ e, d });
    }
    scored.sort((a, b) => a.d - b.d);

    for (const { e, d } of scored) {
      let want;
      const [d0, d1] = e.distances;
      if (d < d0 * bias) want = 0;
      else if (d < d1 * bias) want = 1;
      else want = 2;

      // The player's own Tiger is always at full detail; it is the whole point.
      if (e.important) want = 0;

      // Budget: only so many vehicles get LOD0 at once.
      if (want === 0 && !e.important) {
        if (detailBudget > 0) detailBudget--;
        else want = 1;
      }

      if (want !== e.current) {
        if (e.current >= 0 && e.levels[e.current]) e.levels[e.current].visible = false;
        if (!e.levels[want]) {
          e.levels[want] = e.builder(want);
          e.group.add(e.levels[want]);
        }
        e.levels[want].visible = true;
        e.current = want;
        e.group.userData.activeLod = e.levels[want];
      }
    }
  }

  /** Cheap distance culling for scenery, on top of frustum culling. */
  registerProp(obj) {
    this.props.push(obj);
    return obj;
  }

  _cullProps(cameraPos) {
    const maxD = this.q.propDistance;
    const maxD2 = maxD * maxD;
    for (const p of this.props) {
      const dx = p.position.x - cameraPos.x;
      const dz = p.position.z - cameraPos.z;
      p.visible = (dx * dx + dz * dz) < maxD2;
    }
  }

  /**
   * Adapt the render resolution to hold the frame budget. This is what lets a
   * phone run the same simulation: when it cannot keep up it renders fewer
   * pixels, it does not simplify the tank or the physics.
   */
  _updateDynamicResolution(frameMs) {
    if (!this.dynamicResolution) return;
    this._frameAcc += frameMs;
    this._frameCount++;
    if (this._frameCount < 30) return;

    const avg = this._frameAcc / this._frameCount;
    this._frameAcc = 0; this._frameCount = 0;

    const target = this.targetFrameMs;
    let next = this.resolutionScale;
    if (avg > target * 1.25) next -= 0.08;
    else if (avg < target * 0.82) next += 0.05;
    next = clamp(next, 0.55, 1.0);

    if (Math.abs(next - this.resolutionScale) > 0.005) {
      this.resolutionScale = next;
      const dpr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
      this.renderer.setPixelRatio(dpr * this.resolutionScale);
      this.renderer.setSize(this.width, this.height, false);
    }
  }

  render(dt, frameMs) {
    const camPos = this.camera.position;
    this._updateLod(camPos);
    this._cullProps(camPos);
    this.updateShadowFrustum(camPos);
    this._updateDynamicResolution(frameMs);
    this.renderer.render(this.scene, this.camera);
  }

  /** Interior lighting: dim, warm, and only when the player is inside. */
  setInteriorLighting(on, pos, hatchOpen) {
    this.interiorLight.intensity = on ? (hatchOpen ? 1.2 : 0.85) : 0;
    if (pos) this.interiorLight.position.copy(pos);
  }

  stats() {
    const info = this.renderer.info;
    return {
      quality: this.qualityName,
      resolutionScale: this.resolutionScale,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      lodGroups: this.lodGroups.length,
    };
  }

  dispose() {
    for (const e of this.lodGroups) for (const l of e.levels) if (l) disposeTree(l);
    this.renderer.dispose();
  }
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  root.parent?.remove(root);
}

/** Build the visible terrain mesh from a Terrain heightfield. */
export function buildTerrainMesh(terrain, quality) {
  const seg = QUALITY[quality]?.terrainSegments ?? 160;
  const geo = new THREE.PlaneGeometry(terrain.size, terrain.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const FIELD = [0.61, 0.55, 0.33];
  const GRASS = [0.40, 0.45, 0.26];
  const TRACK = [0.48, 0.42, 0.32];
  const MUD = [0.30, 0.25, 0.18];
  const WOOD = [0.20, 0.28, 0.15];
  const VILLAGE = [0.44, 0.39, 0.31];

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrain.heightAt(x, z);
    pos.setY(i, h);

    const g = terrain.groundAt(x, z);
    const c = g === 'wood' ? WOOD : g === 'village' ? VILLAGE : g === 'track' ? TRACK
      : g === 'mud' ? MUD : g === 'grass' ? GRASS : FIELD;
    // A little variation so it does not read as flat paint.
    const n = 0.90 + ((Math.sin(x * 0.07) + Math.cos(z * 0.09)) * 0.5 + 0.5) * 0.20;
    colors[i * 3] = c[0] * n;
    colors[i * 3 + 1] = c[1] * n;
    colors[i * 3 + 2] = c[2] * n;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  }));
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
