// ===========================================================================
//  GAME
//
//  The state machine and the glue. Everything below it is testable in isolation;
//  this is where the simulation, the renderer, the audio and the interface meet.
//
//  States:  menu -> briefing -> staging -> mission -> after action -> briefing…
// ===========================================================================

import * as THREE from 'three';

import { Loop } from '../core/Loop.js';
import { bus } from '../core/EventBus.js';
import { Rng } from '../core/Rng.js';
import { clamp, clamp01, DEG, RAD, normalizeAngle, angleDelta, formatGrid, bearingToClock, callRange, damp } from '../core/MathUtil.js';

import { Terrain } from '../world/Terrain.js';
import { buildBriefingTent, updateBriefingTent, populateSandTable } from '../world/BriefingTent.js';
import { buildStagingArea, updateStagingArea, crewActivity } from '../world/StagingArea.js';
import { buildTree, buildIzba, buildWreck, buildGunPit, buildTrench, buildCropField, buildSignalPole } from '../world/Props.js';

import { World } from '../sim/World.js';
import { Vehicle } from '../sim/Vehicle.js';
import { CrewManager, generateCrewman } from '../sim/CrewSim.js';
import { commanderObserver, CONTACT_SOURCE } from '../sim/Spotting.js';
import { OUTCOME } from '../sim/Penetration.js';

import { EnemyAI, AI_STATE } from '../ai/EnemyAI.js';
import { FriendlyAI, PLATOON_ORDER } from '../ai/FriendlyAI.js';

import { Renderer, buildTerrainMesh, QUALITY, detectQuality, disposeTree } from '../render/Renderer.js';
import { buildTiger, updateTiger } from '../render/TigerModel.js';
import { buildInterior, updateInterior } from '../render/TigerInterior.js';
import { buildVehicleModel, updateVehicleModel, applyDestroyed } from '../render/VehicleModels.js';
import { buildFigure, poseFigure } from '../render/CrewModels.js';
import { Effects } from '../render/Effects.js';

import { audio } from '../audio/AudioEngine.js';
import { InputManager, INPUT_MODE } from '../input/InputManager.js';

import { Hud } from '../ui/Hud.js';
import { CommandMenu } from '../ui/CommandMenu.js';
import { TouchControls, contextualButtons } from '../ui/TouchControls.js';
import {
  ScreenManager, briefingHtml, loadoutHtml, rosterHtml, repairHtml, repairCrewHtml,
  afterActionHtml, mapHtml, drawMap, settingsHtml, campaignRecordHtml,
} from '../ui/Screens.js';

import { Campaign, TANK_STATUS } from '../campaign/Campaign.js';
import { SaveSystem } from '../campaign/Save.js';
import { makeDifficulty } from './Difficulty.js';
import { CommandSystem, CMD, COMMAND_TREE } from './CommandSystem.js';
import { RepairSystem } from './RepairSystem.js';
import { RecoverySystem, RECOVERY_STATE } from './RecoverySystem.js';
import { Abandonment } from './Abandonment.js';
import { RadioSystem } from './RadioSystem.js';

import { TIGER_1H, L, STATIONS } from '../data/tiger1h.js';
import { VEHICLES, SOVIET_COMBAT } from '../data/vehicles.js';
import { MISSIONS, getMission, TIME_OF_DAY, WEATHER } from '../data/missions.js';

export const STATE = {
  MENU: 'menu',
  BRIEFING: 'briefing',
  STAGING: 'staging',
  MISSION: 'mission',
  AFTER_ACTION: 'after_action',
};

/** Where the commander's eyes are. This is the central tactical choice. */
export const VIEW = {
  BUTTONED: 'vision_blocks',
  HATCH_OPEN: 'hatch_open',
  HEAD_OUT: 'head_out',
  BINOCULARS: 'binoculars',
  GUNNER_SIGHT: 'gunner_sight',
  ON_FOOT: 'on_foot',
};

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.bus = bus;
    this.rng = new Rng(20430705);

    this.renderer = new Renderer(canvas, { quality: detectQuality() });
    this.input = new InputManager(canvas, bus);
    this.effects = new Effects(this.renderer.scene, { quality: QUALITY[this.renderer.qualityName].particleQuality });

    this.hud = new Hud(uiRoot.querySelector('#hud'), bus, {});
    this.screens = new ScreenManager(uiRoot.querySelector('#screens'), bus);
    this.touch = new TouchControls(uiRoot.querySelector('#touch'), this.input, bus);
    this.commandMenu = new CommandMenu(uiRoot.querySelector('#cmdmenu'), bus, {
      touch: this.input.mode === INPUT_MODE.TOUCH,
      onIssue: (id, item) => this.issueCommand(id, item),
      getContext: () => ({
        tiger: this.tiger, crewManager: this.tiger?.crewManager,
        repair: this.repair, recovery: this.recovery, abandonment: this.abandonment,
      }),
    });

    this.state = STATE.MENU;
    this.campaign = null;
    this.mission = null;
    this.view = VIEW.ON_FOOT;
    this.paused = false;
    this.hudVisible = true;

    // The commander's own body: a person, with a head that can be hit.
    this.player = {
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0, pitch: 0,
      onFoot: true,
      inTank: false,
      onHull: false,
      height: 1.72,
      speed: 2.6,
    };

    this.sceneRoot = new THREE.Group();
    this.renderer.scene.add(this.sceneRoot);

    this.loop = new Loop({
      fixedStep: 1 / 60,
      onFixed: (dt) => this.fixedUpdate(dt),
      onRender: (dt) => this.render(dt),
    });

    this._wireEvents();
    this._wireScreens();
  }

  // =========================================================================
  //  Boot
  // =========================================================================

  start() {
    this.loop.start();
    this.showMenu();
  }

  showMenu() {
    this.state = STATE.MENU;
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    const saves = SaveSystem.list();
    this.screens.show('menu', `
      <div class="menu">
        <div class="menu-title">
          <h1>TIGER</h1>
          <div class="menu-sub">Panzerkampfwagen VI Ausf. H · Sd.Kfz. 181</div>
          <div class="menu-sub2">A first-person crew simulator · Operation Zitadelle, July 1943</div>
        </div>
        <div class="menu-body">
          <p class="menu-blurb">
            You are the commander of Tiger 101, 3. Kompanie, schwere Panzer-Abteilung 503.
            You do not drive this tank and you do not fire its gun. Four men do that,
            and they are only as good as their training, their nerve and their wounds allow.
          </p>
          <div class="menu-buttons">
            <button class="btn btn-primary" data-act="new-campaign">New campaign</button>
            ${saves.length ? `<button class="btn" data-act="load-menu">Continue (${saves.length} save${saves.length === 1 ? '' : 's'})</button>` : ''}
            <button class="btn" data-act="open-settings">Settings</button>
            <button class="btn btn-ghost" data-act="open-about">About the vehicle</button>
          </div>
          <div class="menu-diff">
            <span>Difficulty:</span>
            ${['easy', 'normal', 'hard', 'simulation'].map((d) => `
              <button class="btn-sm diff-pick ${(this.pendingDifficulty || 'normal') === d ? 'selected' : ''}"
                data-act="pick-difficulty" data-id="${d}">${d}</button>`).join('')}
          </div>
        </div>
      </div>`);
  }

  // =========================================================================
  //  Campaign lifecycle
  // =========================================================================

  newCampaign(difficultyId = 'normal') {
    this.campaign = new Campaign({
      seed: Date.now() % 1e9,
      difficulty: makeDifficulty(difficultyId),
    });
    this.hud.difficulty = this.campaign.difficulty;
    this.beginBriefing();
  }

  loadCampaign(slot) {
    const r = SaveSystem.load(slot);
    if (!r.ok) { this.hud.warn(r.reason, 'refused', 5); return; }
    this.campaign = r.campaign;
    this.hud.difficulty = this.campaign.difficulty;
    this.beginBriefing();
  }

  // =========================================================================
  //  BRIEFING
  // =========================================================================

  beginBriefing() {
    this.state = STATE.BRIEFING;
    this._clearScene();

    // Advance the campaign's between-mission bookkeeping.
    const repairNotes = this.campaign.advanceRepairs();
    this.mission = getMission(this.campaign.missionIndex);
    this.missionRng = new Rng(this.mission.terrainSeed ^ this.campaign.seed);

    // The terrain the sand table shows is the terrain the battle uses.
    this.terrain = new Terrain({ seed: this.mission.terrainSeed, ...(this.mission.terrain || {}) });
    this.terrain.wet = WEATHER[this.mission.weather]?.wet ?? 0;

    // Plan the enemy so the sand table can report (some of) it.
    this.enemyPlan = this._planEnemyForce();

    // Build the tent.
    this.tent = buildBriefingTent(this.terrain, this.mission, this.missionRng);
    this.sceneRoot.add(this.tent);
    const placed = populateSandTable(this.tent, this.mission, this.terrain, this.missionRng,
      this.enemyPlan.map((e) => ({ x: e.x, z: e.z, type: e.type, label: VEHICLES[e.type]?.short || e.type })));
    this.sandTableReported = placed;

    // Ground outside the tent.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 24),
      new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.sceneRoot.add(ground);
    for (let i = 0; i < 10; i++) {
      const t = buildTree(this.missionRng, 1);
      const a = this.missionRng.range(0, Math.PI * 2);
      const r = this.missionRng.range(24, 60);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.sceneRoot.add(t);
    }

    this.renderer.setEnvironment('morning', 'clear');

    // Start outside the tent door so the player walks in.
    this.player.pos.set(0, 0, 9);
    this.player.yaw = Math.PI;
    this.player.pitch = -0.05;
    this.player.onFoot = true;
    this.player.inTank = false;
    this.view = VIEW.ON_FOOT;

    this.hud.setVisible(true);
    this.touch.setVisible(this.input.mode === INPUT_MODE.TOUCH);
    audio.setMode('outside');

    // Show the briefing document first; the player can then walk the tent.
    this.screens.show('briefing', briefingHtml(this.mission, this.campaign, {
      unreported: Math.max(0, this.enemyPlan.length - placed.length),
    }));
    if (repairNotes.length) {
      for (const n of repairNotes) this.hud.addSubtitle({ role: 'system', name: '', line: n, tone: 'calm' });
    }
  }

  /** Decide where the enemy actually is. The sand table only reports some of it. */
  _planEnemyForce() {
    const out = [];
    const half = this.terrain.half;
    const rng = this.missionRng;
    for (const group of this.mission.enemyForce) {
      for (let i = 0; i < group.count; i++) {
        // Dug-in guns sit in tree lines and on reverse slopes; armour deploys deeper.
        const isGun = VEHICLES[group.type]?.static;
        let x, z, guard = 0;
        do {
          const spread = isGun ? 0.42 : 0.62;
          x = rng.range(-half * spread, half * spread);
          z = rng.range(half * 0.16, half * 0.78);
          guard++;
        } while (!this.terrain.passable(x, z) && guard < 40);
        out.push({
          type: group.type, x, z,
          posture: group.posture, skill: group.skill,
          heading: Math.PI + rng.range(-0.5, 0.5),
        });
      }
    }
    return out;
  }

  // =========================================================================
  //  STAGING AREA
  // =========================================================================

  beginStaging() {
    this.state = STATE.STAGING;
    this._clearScene();
    this.screens.hide();

    this.staging = buildStagingArea({
      rng: this.missionRng,
      terrain: this.terrain,
      lod: this.renderer.qualityName === 'low' ? 1 : 0,
      includeRecovery: this.campaign.logistics.recoveryVehicles > 0,
    });
    this.sceneRoot.add(this.staging);

    this.renderer.setEnvironment(this.mission.timeOfDay, this.mission.weather);

    // Spawn beside the Tiger, not inside it.
    this.player.pos.set(-6, 0, 6);
    this.player.yaw = -0.9;
    this.player.pitch = 0;
    this.player.onFoot = true;
    this.player.inTank = false;
    this.player.onHull = false;
    this.view = VIEW.ON_FOOT;
    audio.setMode('outside');

    this.hud.setVisible(true);
    this.hud.addSubtitle({
      role: 'system', name: '', tone: 'calm',
      line: 'Your crew are preparing the tank. Walk around it, speak to them, then climb aboard.',
    });
  }

  // =========================================================================
  //  MISSION
  // =========================================================================

  beginMission() {
    this.state = STATE.MISSION;
    this._clearScene();
    this.screens.hide();

    const diff = this.campaign.difficulty;

    // ---- The world ---------------------------------------------------------
    this.world = new World({
      terrain: this.terrain, bus: this.bus, rng: this.missionRng,
      difficulty: diff,
      env: {
        ...TIME_OF_DAY[this.mission.timeOfDay],
        ...WEATHER[this.mission.weather],
      },
    });
    this.world.spawnSupportVehicle = (id, at) => this._spawnSupport(id, at);

    // ---- Terrain and scenery -----------------------------------------------
    const terrainMesh = buildTerrainMesh(this.terrain, this.renderer.qualityName);
    this.sceneRoot.add(terrainMesh);
    this._populateBattlefield();

    this.renderer.setEnvironment(this.mission.timeOfDay, this.mission.weather);

    // ---- The Tiger ----------------------------------------------------------
    this.tiger = this._buildPlayerTiger();
    this.world.addVehicle(this.tiger);

    // Model, interior and LOD.
    this.tigerGroup = new THREE.Group();
    this.sceneRoot.add(this.tigerGroup);
    this.tigerModel = buildTiger({ lod: 0 });
    this.tigerGroup.add(this.tigerModel);
    this.interiorModel = buildInterior({ lod: this.renderer.qualityName === 'low' ? 1 : 0 });
    this.tigerGroup.add(this.interiorModel);
    this._buildCrewFigures();

    // ---- Systems ------------------------------------------------------------
    this.repair = new RepairSystem({ world: this.world, bus: this.bus, rng: this.missionRng, logistics: this.campaign.logistics, difficulty: diff });
    this.recovery = new RecoverySystem({ world: this.world, bus: this.bus, rng: this.missionRng, campaign: this.campaign, difficulty: diff });
    this.abandonment = new Abandonment({ world: this.world, bus: this.bus, rng: this.missionRng, difficulty: diff });
    this.radio = new RadioSystem({ world: this.world, bus: this.bus, rng: this.missionRng, tiger: this.tiger, campaign: this.campaign, difficulty: diff });
    this.commands = new CommandSystem({
      world: this.world, bus: this.bus, rng: this.missionRng, tiger: this.tiger,
      repair: this.repair, recovery: this.recovery, abandonment: this.abandonment,
      radio: this.radio, difficulty: diff,
    });

    // ---- Forces -------------------------------------------------------------
    this._spawnEnemies();
    this._spawnFriendlies();

    // ---- The commander ------------------------------------------------------
    this.player.inTank = true;
    this.player.onFoot = false;
    this.view = VIEW.BUTTONED;
    this.hud.showOptics('vision_block');
    this.tiger.hatchOpen.cupola_hatch = false;
    this.tiger.commanderHeadOut = false;
    this.commanderLook = { yaw: 0, pitch: 0 };

    // ---- Audio --------------------------------------------------------------
    audio.setMode('buttoned');
    audio.engineLoop('tiger', { interior: true, volume: 0.55 });
    audio.trackLoop('tiger_tracks', { interior: true });

    // ---- Mission state ------------------------------------------------------
    this.missionState = {
      startedAt: 0, elapsed: 0,
      objectives: this.mission.objectives.map((o) => ({ ...o, complete: false, progress: 0 })),
      kills: 0, gunsKilled: 0, friendlyLosses: 0,
      hitsTaken: 0, penetrationsTaken: 0, repairsCompleted: 0,
      ended: false, outcome: null,
      holdTimer: 0,
    };

    this.hud.setVisible(true);
    this.touch.setVisible(this.input.mode === INPUT_MODE.TOUCH);
    this.tiger.driveline.start();

    this.bus.emit('mission:started', { mission: this.mission });
    setTimeout(() => this.radio._speak('HQ',
      `Tiger 101, this is battalion. ${this.mission.briefing.objective}`, 'hq'), 2500);
  }

  _buildPlayerTiger() {
    const spec = TIGER_1H;
    const t = new Vehicle(spec, {
      bus: this.bus, rng: this.missionRng, terrain: this.terrain,
      isPlayer: true, faction: 'german', callsign: this.campaign.tank.callsign,
    });

    // Carry the campaign's damage forward. The tank remembers.
    if (this.campaign.tank.components && Object.keys(this.campaign.tank.components).length) {
      for (const [id, st] of Object.entries(this.campaign.tank.components)) {
        if (t.components[id]) t.components[id] = { ...st };
      }
    }

    // Crew from the roster — the same men as last time, with the same wounds.
    const roster = this.campaign.roster;
    t.crew = ['gunner', 'loader', 'driver', 'radio']
      .map((r) => roster.assigned[r])
      .filter(Boolean);
    this.commanderMan = roster.assigned.commander;
    if (this.commanderMan) t.crew.push(this.commanderMan);
    t.crewManager = new CrewManager(
      t.crew.filter((m) => m.role !== 'commander'), this.bus, this.missionRng, spec);

    // Ammunition from the company's stores.
    const loadout = this.chosenLoadout || spec.armament.defaultLoadout;
    const issued = this.campaign.logistics.issueLoadout(loadout);
    t.loadAmmunition(issued.issued);
    t.fuelL = this.campaign.logistics.issueFuel(spec.mobility.fuelCapacityL);

    if (issued.shortfalls.length) {
      for (const s of issued.shortfalls) {
        this.hud.warn(`Only ${s.got} of ${s.wanted} ${s.nature} available`, 'info', 6);
      }
    }

    // Start position: on the friendly edge of the map.
    t.pos = { x: 0, y: this.terrain.heightAt(0, -this.terrain.half * 0.62), z: -this.terrain.half * 0.62 };
    t.heading = 0;
    t.selectedAmmo = 'pzgr39';
    t.beginReload('pzgr39');
    return t;
  }

  _buildCrewFigures() {
    // The four other men, visible at their stations inside the turret.
    this.crewFigures = {};
    for (const role of ['gunner', 'loader', 'driver', 'radio']) {
      const st = STATIONS[role];
      const fig = buildFigure({ kit: 'panzer' });
      fig.scale.setScalar(0.94);
      fig.position.set(st.seat[0], st.seat[1] - 0.86, st.seat[2]);
      fig.userData.baseY = st.seat[1] - 0.86;
      fig.rotation.y = role === 'loader' ? -0.3 : role === 'gunner' ? 0.2 : 0;
      if (st.onTurret) this.interiorModel.add(fig);
      else this.tigerGroup.add(fig);
      this.crewFigures[role] = fig;
    }
    // The commander's own body, visible when head-out from the outside.
    this.commanderBody = buildFigure({ kit: 'panzer', headOnly: true });
    this.commanderBody.position.set(-0.46, 2.55, 0.12);
    this.commanderBody.visible = false;
    this.tigerGroup.add(this.commanderBody);
  }

  _populateBattlefield() {
    const rng = this.missionRng;
    const t = this.terrain;

    // Woods.
    for (const w of t.woods) {
      const n = w.type === 'copse' ? Math.round(w.radius * 0.35) : Math.round(w.length * 0.10);
      for (let i = 0; i < n; i++) {
        let x, z;
        if (w.type === 'copse') {
          const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * w.radius;
          x = w.x + Math.cos(a) * r; z = w.z + Math.sin(a) * r;
        } else {
          const along = rng.range(-w.length, w.length);
          const across = rng.range(-w.width, w.width);
          x = w.x + Math.cos(w.dir) * along - Math.sin(w.dir) * across;
          z = w.z + Math.sin(w.dir) * along + Math.cos(w.dir) * across;
        }
        const tree = buildTree(rng, this.renderer.qualityName === 'high' ? 0 : 1);
        tree.position.set(x, t.heightAt(x, z), z);
        this.sceneRoot.add(tree);
        this.renderer.registerProp(tree);
      }
    }

    // Villages.
    for (const v of t.villages) {
      for (let i = 0; i < v.houses; i++) {
        const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * v.radius;
        const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        const h = buildIzba(rng, this.renderer.qualityName === 'high' ? 0 : 1);
        h.position.set(x, t.heightAt(x, z), z);
        h.rotation.y = rng.range(0, Math.PI * 2);
        this.sceneRoot.add(h);
        this.renderer.registerProp(h);
      }
    }

    // Soviet field works.
    for (const tr of t.trenchLines) {
      const g = buildTrench(rng, tr.length);
      g.position.set(tr.x, t.heightAt(tr.x, tr.z), tr.z);
      g.rotation.y = tr.dir;
      this.sceneRoot.add(g);
      this.renderer.registerProp(g);
    }

    // Standing crops, instanced.
    if (this.renderer.qualityName !== 'low') {
      for (let i = 0; i < 6; i++) {
        const x = rng.range(-t.half * 0.8, t.half * 0.8);
        const z = rng.range(-t.half * 0.8, t.half * 0.8);
        if (t.groundAt(x, z) !== 'field') continue;
        const field = buildCropField(rng, 140, 900, this.renderer.qualityName === 'high' ? 0 : 1);
        field.position.set(x, t.heightAt(x, z), z);
        this.sceneRoot.add(field);
        this.renderer.registerProp(field);
      }
    }

    // Wrecks from earlier fighting — the salient was full of them by 7 July.
    for (let i = 0; i < rng.int(2, 6); i++) {
      const x = rng.range(-t.half * 0.6, t.half * 0.6);
      const z = rng.range(-t.half * 0.2, t.half * 0.7);
      const w = buildWreck(rng);
      w.position.set(x, t.heightAt(x, z), z);
      w.rotation.y = rng.range(0, Math.PI * 2);
      this.sceneRoot.add(w);
      this.renderer.registerProp(w);
    }
  }

  _spawnEnemies() {
    this.enemyModels = new Map();
    for (const plan of this.enemyPlan) {
      const spec = VEHICLES[plan.type];
      const v = new Vehicle(spec, {
        bus: this.bus, rng: this.missionRng, terrain: this.terrain,
        faction: 'soviet', callsign: spec.short,
      });
      v.pos = { x: plan.x, y: this.terrain.heightAt(plan.x, plan.z), z: plan.z };
      v.heading = plan.heading;
      v.crew = ['gunner', 'loader', 'driver', 'radio']
        .slice(0, spec.crew || 4)
        .map((r) => generateCrewman(r, this.missionRng, plan.skill > 0.6 ? 'seasoned' : 'trained'));
      v.crewManager = new CrewManager(v.crew, this.bus, this.missionRng, spec);
      if (spec.concealment) v.spec = { ...spec, concealment: plan.concealment ?? spec.concealment };

      const diff = this.campaign.difficulty;
      const ai = new EnemyAI(v, this.world, {
        skill: clamp01(plan.skill * (0.7 + diff.enemySkill * 0.6)),
        aggression: diff.enemyAggression,
        discipline: plan.skill,
        initialState: plan.posture === 'ambush' ? AI_STATE.AMBUSH
          : plan.posture === 'advance' || plan.posture === 'pursue' ? AI_STATE.ADVANCE
            : AI_STATE.PATROL,
        ambushFacing: plan.heading,
        waypoints: this._patrolRoute(plan),
        morale: 0.55 + plan.skill * 0.35,
      });
      ai.objective = { x: 0, z: -this.terrain.half * 0.55 };
      this.world.addVehicle(v, ai);
      this._attachModel(v);
    }
  }

  _patrolRoute(plan) {
    const rng = this.missionRng;
    const pts = [];
    for (let i = 0; i < 3; i++) {
      pts.push({
        x: plan.x + rng.range(-250, 250),
        z: plan.z + rng.range(-250, 250),
      });
    }
    return pts;
  }

  _spawnFriendlies() {
    this.friendlyAIs = [];
    let offset = 0;
    for (const f of this.mission.friendlyForce || []) {
      for (let i = 0; i < f.count; i++) {
        const spec = VEHICLES[f.type];
        if (!spec) continue;
        const v = new Vehicle(spec, {
          bus: this.bus, rng: this.missionRng, terrain: this.terrain,
          faction: 'german', callsign: `${spec.short} ${101 + offset}`,
        });
        const x = -120 + offset * 55;
        const z = -this.terrain.half * 0.66 + (offset % 2) * 40;
        v.pos = { x, y: this.terrain.heightAt(x, z), z };
        v.heading = 0;
        v.crew = ['gunner', 'loader', 'driver', 'radio']
          .slice(0, spec.crew || 4)
          .map((r) => generateCrewman(r, this.missionRng, 'trained'));
        v.crewManager = new CrewManager(v.crew, this.bus, this.missionRng, spec);
        const ai = new FriendlyAI(v, this.world, {
          leader: this.tiger, skill: 0.55, aggression: 0.5,
          formationOffset: { x: (offset % 2 ? 1 : -1) * (50 + offset * 12), z: -40 - offset * 15 },
        });
        v.driveline?.start();
        this.world.addVehicle(v, ai);
        this.friendlyAIs.push(ai);
        this._attachModel(v);
        offset++;
      }
    }
  }

  _spawnSupport(id, at) {
    const spec = VEHICLES[id];
    if (!spec) return null;
    const v = new Vehicle(spec, {
      bus: this.bus, rng: this.missionRng, terrain: this.terrain,
      faction: 'german', callsign: spec.short,
    });
    v.pos = { x: at.x, y: this.terrain.heightAt(at.x, at.z), z: at.z };
    v.crew = ['driver', 'radio'].map((r) => generateCrewman(r, this.missionRng, 'trained'));
    v.crewManager = new CrewManager(v.crew, this.bus, this.missionRng, spec);
    const ai = new FriendlyAI(v, this.world, { leader: this.tiger, skill: 0.6 });
    v.driveline?.start();
    this.world.addVehicle(v, ai);
    this._attachModel(v);
    return { vehicle: v, ai };
  }

  /** Give a simulation vehicle a visual model with level-of-detail swapping. */
  _attachModel(v) {
    const group = new THREE.Group();
    group.position.set(v.pos.x, v.pos.y, v.pos.z);
    this.sceneRoot.add(group);
    this.renderer.registerLod(group, (lod) => buildVehicleModel(v.spec.id, lod), {
      distances: [90, 380],
    });
    v._model = group;
    if (!this.vehicleModels) this.vehicleModels = [];
    this.vehicleModels.push({ vehicle: v, group });
  }

  // =========================================================================
  //  Fixed-rate simulation
  // =========================================================================

  fixedUpdate(dt) {
    if (this.paused) return;

    switch (this.state) {
      case STATE.BRIEFING:
      case STATE.STAGING:
        this._updateOnFoot(dt);
        break;
      case STATE.MISSION:
        this._updateMission(dt);
        break;
      default: break;
    }
  }

  _updateOnFoot(dt) {
    if (this.screens.isOpen) return;
    const i = this.input.intent;
    const spd = this.player.speed * (i.run ? 2.0 : 1) * (i.crouch ? 0.5 : 1);
    const s = Math.sin(this.player.yaw), c = Math.cos(this.player.yaw);
    this.player.pos.x += (i.move.x * c + i.move.y * s) * spd * dt;
    this.player.pos.z += (-i.move.x * s + i.move.y * c) * spd * dt;
    // Keep the player on the ground.
    this.player.pos.y = this.state === STATE.MISSION
      ? this.terrain.heightAt(this.player.pos.x, this.player.pos.z) : 0;
  }

  _updateMission(dt) {
    const ms = this.missionState;
    if (ms.ended) return;
    ms.elapsed += dt;

    this.world.update(dt);
    this.commands.update(dt);
    this.radio.update(dt);
    this.repair.update(dt, this.tiger);
    this.recovery.update(dt, this.tiger);
    this.abandonment.update(dt, this.tiger);

    // The commander is a man in a place, and that place decides his exposure.
    this.tiger.commanderHeadOut = (this.view === VIEW.HEAD_OUT || this.view === VIEW.BINOCULARS);
    this.tiger.commanderLook = this.commanderLook.yaw;
    if (this.commanderMan) {
      this.commanderMan.update(dt, { underFire: this.tiger.crewManager?.underFire });
      // Bleeding to death is a real outcome.
      if (this.commanderMan.state === 'dead' && !ms.ended) {
        this._endMission(false, 'The commander was killed.');
        return;
      }
    }

    // What the commander can see from where he is.
    this._runCommanderObservation(dt);

    // Objectives.
    this._checkObjectives(dt);

    // Audio.
    this._updateAudio(dt);
  }

  _runCommanderObservation(dt) {
    const modeKey = this.view === VIEW.BINOCULARS ? 'binoculars'
      : this.view === VIEW.HEAD_OUT ? 'head_out'
        : this.view === VIEW.HATCH_OPEN ? 'hatch_open' : 'vision_blocks';
    const obs = commanderObserver(this.tiger, modeKey, this.commanderMan, this.world.env);
    obs.viewAzimuth = this.tiger.heading + this.commanderLook.yaw;
    // A wounded commander sees less. That is the whole penalty; no health bar.
    if (this.commanderMan) {
      obs.acuity *= clamp01(this.commanderMan.health * 1.1) * (1 - this.commanderMan.shock * 0.5);
    }
    const targets = this.world.vehicles.filter((v) => v !== this.tiger && v.faction !== 'german');
    const changed = this.world.spotting.observe(obs, targets, dt, this.world.env);

    // The crew are also looking, through their own devices.
    for (const role of ['gunner', 'loader', 'radio', 'driver']) {
      const man = this.tiger.crewManager?.get(role);
      if (!man || man.outsideTank) continue;
      const st = STATIONS[role];
      const crewObs = {
        name: man.name, faction: 'german', pos: this.tiger.pos,
        eyeHeight: st.eye[1], fovDeg: st.vision.fovDeg,
        magnification: st.vision.magnification,
        viewAzimuth: this.tiger.heading + (st.onTurret ? this.tiger.turretAz : 0),
        acuity: clamp01(0.4 + (man.skill.spotting ?? man.experience) * 0.5) * man.effectiveness,
        identification: clamp01((man.skill.identification ?? man.experience) * man.effectiveness),
        sourceKind: CONTACT_SOURCE.CREW,
        searchFocus: role === 'gunner' ? 1.2 : 0.7,
      };
      const found = this.world.spotting.observe(crewObs, targets, dt, this.world.env);
      // When a crewman finds something, he says so — with a clock bearing.
      for (const c of found) {
        if (c.idLevel === 0) {
          const call = this.world.spotting.callOut(c, this.tiger.pos, this.tiger.heading);
          this.tiger.crewManager.speak(man, 'spot.movement', { clock: call.clock });
        } else if (c.idLevel >= 3 && !c._announced) {
          c._announced = true;
          const call = this.world.spotting.callOut(c, this.tiger.pos, this.tiger.heading);
          this.tiger.crewManager.speak(man, 'spot.identified',
            { type: c.label, clock: call.clock, range: call.range }, true);
        }
      }
    }
  }

  _checkObjectives(dt) {
    const ms = this.missionState;
    const t = this.tiger;

    for (const o of ms.objectives) {
      if (o.complete) continue;
      switch (o.kind) {
        case 'reach': {
          const goal = { x: 0, z: this.terrain.half * 0.5 };
          if (Math.hypot(t.pos.x - goal.x, t.pos.z - goal.z) < 120) o.complete = true;
          break;
        }
        case 'hold': {
          const enemiesClose = this.world.vehicles.some((v) =>
            v.faction === 'soviet' && !v.destroyed
            && Math.hypot(v.pos.x - t.pos.x, v.pos.z - t.pos.z) < 1400);
          if (!enemiesClose || true) o.progress += dt;
          if (o.progress >= o.seconds) o.complete = true;
          break;
        }
        case 'destroy': {
          const n = o.target === 'gun'
            ? ms.gunsKilled
            : this.world.vehicles.filter((v) => v.spec.id === o.target && v.destroyed).length;
          o.progress = n;
          if (n >= o.count) o.complete = true;
          break;
        }
        case 'survive':
          o.complete = !t.destroyed && !t.abandoned;
          break;
        default: break;
      }
    }

    // The mission ends when it ends, not when the tank reaches zero of anything.
    const required = ms.objectives.filter((o) => o.required);
    if (required.every((o) => o.complete)) {
      this._endMission(true, 'All objectives accomplished.');
      return;
    }
    if (t.destroyed || t.ammoDetonated) {
      this._endMission(false, 'Tiger 101 was destroyed.');
      return;
    }
    if (this.abandonment.stage === 'complete') {
      this._endMission(false, 'Tiger 101 was abandoned.');
      return;
    }
    // Out of ammunition, immobile, and no help coming is also an ending.
    if (t.ammoRemaining === 0 && !t.assess().mobile && !this.recovery.active) {
      this._endMission(false, 'Out of ammunition and immobilised.');
    }
  }

  _updateAudio(dt) {
    const t = this.tiger;
    if (!audio.ready) return;

    const mode = this.player.onFoot ? 'outside'
      : this.view === VIEW.HEAD_OUT || this.view === VIEW.BINOCULARS ? 'head_out'
        : this.view === VIEW.HATCH_OPEN ? 'hatch_open' : 'buttoned';
    if (mode !== audio.mode) audio.setMode(mode);

    audio.setEngine('tiger', t.driveline?.rpm ?? 0, t.driveline?.engineLoad ?? 0, t.pos);
    audio.setTracks('tiger_tracks', t.driveline?.speed ?? 0);
    audio.setFire(t.fire?.active ? t.fire.severity : 0);

    const fwd = {
      x: Math.sin(this.tiger.heading + this.commanderLook.yaw),
      y: -Math.sin(this.commanderLook.pitch),
      z: Math.cos(this.tiger.heading + this.commanderLook.yaw),
    };
    audio.setListener(this.camera?.position || t.pos, fwd);
  }

  _endMission(success, reason) {
    const ms = this.missionState;
    if (ms.ended) return;
    ms.ended = true;
    ms.outcome = { success, reason };

    audio.stopAll();

    const abandonSummary = this.abandonment.stage !== 'none'
      ? this.abandonment.summary(this.tiger) : null;

    const report = this.campaign.concludeMission({
      tiger: this.tiger,
      missionTitle: this.mission.title,
      objectiveMet: success,
      abandonment: abandonSummary,
      recovery: this.recovery.state === RECOVERY_STATE.COMPLETE
        ? { completed: true, by: this.recovery.recoveryVehicle?.callsign } : null,
      kills: ms.kills,
      gunsKilled: ms.gunsKilled,
      roundsFired: this.tiger.shotsFired,
      hitsTaken: ms.hitsTaken,
      penetrationsTaken: ms.penetrationsTaken,
      repairsCompleted: ms.repairsCompleted,
      friendlyLosses: ms.friendlyLosses,
      crewCauses: this._crewCauses(),
    });

    SaveSystem.autosave(this.campaign);

    this.state = STATE.AFTER_ACTION;
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.screens.show('aar', afterActionHtml(report, this.campaign));
  }

  _crewCauses() {
    const out = {};
    for (const m of this.tiger.crew) {
      if (m.state === 'dead') out[m.role] = m._lastCause || 'killed in action';
    }
    return out;
  }

  // =========================================================================
  //  Render
  // =========================================================================

  render(dt) {
    this.input.poll();
    this._handleInput(dt);

    if (this.state === STATE.BRIEFING && this.tent) {
      updateBriefingTent(this.tent, dt, this.loop.simTime);
    }
    if (this.state === STATE.STAGING && this.staging) {
      updateStagingArea(this.staging, dt, this.loop.simTime, this.missionRng);
    }
    if (this.state === STATE.MISSION && !this.paused) {
      this._renderMission(dt);
    }

    this._updateCamera(dt);
    this.effects.update(dt, this.renderer.camera);
    this.touch.update();
    this.renderer.render(dt, this.loop.smoothedFrameMs);
  }

  _renderMission(dt) {
    // Tiger.
    this.tigerGroup.position.set(this.tiger.pos.x, this.tiger.pos.y, this.tiger.pos.z);
    this.tigerGroup.rotation.set(this.tiger.pitch, this.tiger.heading, this.tiger.roll, 'YXZ');
    updateTiger(this.tigerModel, this.tiger, dt);
    updateInterior(this.interiorModel, this.tiger, dt);

    // The commander's head, visible from outside when he is up.
    this.commanderBody.visible = this.tiger.commanderHeadOut;

    // Crew figures animate at their stations.
    for (const [role, fig] of Object.entries(this.crewFigures || {})) {
      const man = this.tiger.crewManager?.byRole(role);
      if (!man) continue;
      fig.visible = !man.outsideTank;
      const pose = man.state === 'dead' ? 'prone'
        : man.state === 'incapacitated' || man.state === 'seriously wounded' ? 'wounded'
          : role === 'loader' && this.tiger.reloading ? 'work'
            : role === 'gunner' ? 'kneel' : 'idle';
      poseFigure(fig, pose, dt);
    }

    // Other vehicles.
    for (const entry of this.vehicleModels || []) {
      const v = entry.vehicle;
      entry.group.position.set(v.pos.x, v.pos.y, v.pos.z);
      entry.group.rotation.set(v.pitch || 0, v.heading, v.roll || 0, 'YXZ');
      const active = entry.group.userData.activeLod;
      if (active) {
        if (v.destroyed) applyDestroyed(active);
        else updateVehicleModel(active, v, dt);
      }
      // Dust behind moving vehicles.
      if (!v.destroyed && v.dustLevel > 0.1) {
        this.effects.trackDust(v.pos, v.heading, Math.abs(v.driveline?.speed || 0), v.dustLevel);
      }
    }

    // Men on foot.
    this._renderDismounts(dt);

    // Tracers.
    for (const p of this.world.projectiles) {
      if (p.data?.tracer && !p._tracerAdded) { p._tracerAdded = true; this.effects.addTracer(p); }
    }

    // Fires.
    for (const v of this.world.vehicles) {
      if (v.fire?.active) this.effects.addFire(v, v.fire.compartment);
      else this.effects.removeFire(v);
    }

    // HUD.
    this._updateHud();
  }

  _renderDismounts(dt) {
    if (!this.dismountFigures) this.dismountFigures = new Map();
    const live = new Set();
    for (const d of this.world.dismounts) {
      live.add(d.man);
      let fig = this.dismountFigures.get(d.man);
      if (!fig) {
        fig = buildFigure({ kit: 'panzer' });
        this.sceneRoot.add(fig);
        this.dismountFigures.set(d.man, fig);
      }
      fig.position.set(d.pos.x, d.pos.y, d.pos.z);
      fig.userData.baseY = d.pos.y;
      if (d.target) {
        const dx = d.target.x - d.pos.x, dz = d.target.z - d.pos.z;
        if (Math.hypot(dx, dz) > 0.5) fig.rotation.y = Math.atan2(dx, dz);
      }
      const pose = d.man.state === 'dead' ? 'prone'
        : d.man.state === 'incapacitated' ? 'wounded'
          : d.state === 'arrived' ? (d.task?.startsWith('repair') ? 'work' : d.task === 'tow' ? 'kneel' : 'kneel')
            : d.running ? 'run' : 'walk';
      poseFigure(fig, pose, dt);
    }
    // Remove figures for men who have gone back inside.
    for (const [man, fig] of this.dismountFigures) {
      if (!live.has(man)) { disposeTree(fig); this.dismountFigures.delete(man); }
    }
  }

  _updateHud() {
    const t = this.tiger;
    this.hud.updateState(t, formatGrid(t.pos.x, t.pos.z));
    this.hud.updateCompass(t.heading + this.commanderLook.yaw, t.turretAz);
    this.hud.setCommanderCondition(this.commanderMan);

    const tasks = [];
    const rl = this.repair.statusLine();
    if (rl) tasks.push(rl);
    const cl = this.recovery.statusLine();
    if (cl) tasks.push(cl);
    const al = this.abandonment.statusLine();
    if (al) tasks.push(al);
    const fl = this.tiger.fire?.statusLine?.();
    if (fl) tasks.push(fl);
    this.hud.setTaskStatus(tasks);

    if (this.input.mode === INPUT_MODE.TOUCH) {
      this.touch.setContext(contextualButtons({
        mode: this.view === VIEW.HEAD_OUT ? 'head_out'
          : this.view === VIEW.HATCH_OPEN ? 'hatch_open'
            : this.view === VIEW.BINOCULARS ? 'binoculars' : 'buttoned',
        tiger: t, inTank: this.player.inTank,
        nearInteraction: this.nearInteraction,
        repair: this.repair, recovery: this.recovery, abandonment: this.abandonment,
      }));
    }
  }

  // =========================================================================
  //  Camera
  // =========================================================================

  _updateCamera(dt) {
    const cam = this.renderer.camera;
    this.camera = cam;

    if (this.player.onFoot) {
      cam.position.set(
        this.player.pos.x,
        this.player.pos.y + this.player.height * (this.input.intent.crouch ? 0.62 : 1),
        this.player.pos.z);
      // three.js cameras look down -Z, but the game's forward is +Z, so every
      // camera yaw carries a half turn. Getting this wrong points the commander
      // at his own engine deck, which is exactly what it did the first time.
      cam.rotation.set(this.player.pitch, this.player.yaw + Math.PI, 0, 'YXZ');
      cam.fov = 70;
      this.renderer.setInteriorLighting(false);
      cam.updateProjectionMatrix();
      return;
    }

    // Inside the Tiger: the camera is the commander's eyes, at his real height.
    const st = STATIONS.commander;
    let local;
    let fov = 62;
    switch (this.view) {
      case VIEW.HEAD_OUT: local = st.eyeHeadOut; fov = 75; break;
      case VIEW.BINOCULARS: local = st.eyeHeadOut; fov = 11; break;
      case VIEW.HATCH_OPEN: local = [st.eyeButtonedUp[0], st.eyeButtonedUp[1] + 0.18, st.eyeButtonedUp[2]]; fov = 68; break;
      case VIEW.GUNNER_SIGHT: local = STATIONS.gunner.eye; fov = 25; break;
      default: local = st.eyeButtonedUp; fov = 55; break;
    }

    // The commander's station is on the turret, so it rotates with it — and so
    // does he. When the gunner traverses, the commander's whole world swings
    // round with the turret. That is what commanding a Tiger was actually like.
    const az = this.tiger.turretAz;
    const ringZ = L.turretCentreZ;

    // Buttoned up, his eye is AT a vision slit in the cupola wall, not floating
    // in the middle of the drum. Push the eye out to the slit along his line of
    // sight so he is looking through it rather than at it.
    if (this.view === VIEW.BUTTONED) {
      const lookRel = this.commanderLook.yaw;
      local = [
        local[0] + Math.sin(lookRel) * 0.21,
        local[1],
        local[2] + Math.cos(lookRel) * 0.21,
      ];
    }

    const rel = [local[0], local[1], local[2] - ringZ];
    const c = Math.cos(az), s = Math.sin(az);
    const turretLocal = new THREE.Vector3(
      rel[0] * c + rel[2] * s, rel[1], -rel[0] * s + rel[2] * c + ringZ);

    // Into world space through the hull's own attitude.
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(this.tiger.pitch, this.tiger.heading, this.tiger.roll, 'YXZ'));
    turretLocal.applyMatrix4(m);
    cam.position.set(
      this.tiger.pos.x + turretLocal.x,
      this.tiger.pos.y + turretLocal.y,
      this.tiger.pos.z + turretLocal.z);

    // Look direction: hull heading + turret (the cupola turns with it) + his head.
    const lookYaw = this.tiger.heading + this.tiger.turretAz
      + (this.view === VIEW.GUNNER_SIGHT ? 0 : this.commanderLook.yaw);
    const lookPitch = this.view === VIEW.GUNNER_SIGHT ? this.tiger.gunElev : this.commanderLook.pitch;
    cam.rotation.set(lookPitch + this.tiger.pitch * 0.6, lookYaw + Math.PI, this.tiger.roll * 0.5, 'YXZ');

    // Camera inertia: 57 tonnes over rough ground moves your head about.
    const shake = this._cameraShake(dt);
    cam.position.y += shake.y;
    cam.rotation.z += shake.roll;
    cam.rotation.x += shake.pitch;

    cam.fov = fov;
    cam.updateProjectionMatrix();

    // Interior lighting only when the player is actually inside.
    const inside = this.view === VIEW.BUTTONED || this.view === VIEW.GUNNER_SIGHT || this.view === VIEW.HATCH_OPEN;
    this.renderer.setInteriorLighting(inside, cam.position,
      this.tiger.hatchOpen.cupola_hatch);

    // The interior is only worth drawing when you can see it.
    this.interiorModel.visible = this.view !== VIEW.HEAD_OUT && this.view !== VIEW.BINOCULARS;
    // The cupola drum is an inch from his face when buttoned up; hiding it is
    // what lets him actually see out through the vision blocks.
    const drum = this.interiorModel.userData.cupolaDrum;
    if (drum) drum.visible = this.view !== VIEW.BUTTONED;
  }

  _cameraShake(dt) {
    const t = this.loop.simTime;
    const speed = Math.abs(this.tiger?.driveline?.speed || 0);
    const engine = (this.tiger?.driveline?.running ? 1 : 0);
    // Engine idle vibration, track rumble, and any recent impact.
    const idle = engine * 0.0016;
    const rumble = speed * 0.0022;
    this._impactShake = Math.max(0, (this._impactShake || 0) - dt * 2.2);
    const imp = this._impactShake;
    return {
      y: Math.sin(t * 41) * idle + Math.sin(t * 17.3) * rumble + Math.sin(t * 63) * imp * 0.10,
      roll: Math.sin(t * 12.7) * rumble * 0.6 + Math.sin(t * 47) * imp * 0.05,
      pitch: Math.sin(t * 23.1) * rumble * 0.4 + Math.cos(t * 51) * imp * 0.06,
    };
  }

  // =========================================================================
  //  Input handling
  // =========================================================================

  _handleInput(dt) {
    const i = this.input.intent;

    if (this.screens.isOpen) {
      if (i.actions.has('pause')) this._closeTopScreen();
      return;
    }

    // Look.
    if (this.player.onFoot) {
      this.player.yaw -= i.look.x;
      this.player.pitch = clamp(this.player.pitch - i.look.y, -1.35, 1.35);
    } else {
      // The commander can turn his head within the cupola; buttoned up his arc
      // is limited by the vision blocks.
      const limit = (this.view === VIEW.HEAD_OUT || this.view === VIEW.BINOCULARS)
        ? Math.PI : this.view === VIEW.HATCH_OPEN ? 2.4 : 1.6;
      this.commanderLook.yaw = clamp(this.commanderLook.yaw - i.look.x, -limit, limit);
      this.commanderLook.pitch = clamp(this.commanderLook.pitch - i.look.y,
        this.view === VIEW.HEAD_OUT ? -1.2 : -0.5, 0.9);
    }

    if (i.actions.has('pause')) this.togglePause();
    if (i.actions.has('toggleHud')) { this.hudVisible = !this.hudVisible; this.hud.setVisible(this.hudVisible); }
    if (i.actions.has('perfStats')) this._togglePerf();
    if (i.actions.has('settings')) this.openSettings();

    // Command menu.
    if (i.actions.has('commandMenu')) this.commandMenu.toggle();
    for (const [action, group] of [['quickDriver', 'driver'], ['quickGunner', 'gunner'],
      ['quickLoader', 'loader'], ['quickRadio', 'radio'], ['quickEmergency', 'emergency']]) {
      if (i.actions.has(action)) this.commandMenu.openGroup(group);
    }
    if (this.commandMenu.open) {
      for (const code of this.input._keys) if (this.commandMenu.handleKey(code)) break;
    }

    if (this.state !== STATE.MISSION) {
      this._handleOnFootInteraction();
      return;
    }

    // ---- Commander position -------------------------------------------------
    if (i.actions.has('commanderMode')) this.cycleView();
    if (i.actions.has('openHatch')) this.toggleHatch();
    if (i.actions.has('binoculars')) this.toggleBinoculars();
    if (i.actions.has('map')) this.openMap();
    if (i.actions.has('crewStatus')) this.hud.toggleCrew(this.tiger.crewManager, this.commanderMan);
    if (i.actions.has('damageReport')) this.hud.toggleDamage(this.tiger);
    if (i.actions.has('ballisticsInspector')) this.hud.toggleInspector();
    if (i.actions.has('radio')) this.openRadioLog();

    // ---- Quick commands ------------------------------------------------------
    if (i.actions.has('quickTarget')) this.designateTarget();
    if (i.actions.has('quickFire')) this.issueCommand(CMD.FIRE);
    if (i.actions.has('quickStop')) this.issueCommand(CMD.STOP);
    if (i.actions.has('quickAdvance')) this.issueCommand(CMD.FORWARD);
    if (i.actions.has('quickReverse')) this.issueCommand(CMD.REVERSE);
    if (i.actions.has('fireExtinguishers')) this.issueCommand(CMD.FIRE_EXTINGUISHERS);
    if (i.actions.has('abandonTank')) this.commandMenu.openGroup('emergency');

    // ---- Mobile contextual actions -------------------------------------------
    if (i.actions.has('openRepair')) this.openRepairScreen();
    if (i.actions.has('abortRepair')) this.issueCommand(CMD.ABORT_REPAIR);
    if (i.actions.has('requestRecovery')) this.issueCommand(CMD.REQUEST_RECOVERY);
    if (i.actions.has('attachCable')) this.beginCableAttachment();

    // Field repair prompt when something is broken and we are stopped.
    this._updateMissionPrompt();
  }

  _handleOnFootInteraction() {
    const source = this.state === STATE.BRIEFING ? this.tent : this.staging;
    if (!source) return;
    const points = source.userData.interactions || [];
    let best = null, bestD = Infinity;
    for (const p of points) {
      const d = this.player.pos.distanceTo(p.pos);
      if (d < p.radius && d < bestD) { best = p; bestD = d; }
    }
    this.nearInteraction = best;

    if (best) {
      let label = best.label;
      // Tell the player what the crewman is actually doing right now.
      if (best.crew && this.staging) {
        const act = crewActivity(this.staging, best.crew);
        if (act) label = `${best.label} — ${act}`;
      }
      this.hud.setPrompt(label, this.input.mode === INPUT_MODE.TOUCH ? '' : 'E');
    } else {
      this.hud.setPrompt(null);
    }

    if (this.input.intent.interact && best) this._doInteraction(best);
  }

  _doInteraction(point) {
    if (this.state === STATE.BRIEFING) {
      switch (point.id) {
        case 'sandtable':
          this.screens.show('briefing', briefingHtml(this.mission, this.campaign, {
            unreported: Math.max(0, this.enemyPlan.length - (this.sandTableReported?.length || 0)),
          }));
          break;
        case 'map':
        case 'logistics':
        case 'officer':
        case 'intel':
          this._briefingDialogue(point.id);
          break;
        case 'depart':
          this.beginStaging();
          break;
        default: break;
      }
      return;
    }

    // Staging area.
    switch (point.id) {
      case 'inspect_tiger': this._inspectTiger(); break;
      case 'climb_on': this._climbOnTiger(); break;
      case 'ammo_load': this.openLoadout(); break;
      case 'roster': this.openRoster(); break;
      case 'fuel':
        this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm',
          line: `Company fuel: ${this.campaign.logistics.fuelL} litres. The Tiger takes 540.` });
        break;
      case 'spares':
        this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm',
          line: Object.entries(this.campaign.logistics.spares)
            .map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ') });
        break;
      case 'mount_up': this.beginMission(); break;
      default:
        if (point.crew) this._crewChat(point.crew);
        break;
    }
  }

  _briefingDialogue(which) {
    const lines = {
      map: 'The operational map shows the axis of advance and the reported Soviet defensive belts. The overlay was drawn from air reconnaissance two days ago.',
      logistics: this.campaign.logistics.briefingLine(),
      officer: `"${this.mission.briefing.objective}" — and remember, these positions are reports. Some of them will be wrong.`,
      intel: this.mission.briefing.warnings?.[0]
        || 'We believe the sector is held in strength, but we cannot confirm the composition.',
    };
    this.hud.addSubtitle({ role: 'officer', name: 'Hauptmann', tone: 'calm', line: lines[which] });
    audio.voice('calm', 'commander', 6);
  }

  _crewChat(role) {
    const man = this.campaign.roster.assigned[role];
    if (!man) return;
    const act = crewActivity(this.staging, role);
    const lines = {
      driver: [`Tracks are good, Herr Kommandant. Tension is right.`, `She started first time this morning.`, `${act || 'Checking her over'}. She'll go.`],
      gunner: [`Sight is clear. I checked the lay twice.`, `The gun is good. I'd like a proper zero, but there's no time.`, `${act || 'Checking the gun'}.`],
      loader: [`Ninety-two rounds when we're full. I counted them.`, `The ready rack is loaded. AP.`, `${act || 'Checking the ammunition'}.`],
      radio: [`Battalion is on the net. Signal's good.`, `I have 102 and 104. Nothing from 103 yet.`, `${act || 'On the radio'}.`],
    };
    const line = this.missionRng.pick(lines[role] || ['Ready, Herr Kommandant.']);
    this.hud.addSubtitle({ role, name: man.name, rank: man.rank, tone: 'calm', line });
    audio.voice('calm', role, 5);
  }

  _inspectTiger() {
    const t = this.campaign.tank;
    const dmg = Object.entries(t.components || {}).filter(([, s]) => s.destroyed || s.disabled);
    const line = dmg.length
      ? `${t.callsign} (${t.turmNummer}): ${dmg.map(([id]) => TIGER_1H.COMPONENTS[id]?.label || id).join(', ')} still showing damage.`
      : `${t.callsign}, turret number ${t.turmNummer}. Fifty-seven tonnes, eighty-eight millimetres, one hundred millimetres of front plate. She looks ready.`;
    this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm', line });
  }

  _climbOnTiger() {
    this.player.onHull = true;
    this.player.pos.set(0, 1.85, 1.2);
    this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm',
      line: 'You are on the hull. Move to the cupola and press interact to take the commander\'s position.' });
    // The cupola becomes an interaction point once you are up.
    this.staging.userData.interactions.push({
      id: 'enter_commander', label: 'ENTER COMMANDER POSITION',
      pos: new THREE.Vector3(-0.46, 2.4, 0.12), radius: 1.8,
    });
    this.staging.userData.interactions.find((p) => p.id === 'enter_commander').action = 'enter';
    const orig = this._doInteraction.bind(this);
    if (!this._enterPatched) {
      this._enterPatched = true;
      const self = this;
      const prev = this._doInteraction.bind(this);
      this._doInteraction = function (point) {
        if (point.id === 'enter_commander') { self.beginMission(); return; }
        prev(point);
      };
    }
  }

  _updateMissionPrompt() {
    // Offer a field repair when stopped with repairable damage.
    const t = this.tiger;
    const stopped = Math.abs(t.driveline?.speed || 0) < 0.4;
    const dmg = t.condition().damaged.filter((d) => t.spec.COMPONENTS[d.id]?.fieldRepairable);
    if (stopped && dmg.length && !this.repair.active) {
      this.hud.setPrompt(`Field repair available — ${dmg[0].label}`,
        this.input.mode === INPUT_MODE.TOUCH ? '' : 'E');
      if (this.input.intent.interact) this.openRepairScreen();
    } else if (this.recovery.state === RECOVERY_STATE.ARRIVED) {
      this.hud.setPrompt('Send men out with the tow cable', this.input.mode === INPUT_MODE.TOUCH ? '' : 'E');
      if (this.input.intent.interact) this.beginCableAttachment();
    } else {
      this.hud.setPrompt(null);
    }
  }

  // =========================================================================
  //  Commander actions
  // =========================================================================

  cycleView() {
    if (!this.player.inTank) return;
    const order = [VIEW.BUTTONED, VIEW.HATCH_OPEN, VIEW.HEAD_OUT];
    let i = order.indexOf(this.view);
    if (i < 0) i = 0;
    let next = order[(i + 1) % order.length];

    // You cannot get your head out through a closed hatch.
    if ((next === VIEW.HATCH_OPEN || next === VIEW.HEAD_OUT) && !this.tiger.hatchOpen.cupola_hatch) {
      this.toggleHatch();
    }
    this.setView(next);
  }

  setView(v) {
    const prev = this.view;
    this.view = v;
    this.tiger.commanderHeadOut = (v === VIEW.HEAD_OUT || v === VIEW.BINOCULARS);

    const desc = {
      [VIEW.BUTTONED]: 'Buttoned up. Five vision slits, and the world outside is a rumour.',
      [VIEW.HATCH_OPEN]: 'Hatch open, head down. Better, and you are still behind armour.',
      [VIEW.HEAD_OUT]: 'Head out. You can see and hear everything — and so can they.',
      [VIEW.BINOCULARS]: 'Binoculars up. Six times magnification, and no peripheral vision at all.',
    }[v];
    if (desc && prev !== v) this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm', line: desc });

    this.hud.showOptics(v === VIEW.BINOCULARS ? 'binoculars'
      : v === VIEW.GUNNER_SIGHT ? 'tzf9b'
        : v === VIEW.BUTTONED ? 'vision_block' : null);
  }

  toggleHatch() {
    if (!this.player.inTank) return;
    const open = !this.tiger.hatchOpen.cupola_hatch;
    this.tiger.hatchOpen.cupola_hatch = open;
    if (!open && (this.view === VIEW.HEAD_OUT || this.view === VIEW.BINOCULARS)) {
      this.setView(VIEW.BUTTONED);
    }
    this.hud.addSubtitle({
      role: 'system', name: '', tone: 'calm',
      line: open ? 'Cupola hatch open.' : 'Cupola hatch closed and dogged.',
    });
  }

  toggleBinoculars() {
    if (this.view === VIEW.BINOCULARS) { this.setView(VIEW.HEAD_OUT); return; }
    if (!this.tiger.hatchOpen.cupola_hatch) {
      this.hud.warn('You cannot use binoculars through a closed hatch.', 'refused', 3);
      return;
    }
    this.setView(VIEW.BINOCULARS);
  }

  /** "Gunner — target, my position." Hands over whatever the commander is looking at. */
  designateTarget() {
    const cam = this.renderer.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // Where is the commander looking, out to a plausible engagement range?
    const origin = cam.position;
    let best = null, bestAngle = 0.22;
    for (const v of this.world.vehicles) {
      if (v === this.tiger || v.destroyed || v.faction === 'german') continue;
      const to = new THREE.Vector3(v.pos.x - origin.x, v.pos.y + 1.2 - origin.y, v.pos.z - origin.z);
      const dist = to.length();
      if (dist > 3000) continue;
      to.normalize();
      const angle = Math.acos(clamp(to.dot(dir), -1, 1));
      if (angle < bestAngle) { bestAngle = angle; best = { v, dist }; }
    }

    const point = best
      ? { x: best.v.pos.x, y: best.v.pos.y + 1.2, z: best.v.pos.z }
      : {
        x: origin.x + dir.x * 900,
        y: this.terrain.heightAt(origin.x + dir.x * 900, origin.z + dir.z * 900) + 1.2,
        z: origin.z + dir.z * 900,
      };

    const rel = normalizeAngle(Math.atan2(point.x - this.tiger.pos.x, point.z - this.tiger.pos.z) - this.tiger.heading);
    const clock = bearingToClock(rel);
    const range = callRange(Math.hypot(point.x - this.tiger.pos.x, point.z - this.tiger.pos.z));

    // The commander says it out loud, the way he would.
    this.hud.addSubtitle({
      role: 'commander', name: this.commanderMan?.name || 'Commander',
      tone: 'calm', line: `Gunner — tank, ${clock} o'clock! ${range} metres!`,
    });
    audio.voice('calm', 'commander', 6);

    this.commands.issue(CMD.TARGET_MY_LAY, { pos: point, clock, range }, this.commanderMan);
  }

  issueCommand(cmdId, item) {
    if (!this.commands) return;
    const r = this.commands.issue(cmdId, this._commandArg(cmdId), this.commanderMan);
    if (!r.ok) this.hud.warn(r.reason, 'refused', 3);
  }

  _commandArg(cmdId) {
    if (cmdId === CMD.GET_COVER || cmdId === CMD.HULL_DOWN) {
      const c = this.world.spotting.hostile()[0];
      return c ? c.lastKnownPos : null;
    }
    if (cmdId === CMD.REQUEST_ARTILLERY) {
      const c = this.world.spotting.hostile()[0];
      return c ? c.lastKnownPos : null;
    }
    if (cmdId === CMD.ABANDON_TANK) return this.commanderMan;
    return null;
  }

  beginCableAttachment() {
    const r = this.recovery.beginAttachment(this.tiger, ['loader', 'radio']);
    if (!r.ok) this.hud.warn(r.reason, 'refused', 4);
  }

  // =========================================================================
  //  Screens
  // =========================================================================

  _wireScreens() {
    const s = this.screens;

    s.on('new-campaign', () => { s.hide(); this.newCampaign(this.pendingDifficulty || 'normal'); });
    s.on('pick-difficulty', (d) => { this.pendingDifficulty = d.id; this.showMenu(); });
    s.on('load-menu', () => this._showLoadMenu());
    s.on('load-slot', (d) => { s.hide(); this.loadCampaign(d.slot); });
    s.on('open-settings', () => this.openSettings());
    s.on('open-about', () => this._showAbout());
    s.on('menu-back', () => this.showMenu());

    s.on('brief-walk', () => s.hide());
    s.on('brief-skip', () => this.beginStaging());
    s.on('brief-roster', () => this.openRoster());
    s.on('brief-loadout', () => this.openLoadout());

    s.on('loadout-inc', (d) => this._adjustLoadout(d.id, +Number(d.n)));
    s.on('loadout-dec', (d) => this._adjustLoadout(d.id, -Number(d.n)));
    s.on('ammo-inc', (d) => this._adjustLoadout(d.id, +Number(d.n)));
    s.on('ammo-dec', (d) => this._adjustLoadout(d.id, -Number(d.n)));
    s.on('loadout-default', () => {
      this.chosenLoadout = { ...TIGER_1H.armament.defaultLoadout };
      this.openLoadout();
    });
    s.on('loadout-confirm', () => this._returnFromSubScreen());
    s.on('loadout-cancel', () => this._returnFromSubScreen());

    s.on('roster-select', (d) => { this.rosterSelected = this.rosterSelected === d.role ? null : d.role; this.openRoster(); });
    s.on('roster-assign', (d) => {
      if (!this.rosterSelected) { this.hud.warn('Choose a seat first.', 'info', 3); return; }
      const r = this.campaign.roster.assign(this.rosterSelected, d.id);
      if (!r.ok) this.hud.warn(r.reason, 'refused', 4);
      else if (r.untrained) {
        this.hud.warn(`${r.assigned.name} is a trained ${r.assigned.retrainedFrom}. He will be slow in that seat.`, 'info', 6);
      }
      this.rosterSelected = null;
      this.openRoster();
    });
    s.on('roster-close', () => { this.rosterSelected = null; this._returnFromSubScreen(); });

    s.on('repair-choose', (d) => this._openRepairCrew(d.id));
    s.on('repair-start', () => this._startRepair());
    s.on('repair-close', () => { s.hide(); this.paused = false; });

    s.on('map-close', () => { s.hide(); this.paused = false; });
    s.on('aar-continue', () => { s.hide(); this.beginBriefing(); });
    s.on('aar-record', () => s.show('record', campaignRecordHtml(this.campaign.campaignRecord())));
    s.on('record-close', () => {
      if (this.state === STATE.AFTER_ACTION) {
        s.show('aar', afterActionHtml(this.campaign.completed[this.campaign.completed.length - 1], this.campaign));
      } else s.hide();
    });

    s.on('settings-close', () => this._returnFromSubScreen());
    s.on('set-difficulty', (d) => {
      if (this.campaign) { this.campaign.difficulty = makeDifficulty(d.id); this.hud.difficulty = this.campaign.difficulty; }
      else this.pendingDifficulty = d.id;
      this.openSettings();
    });
    s.on('set-quality', (d) => {
      this.renderer.setQuality(d.id);
      this.effects.setQuality(QUALITY[d.id].particleQuality);
      this.openSettings();
    });
    s.on('rebind', (d) => {
      this.input.beginRebind(d.action);
      this.hud.warn(`Press a key for "${d.action}"…`, 'info', 5);
    });
    s.on('reset-binds', () => { this.input.resetBindings(); this.openSettings(); });

    s.on('pause-resume', () => { s.hide(); this.paused = false; });
    s.on('pause-save', () => {
      const r = SaveSystem.save('manual', this.campaign);
      this.hud.warn(r.ok ? 'Campaign saved.' : r.reason, r.ok ? 'info' : 'refused', 4);
    });
    s.on('pause-menu', () => { s.hide(); this.paused = false; this.showMenu(); });
    s.on('pause-settings', () => this.openSettings());

    // Live inputs inside settings.
    this.screens.el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.act === 'set-volume') audio.setVolume(Number(t.value));
      if (t.dataset.act === 'custom-range' && this.campaign) {
        this.campaign.difficulty = { ...this.campaign.difficulty, [t.dataset.key]: Number(t.value), id: 'custom' };
        const em = t.parentElement.querySelector('em');
        if (em) em.textContent = Number(t.value).toFixed(2);
      }
      if (t.dataset.act === 'custom-bool' && this.campaign) {
        this.campaign.difficulty = { ...this.campaign.difficulty, [t.dataset.key]: t.checked, id: 'custom' };
      }
      if (t.dataset.act === 'toggle-dynres') this.renderer.dynamicResolution = t.checked;
    });
  }

  _returnFromSubScreen() {
    if (this.state === STATE.BRIEFING) {
      this.screens.show('briefing', briefingHtml(this.mission, this.campaign, {
        unreported: Math.max(0, this.enemyPlan.length - (this.sandTableReported?.length || 0)),
      }));
    } else if (this.state === STATE.MENU) {
      this.showMenu();
    } else {
      this.screens.hide();
      this.paused = false;
    }
  }

  openLoadout() {
    if (!this.chosenLoadout) this.chosenLoadout = { ...TIGER_1H.armament.defaultLoadout };
    this.screens.show('loadout', loadoutHtml(this.chosenLoadout, this.campaign.logistics));
  }

  _adjustLoadout(id, delta) {
    const l = this.chosenLoadout;
    const have = this.campaign.logistics.ammunition[id] ?? 0;
    const total = Object.values(l).reduce((a, b) => a + b, 0);
    let next = (l[id] || 0) + delta;
    next = clamp(next, 0, Math.min(have, (l[id] || 0) + Math.max(0, TIGER_1H.armament.ammoCapacity - total)));
    l[id] = next;
    this.openLoadout();
  }

  openRoster() {
    this.screens.show('roster', rosterHtml(this.campaign, this.rosterSelected));
  }

  openRepairScreen() {
    if (!this.repair) return;
    this.paused = false;
    const assessment = this.repair.assessDamage(this.tiger);
    this.screens.show('repair', repairHtml(assessment, this.tiger.crewManager, this.tiger));
  }

  _openRepairCrew(componentId) {
    this.repairTarget = componentId;
    const spec = TIGER_1H.COMPONENTS[componentId];
    const aptitude = (role, id) => {
      const table = {
        driver: { track_l: 1.35, track_r: 1.35, roadwheels_l: 1.4, roadwheels_r: 1.4, default: 0.85 },
        gunner: { breech: 1.35, turret_traverse: 1.3, gun_elevation: 1.35, gunner_sight: 1.45, default: 0.8 },
        loader: { track_l: 1.1, track_r: 1.1, coax_mg: 1.3, tow_gear: 1.25, default: 0.95 },
        radio: { radio: 1.5, electrics: 1.4, hull_mg: 1.3, default: 0.8 },
      }[role] || {};
      return table[id] ?? table.default ?? 1;
    };
    this.screens.show('repair', repairCrewHtml({ id: componentId, label: spec.label }, this.tiger.crewManager, aptitude));
  }

  _startRepair() {
    const boxes = Array.from(this.screens.el.querySelectorAll('input[type=checkbox]:checked'));
    const roles = boxes.map((b) => b.dataset.role);
    if (!roles.length) { this.hud.warn('Choose at least one man.', 'refused', 3); return; }
    const r = this.repair.begin(this.tiger, this.repairTarget, roles);
    if (!r.ok) { this.hud.warn(r.reason, 'refused', 5); return; }
    this.screens.hide();
    this.paused = false;
    for (const c of r.consequences) this.hud.addSubtitle({ role: 'system', name: '', tone: 'calm', line: c });
  }

  openMap() {
    this.screens.show('map', mapHtml(), {
      after: (el) => {
        const cv = el.querySelector('#map-canvas');
        const draw = () => drawMap(cv, {
          terrain: this.terrain,
          tiger: this.tiger,
          contacts: this.world.spotting.active().filter((c) => c.hostile),
          friendlies: this.world.vehicles.filter((v) => v.faction === 'german' && v !== this.tiger && !v.destroyed),
          objectives: [{ x: 0, z: this.terrain.half * 0.5 }],
          time: this.world.time,
        });
        requestAnimationFrame(draw);
        this._mapInterval = setInterval(draw, 500);
      },
    });
    this.bus.once('screen:hide', () => clearInterval(this._mapInterval));
  }

  openRadioLog() {
    const log = this.radio.recentLog(10);
    this.hud.addSubtitle({
      role: 'system', name: '', tone: 'calm',
      line: log.length ? log.map((l) => `${l.from}: ${l.line}`).join(' | ') : 'The net is quiet.',
    });
  }

  openSettings() {
    this.screens.show('settings', settingsHtml({
      difficulty: this.campaign?.difficulty || makeDifficulty(this.pendingDifficulty || 'normal'),
      quality: this.renderer.qualityName,
      bindings: this.input.bindings,
      audioDesc: audio.describe(),
      volume: audio.masterVolume,
      inputMode: this.input.mode,
    }));
  }

  _showLoadMenu() {
    const saves = SaveSystem.list();
    this.screens.show('menu', `<div class="menu"><h1>Continue</h1>
      <div class="save-list">${saves.map((s) => `
        <button class="save-row" data-act="load-slot" data-slot="${s.slot}">
          <b>${s.label}</b>
          <span>${s.difficulty} · day ${s.day} · ${s.missions} missions · tank ${s.tankStatus} · ${s.crewAlive} crew</span>
          <em>${new Date(s.savedAt).toLocaleString()}</em>
        </button>`).join('') || '<p>No saved campaigns.</p>'}</div>
      <footer><button class="btn btn-ghost" data-act="menu-back">Back</button></footer></div>`);
  }

  _showAbout() {
    this.screens.show('about', `<div class="about">
      <h1>Panzerkampfwagen VI Tiger Ausf. H</h1>
      <p class="about-sub">Henschel, Kassel · May/June 1943 · Fgst.Nr. 250200–250380<br>
        as issued to schwere Panzer-Abteilung 503 for Operation Zitadelle</p>
      <p>This game models one specific vehicle in one specific build state, not a
        generic Tiger. The most visible consequence is the <b>early drum cupola</b>
        with five vision slits and a flip-up hatch: the familiar cast cupola with
        seven periscopes does not begin until Fahrgestell number 250391 in July 1943,
        after this tank was built. The gunner's sight is the <b>binocular TZF 9b</b>,
        which is why the mantlet has two apertures rather than one. There is no
        Zimmerit — that starts in late August 1943.</p>
      <table class="about-table">
        <tr><td>Combat weight</td><td>57 000 kg</td></tr>
        <tr><td>Length with gun forward</td><td>8.45 m</td></tr>
        <tr><td>Width over combat tracks</td><td>3.705 m</td></tr>
        <tr><td>Height to cupola</td><td>3.00 m</td></tr>
        <tr><td>Engine</td><td>Maybach HL 230 P45, 23.095 L, 700 PS</td></tr>
        <tr><td>Transmission</td><td>Maybach Olvar OG 40 12 16 B, 8 forward, 4 reverse</td></tr>
        <tr><td>Steering</td><td>Henschel L 801 controlled differential</td></tr>
        <tr><td>Main armament</td><td>8.8 cm KwK 36 L/56, 92 rounds</td></tr>
        <tr><td>Gun elevation</td><td>+16° / −8°</td></tr>
        <tr><td>Hull front</td><td>100 mm at 9°</td></tr>
        <tr><td>Hull side</td><td>80 mm vertical (upper), 60 mm (lower)</td></tr>
        <tr><td>Turret front</td><td>100 mm, mantlet 100–200 mm</td></tr>
        <tr><td>Roof and floor</td><td>25 mm</td></tr>
        <tr><td>Fire suppression</td><td>Feuerlöschanlage — engine bay only, 120 °C
          thermostat, 3 L CB bottle, 7-second discharge, five discharges</td></tr>
      </table>
      <p class="about-note">Armour is modelled as 35 plates with real positions, normals
        and thicknesses. Whether a shell gets through is computed from the shell and the
        plate, with no random roll anywhere in the chain, on every difficulty setting.</p>
      <footer><button class="btn btn-primary" data-act="menu-back">Back</button></footer>
    </div>`);
  }

  togglePause() {
    if (this.state !== STATE.MISSION) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.screens.show('pause', `<div class="menu"><h1>Paused</h1>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="pause-resume">Resume</button>
          <button class="btn" data-act="pause-save">Save campaign</button>
          <button class="btn" data-act="pause-settings">Settings</button>
          <button class="btn btn-ghost" data-act="pause-menu">Abandon mission and return to menu</button>
        </div></div>`);
      audio.suspend();
    } else {
      this.screens.hide();
      audio.resume();
    }
  }

  _closeTopScreen() {
    if (this.screens.current === 'pause') this.togglePause();
    else this.screens.hide();
  }

  _togglePerf() {
    if (!this._perfEl) {
      this._perfEl = document.createElement('div');
      this._perfEl.className = 'perf';
      this.uiRoot.appendChild(this._perfEl);
      this._perfTimer = setInterval(() => {
        const s = this.renderer.stats();
        this._perfEl.innerHTML = `${this.loop.fps.toFixed(0)} fps · ${s.quality} · res ${(s.resolutionScale * 100).toFixed(0)}%
          · ${s.drawCalls} calls · ${(s.triangles / 1000).toFixed(0)}k tris
          · ${this.world ? this.world.vehicles.length : 0} vehicles`;
      }, 400);
    } else {
      clearInterval(this._perfTimer);
      this._perfEl.remove();
      this._perfEl = null;
    }
  }

  // =========================================================================
  //  Events
  // =========================================================================

  _wireEvents() {
    const b = this.bus;

    b.on('gun:fired', (e) => {
      this.effects.muzzleFlash(e.pos, e.dir, e.caliber);
      audio.gunFire(e.pos, e.caliber, e.isPlayer);
      if (e.isPlayer) {
        this._impactShake = Math.max(this._impactShake || 0, 0.9);
        audio.breechClose();
      }
    });

    b.on('vehicle:hit', (e) => {
      const pos = e.worldPoint || e.vehicle?.pos;
      if (!pos) return;
      const isPlayer = e.vehicle === this.tiger;
      const dir = e.report ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: 1 };

      if (e.outcome === OUTCOME.RICOCHET) this.effects.ricochet(pos, dir, { x: 0, y: 1, z: 0 }, e.report?.caliber || 76);
      else if (e.penetrated) this.effects.penetration(pos, dir, e.report?.caliber || 76);
      else this.effects.nonPenetration(pos, { x: 0, y: 0.4, z: 1 }, e.report?.caliber || 76);

      if (isPlayer) {
        this.missionState.hitsTaken++;
        if (e.penetrated) this.missionState.penetrationsTaken++;
        this._impactShake = Math.max(this._impactShake || 0, clamp(e.shockG || 1, 0.4, 2.5));
        audio.armourImpact(e.outcome, e.report?.caliber || 76, true);
        if ((e.shockG || 0) > 1.2 || e.penetrated) audio.earRing(clamp01((e.shockG || 1) * 0.5));
      } else {
        audio.armourImpact(e.outcome, e.report?.caliber || 76, false);
      }
    });

    b.on('world:explosion', (e) => {
      this.effects.explosion(e.pos, e.fillerKg);
      audio.explosion(e.pos, e.fillerKg);
    });

    b.on('vehicle:knocked_out', (e) => {
      if (e.by === this.tiger) {
        if (e.vehicle.spec.static) this.missionState.gunsKilled++;
        else this.missionState.kills++;
      }
      if (e.vehicle.faction === 'german' && e.vehicle !== this.tiger) {
        this.missionState.friendlyLosses++;
      }
    });

    b.on('crew:speak', (e) => {
      audio.voice(e.tone, e.role, Math.min(8, Math.max(3, Math.round(e.line.length / 9))));
    });

    b.on('radio:message', () => audio.radioBlip(0.85));

    b.on('repair:complete', () => { this.missionState.repairsCompleted++; });

    b.on('fire:started', () => { if (this.tiger) audio.setFire(0.2); });

    b.on('commander:hit', (e) => {
      if (!this.commanderMan) return;
      this.commanderMan.wound(e.severity, e.cause);
      this._impactShake = Math.max(this._impactShake || 0, 2.0);
      audio.earRing(clamp01(e.severity));
    });

    b.on('input:tap', (e) => {
      // On mobile, tapping the right side of the screen designates a target.
      if (this.state === STATE.MISSION && this.player.inTank) this.designateTarget();
    });

    b.on('input:zoom', (e) => {
      if (this.view === VIEW.BINOCULARS || this.view === VIEW.HEAD_OUT) {
        if (e.delta < 0) this.setView(VIEW.BINOCULARS);
        else if (this.view === VIEW.BINOCULARS) this.setView(VIEW.HEAD_OUT);
      }
    });
  }

  _clearScene() {
    while (this.sceneRoot.children.length) {
      const c = this.sceneRoot.children[0];
      this.sceneRoot.remove(c);
      disposeTree(c);
    }
    this.renderer.props.length = 0;
    for (const e of [...this.renderer.lodGroups]) this.renderer.unregisterLod(e.group);
    this.vehicleModels = [];
    this.dismountFigures = new Map();
    this.effects.clear();
    this.tent = null;
    this.staging = null;
  }
}
