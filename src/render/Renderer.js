// ===========================================================================
//  RENDERER
//
//  One renderer, one scene graph, two platforms. The quality presets exist so
//  an iPad and a desktop run THE SAME SIMULATION at different visual settings —
//  never a different game. Nothing in here can change armour, ballistics, crew
//  or campaign state, and that is deliberate.
//
//  What makes it look like a game rather than a viewer, in order of effect:
//    1. IMAGE-BASED LIGHTING. A PBR material with nothing to reflect looks like
//       plastic. The sky is authored to a texture and pre-filtered into an
//       environment map, so steel reflects sky and glass reflects the sun.
//    2. A TIGHT SHADOW FRUSTUM. One 140 m ortho box over a 3 km map gave the
//       Tiger a soft blob for a shadow. It now hugs the camera and snaps to the
//       shadow-map texel grid so it does not shimmer when you move.
//    3. POST-PROCESSING. Ambient occlusion puts the tank on the ground and the
//       breech inside the turret; bloom is thresholded so only fire glares.
//
//  Performance work, in the order it matters on mobile: level of detail on
//  every vehicle, distance culling for props, pooled particles and projectiles,
//  dynamic resolution, and shadow/post stages that switch off by preset.
// ===========================================================================

import * as THREE from 'three';
import { TIME_OF_DAY, WEATHER } from '../data/missions.js';
import { clamp, clamp01, lerp } from '../core/MathUtil.js';
import * as TEX from './Textures.js';
import { applyAnisotropy, applyEnvironment, M } from './Materials.js';
import { PostProcessing } from './Post.js';

export const QUALITY = {
  low: {
    label: 'Low', pixelRatio: 0.75, shadows: true, shadowMapSize: 1024,
    shadowDistance: 45, lodBias: 0.55, propDistance: 340, particleQuality: 'low',
    anisotropy: 2, terrainSegments: 128, fogQuality: 0.7, maxVehicleDetail: 4,
    post: { ao: false, bloom: false, smaa: false },
    vegetation: 0.25, envResolution: 128,
  },
  medium: {
    label: 'Medium', pixelRatio: 1.0, shadows: true, shadowMapSize: 2048,
    shadowDistance: 70, lodBias: 0.8, propDistance: 700, particleQuality: 'medium',
    anisotropy: 4, terrainSegments: 192, fogQuality: 0.85, maxVehicleDetail: 8,
    post: { ao: false, bloom: true, smaa: true },
    vegetation: 0.55, envResolution: 256,
  },
  high: {
    label: 'High', pixelRatio: 1.0, shadows: true, shadowMapSize: 2048,
    shadowDistance: 95, lodBias: 1.0, propDistance: 1200, particleQuality: 'high',
    anisotropy: 8, terrainSegments: 256, fogQuality: 1.0, maxVehicleDetail: 14,
    post: { ao: true, bloom: true, smaa: true },
    vegetation: 1.0, envResolution: 256,
  },
  ultra: {
    label: 'Ultra', pixelRatio: 1.35, shadows: true, shadowMapSize: 4096,
    shadowDistance: 120, lodBias: 1.4, propDistance: 1800, particleQuality: 'high',
    anisotropy: 16, terrainSegments: 320, fogQuality: 1.0, maxVehicleDetail: 20,
    post: { ao: true, bloom: true, smaa: true },
    vegetation: 1.5, envResolution: 512,
  },
  cinematic: {
    label: 'Cinematic', pixelRatio: 2.0, shadows: true, shadowMapSize: 4096,
    shadowDistance: 150, lodBias: 1.8, propDistance: 2400, particleQuality: 'high',
    anisotropy: 16, terrainSegments: 384, fogQuality: 1.0, maxVehicleDetail: 28,
    post: { ao: true, bloom: true, smaa: true },
    vegetation: 2.0, envResolution: 512,
  },
};

const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra', 'cinematic'];
const STORAGE_KEY = 'tiger101.quality';

/**
 * Pick a starting preset.
 *
 * The brief is explicit that modern high-end mobile hardware should run the
 * full simulation, so a large-screen mobile device starts at High and lets the
 * dynamic-resolution controller find the real limit — rather than being graded
 * down on `hardwareConcurrency`, which many mobile browsers under-report or omit
 * entirely for fingerprinting reasons.
 */
export function detectQuality() {
  // A choice the player made themselves always wins.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && QUALITY[saved]) return saved;
  } catch { /* private browsing */ }

  const ua = navigator.userAgent || '';
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));   // iPadOS claims to be a Mac
  const cores = navigator.hardwareConcurrency || 0;
  const mem = navigator.deviceMemory || 0;
  const longEdge = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);

  if (!mobile) {
    if (cores >= 12 && mem >= 16) return 'ultra';
    if (cores >= 8 || mem >= 8) return 'high';
    return 'medium';
  }

  // Tablets and large phones: a device with this much screen is a device with a
  // recent GPU. iPhone 17 Pro and any modern iPad land here.
  if (longEdge >= 2000) return 'high';
  if (longEdge >= 1300) return 'medium';
  return 'low';
}

export function saveQualityChoice(name) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* nothing to do */ }
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.qualityName = opts.quality || detectQuality();
    this.q = QUALITY[this.qualityName];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,           // SMAA does this in post where it is enabled
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setClearColor(0x8fb0d0);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // With a post-processing chain, three.js resets its render info on every
    // pass, so the stats overlay would report the single full-screen quad of
    // the last pass instead of the scene. Take over the reset ourselves.
    this.renderer.info.autoReset = false;

    this.maxAnisotropy = Math.min(
      this.q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    // Near plane at 0.1 m rather than 0.06: nothing the commander looks at is
    // closer than that, and the tighter range gives every depth-based effect —
    // ambient occlusion above all — usable precision across 4 km.
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4200);

    // ---- Lighting ----------------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xfff4e0, 5.0);
    this.sun.castShadow = this.q.shadows;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this._configureShadow();

    // The direction the sun comes FROM, set by setEnvironment.
    this.sunDirection = new THREE.Vector3(0.62, 0.55, 0.55).normalize();
    this.sunDistance = 300;

    this.hemi = new THREE.HemisphereLight(0xa8b8c8, 0x6a5a3e, 1.5);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xb8c4d0, 0.55);
    this.scene.add(this.ambient);

    // A dim warm point inside the tank. Tigers had one small turret lamp, and
    // the difference between that and daylight outside is the whole point.
    this.interiorLight = new THREE.PointLight(0xffd9a0, 0, 6, 2);
    this.scene.add(this.interiorLight);

    this.scene.fog = new THREE.FogExp2(0x9fb4c8, 0.00012);

    // ---- Image-based lighting ----------------------------------------------
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this.envRT = null;

    // ---- Post-processing ---------------------------------------------------
    this.post = new PostProcessing(this.renderer, this.scene, this.camera, {
      ...this.q.post, enabled: true,
    });

    // ---- Dynamic resolution -------------------------------------------------
    this.dynamicResolution = opts.dynamicResolution !== false;
    this.resolutionScale = 1;
    this.targetFrameMs = opts.targetFrameMs || 16.7;
    this._frameAcc = 0;
    this._frameCount = 0;

    this.lodGroups = [];
    this.props = [];

    TEX.setTextureResolution(TEX.TEXTURE_RESOLUTION[this.qualityName] ?? 256);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
  }

  /**
   * Author the material textures ahead of the first frame, yielding between
   * each so the loading bar moves instead of the tab freezing.
   */
  async warmupTextures(onProgress) {
    const n = await TEX.warmup(onProgress);
    applyAnisotropy(this.maxAnisotropy);
    if (this.scene.environment) applyEnvironment(this.scene.environment, 1);
    return n;
  }

  _configureShadow() {
    const s = this.sun.shadow;
    s.mapSize.width = this.q.shadowMapSize;
    s.mapSize.height = this.q.shadowMapSize;
    const d = this.q.shadowDistance;
    s.camera.left = -d; s.camera.right = d;
    s.camera.top = d; s.camera.bottom = -d;
    s.camera.near = 1;
    s.camera.far = d * 6;
    // Tuned for a frustum measured in tens of metres rather than hundreds.
    s.bias = -0.00035;
    s.normalBias = 0.02;
    s.camera.updateProjectionMatrix();
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    saveQualityChoice(name);

    this.renderer.shadowMap.enabled = this.q.shadows;
    this.sun.castShadow = this.q.shadows;
    this.maxAnisotropy = Math.min(this.q.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
    applyAnisotropy(this.maxAnisotropy);
    this._configureShadow();
    this.post.build({ ...this.q.post });
    this.post.setCamera(this.camera);
    this.resolutionScale = 1;
    this.resize();
    // Textures are only re-authored on an explicit request: regenerating a
    // 512px set mid-mission would stall for seconds.
    this.pendingTextureResolution = TEX.TEXTURE_RESOLUTION[name];
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
    const bw = Math.max(2, Math.floor(w * dpr * this.resolutionScale));
    const bh = Math.max(2, Math.floor(h * dpr * this.resolutionScale));
    this.post?.setSize(bw, bh);
  }

  /** Set the sky, sun, fog and environment map for a time of day and weather. */
  setEnvironment(timeOfDay = 'afternoon', weather = 'clear') {
    const t = TIME_OF_DAY[timeOfDay] || TIME_OF_DAY.afternoon;
    const w = WEATHER[weather] || WEATHER.clear;
    this.env = { ...t, ...w, timeOfDay, weather };

    const sky = new THREE.Color(t.sky);
    sky.lerp(new THREE.Color(0x8a8e94), w.cloud * 0.55);
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this._skyColor = sky;
    this.scene.fog.density = t.fogDensity * w.fogMul * this.q.fogQuality;

    const el = Math.max(4, t.sunAngle) * Math.PI / 180;
    const az = t.sunAzimuth ?? 2.1;
    this.sunDirection.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.sun.color.set(t.sun);

    // The light budget has to be shared with the environment map, which now
    // supplies most of the ambient term. Stacking the old flat-light values on
    // top of IBL blew every bright surface straight through the tone mapper.
    // Sun up, sky fill down. With the environment map cut back to 0.55 the sun
    // has to carry the modelling, and a strong key against a modest fill is
    // what gives a vehicle form. At 4.2 against a 0.42 hemisphere plus a
    // full-strength environment, nothing on the tank was in shadow at all.
    this.sun.intensity = 5.4 * t.lightFactor * (1 - w.cloud * 0.55);
    this.hemi.intensity = 0.16 + t.ambient * (0.20 + w.cloud * 0.7);
    this.hemi.color.copy(sky);
    this.ambient.intensity = 0.06 + w.cloud * 0.14;
    this.ambient.color.copy(sky);

    if (timeOfDay === 'night') {
      this.sun.intensity = 0.30;
      this.hemi.intensity = 0.14;
      this.ambient.intensity = 0.05;
      this.renderer.toneMappingExposure = 1.4;
    } else {
      this.renderer.toneMappingExposure = 1.0;
    }

    this._buildEnvironmentMap(sky, t, w, el);
    return this.env;
  }

  /**
   * Pre-filter an authored sky into an environment map. This is the single
   * biggest thing separating "PBR materials" from "materials that look like
   * PBR": without something to reflect, metal reads as matte plastic.
   */
  _buildEnvironmentMap(sky, t, w, sunElevation) {
    const zenith = sky.clone().multiplyScalar(0.82);
    const horizon = sky.clone().lerp(new THREE.Color(0xd8cfae), 0.45);
    const ground = new THREE.Color(0x53472f).lerp(sky, w.cloud * 0.3);
    const sunCol = new THREE.Color(t.sun);

    const tex = TEX.skyGradient(
      `#${zenith.getHexString()}`,
      `#${horizon.getHexString()}`,
      `#${ground.getHexString()}`,
      sunElevation,
      `rgba(${Math.round(sunCol.r * 255)},${Math.round(sunCol.g * 255)},${Math.round(sunCol.b * 255)},${t.lightFactor})`,
    );

    this.envRT?.dispose();
    this.envRT = this.pmrem.fromEquirectangular(tex);
    this.scene.environment = this.envRT.texture;
    // The environment supplies the ambient term. Kept low enough that the SUN
    // is unmistakably the key light — otherwise the tank is lit evenly from
    // every direction, its shaded side is as bright as its sunlit side, and it
    // casts no readable shadow.
    this.scene.environmentIntensity = 0.34 * (0.5 + t.lightFactor * 0.6);
    applyEnvironment(this.envRT.texture, this.scene.environmentIntensity);

    // Use the same authored sky as the visible background. A flat clear colour
    // was being sRGB-encoded twice through the composer and came out washed
    // out; a real gradient with the sun in the right place is both correct and
    // a great deal better looking than a single flat blue.
    this._skyTexture?.dispose();
    this._skyTexture = tex;
    this.scene.background = tex;
    this.scene.backgroundIntensity = 0.9 + t.lightFactor * 0.25;
    this.scene.backgroundBlurriness = 0.02;
  }

  /**
   * Keep the shadow frustum hugging the camera so it stays sharp over a 3 km
   * map, and snap it to the shadow-map texel grid so shadow edges do not crawl
   * as the tank moves.
   */
  updateShadowFrustum(focus) {
    const d = this.q.shadowDistance;
    const texelSize = (d * 2) / this.q.shadowMapSize;
    const snapped = new THREE.Vector3(
      Math.round(focus.x / texelSize) * texelSize,
      Math.round(focus.y / texelSize) * texelSize,
      Math.round(focus.z / texelSize) * texelSize,
    );
    this.sun.target.position.copy(snapped);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(snapped).addScaledVector(this.sunDirection, this.sunDistance);
    this.sun.updateMatrixWorld();
  }

  // ---- Level of detail -----------------------------------------------------

  registerLod(group, builder, opts = {}) {
    const entry = {
      group, builder,
      levels: [null, null, null],
      current: -1,
      distances: opts.distances || [70, 220],
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

    const scored = this.lodGroups.map((e) => ({ e, d: e.group.position.distanceTo(cameraPos) }));
    scored.sort((a, b) => a.d - b.d);

    for (const { e, d } of scored) {
      const [d0, d1] = e.distances;
      let want = d < d0 * bias ? 0 : d < d1 * bias ? 1 : 2;
      // The player's own Tiger is always at full detail; it is the whole point.
      if (e.important) want = 0;
      else if (want === 0) {
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

  registerProp(obj) { this.props.push(obj); return obj; }

  _cullProps(cameraPos) {
    const maxD2 = this.q.propDistance * this.q.propDistance;
    for (const p of this.props) {
      const dx = p.position.x - cameraPos.x;
      const dz = p.position.z - cameraPos.z;
      p.visible = (dx * dx + dz * dz) < maxD2;
    }
  }

  /**
   * Adapt render resolution to hold the frame budget. This is what lets a phone
   * run the same simulation: when it cannot keep up it renders fewer pixels, it
   * does not simplify the tank or the physics.
   */
  _updateDynamicResolution(frameMs) {
    if (!this.dynamicResolution) return;
    this._frameAcc += frameMs;
    this._frameCount++;
    if (this._frameCount < 30) return;

    const avg = this._frameAcc / this._frameCount;
    this._frameAcc = 0; this._frameCount = 0;

    let next = this.resolutionScale;
    if (avg > this.targetFrameMs * 1.25) next -= 0.08;
    else if (avg < this.targetFrameMs * 0.82) next += 0.05;
    next = clamp(next, 0.5, 1.0);

    if (Math.abs(next - this.resolutionScale) > 0.005) {
      this.resolutionScale = next;
      this.resize();
    }
  }

  render(dt, frameMs) {
    const camPos = this.camera.position;
    this._updateLod(camPos);
    this._cullProps(camPos);
    this.updateShadowFrustum(camPos);
    this._updateDynamicResolution(frameMs);

    this.renderer.info.reset();
    if (!this.post.render(dt)) {
      this.renderer.render(this.scene, this.camera);
    }
    // Snapshot before the next frame resets it, so stats() can be called at any
    // point in the frame and still report the scene rather than a blit quad.
    const r = this.renderer.info.render;
    this._lastStats = {
      drawCalls: r.calls, triangles: r.triangles, lines: r.lines, points: r.points,
    };
  }

  /**
   * The turret lamp. A Tiger had ONE small bulb in the fighting compartment, and
   * with the hatch shut that plus five slits of daylight was all the light the
   * crew had. It must never approach daylight, or buttoning up stops being a
   * sacrifice.
   */
  setInteriorLighting(on, pos, hatchOpen) {
    this.interiorLight.intensity = on ? (hatchOpen ? 0.85 : 0.45) : 0;
    if (pos) this.interiorLight.position.copy(pos);
  }

  stats() {
    const info = this.renderer.info;
    const last = this._lastStats || { drawCalls: 0, triangles: 0 };
    return {
      quality: this.qualityName,
      resolutionScale: this.resolutionScale,
      drawCalls: last.drawCalls,
      triangles: last.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      lodGroups: this.lodGroups.length,
      post: this.post.config,
    };
  }

  dispose() {
    for (const e of this.lodGroups) for (const l of e.levels) if (l) disposeTree(l);
    this.post.dispose();
    this.envRT?.dispose();
    this._skyTexture?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // Materials are shared and cached in Materials.js, so they are NOT disposed
    // here — doing so would blank every other object using the same steel.
  });
  root.parent?.remove(root);
}

export { buildTerrainMesh } from '../world/TerrainMesh.js';
