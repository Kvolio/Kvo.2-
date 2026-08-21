// ===========================================================================
//  SOUND
//
//  Sound is a gameplay system here, not decoration. The whole hatch decision
//  turns on it: buttoned up you hear a muffled, undirectional world through
//  100 mm of steel and your own engine; head out you can hear an engine note to
//  your right and tell it is a diesel.
//
//  Everything is synthesised at runtime with the Web Audio API. There are no
//  sound files to download, which means the game loads instantly on a phone
//  over a slow connection and works offline.
//
//  The occlusion chain, applied to every EXTERNAL sound:
//      source -> [lowpass] -> [highshelf cut] -> [gain] -> panner -> master
//  Buttoned up the lowpass drops to ~380 Hz and the panner is widened toward
//  mono, which is what destroys your ability to localise. Head out it opens to
//  18 kHz with full HRTF panning.
// ===========================================================================

import { clamp, clamp01, lerp } from '../core/MathUtil.js';

/** Occlusion presets, keyed by the commander's physical position. */
export const OCCLUSION = {
  head_out: {
    label: 'head out',
    lowpassHz: 18000, highshelfDb: 0, gain: 1.0,
    // How much of the true stereo image survives. 1 = perfect localisation.
    directionality: 1.0,
    interiorGain: 0.55,      // your own tank is quieter with your head in the air
    reverb: 0.0,
  },
  hatch_open: {
    label: 'hatch open, head down',
    lowpassHz: 6500, highshelfDb: -4, gain: 0.78,
    directionality: 0.72,
    interiorGain: 0.85,
    reverb: 0.25,
  },
  buttoned: {
    label: 'buttoned up',
    // A closed Tiger is a steel box. External sound arrives through the hull as
    // a dull thud with almost no directional information.
    lowpassHz: 380, highshelfDb: -22, gain: 0.34,
    directionality: 0.18,
    interiorGain: 1.0,
    reverb: 0.65,
  },
  outside: {
    label: 'outside the tank',
    lowpassHz: 20000, highshelfDb: 0, gain: 1.0,
    directionality: 1.0,
    interiorGain: 0.12,
    reverb: 0.0,
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.masterVolume = 0.8;
    this.mode = 'buttoned';
    this.enabled = true;
    this.loops = new Map();
    this._noiseBuffer = null;
    this._impulse = null;
  }

  /**
   * Must be called from a user gesture. Browsers — and iOS especially — will
   * not start an AudioContext any other way.
   */
  async init() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* the user will tap again */ }
    }

    const ctx = this.ctx;

    // ---- Master chain -----------------------------------------------------
    this.master = ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(ctx.destination);

    // A gentle limiter so a 152 mm shell landing next to you does not clip.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.master);

    // ---- The occlusion bus, which everything EXTERNAL goes through --------
    this.externalBus = ctx.createGain();
    this.occlusionLow = ctx.createBiquadFilter();
    this.occlusionLow.type = 'lowpass';
    this.occlusionLow.frequency.value = 380;
    this.occlusionLow.Q.value = 0.7;
    this.occlusionShelf = ctx.createBiquadFilter();
    this.occlusionShelf.type = 'highshelf';
    this.occlusionShelf.frequency.value = 2000;
    this.occlusionShelf.gain.value = -22;
    this.externalBus.connect(this.occlusionLow);
    this.occlusionLow.connect(this.occlusionShelf);
    this.occlusionShelf.connect(this.limiter);

    // A convolution tail gives the boxy ring of the fighting compartment.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(0.55, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.65;
    this.occlusionShelf.connect(this.reverbGain);
    this.reverbGain.connect(this.reverb);
    this.reverb.connect(this.limiter);

    // ---- The interior bus: your own engine, gearbox, crew, hull noise -----
    this.interiorBus = ctx.createGain();
    this.interiorBus.gain.value = 1.0;
    this.interiorBus.connect(this.limiter);

    // ---- Voices go through their own bus so they stay intelligible --------
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.9;
    // Intercom colouring: the Bordsprechanlage was a narrow, hissy circuit.
    this.voiceFilter = ctx.createBiquadFilter();
    this.voiceFilter.type = 'bandpass';
    this.voiceFilter.frequency.value = 1400;
    this.voiceFilter.Q.value = 0.9;
    this.voiceBus.connect(this.voiceFilter);
    this.voiceFilter.connect(this.limiter);

    this._noiseBuffer = this._makeNoise(2.0);
    this.listener = ctx.listener;
    this.ready = true;
    this.setMode(this.mode, true);
    return true;
  }

  _makeNoise(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  /**
   * Set the commander's acoustic position. This is the single most important
   * call in the audio system, and the player hears the difference immediately.
   */
  setMode(mode, immediate = false) {
    this.mode = mode;
    if (!this.ready) return;
    const p = OCCLUSION[mode] || OCCLUSION.buttoned;
    const t = this.ctx.currentTime;
    const tc = immediate ? 0.01 : 0.18;   // the hatch takes a moment to swing

    this.occlusionLow.frequency.setTargetAtTime(p.lowpassHz, t, tc);
    this.occlusionShelf.gain.setTargetAtTime(p.highshelfDb, t, tc);
    this.externalBus.gain.setTargetAtTime(p.gain, t, tc);
    this.interiorBus.gain.setTargetAtTime(p.interiorGain, t, tc);
    this.reverbGain.gain.setTargetAtTime(p.reverb, t, tc);
    this.directionality = p.directionality;
  }

  setListener(pos, forward, up = { x: 0, y: 1, z: 0 }) {
    if (!this.ready) return;
    const l = this.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else if (l.setPosition) {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * A positional node whose stereo image is degraded by the occlusion setting.
   * Buttoned up, the panner is pulled toward mono — which is exactly why you
   * cannot tell where the engine noise is coming from.
   */
  _panner(pos, refDistance = 12, maxDistance = 2500) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.maxDistance = maxDistance;
    p.rolloffFactor = 0.9;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    return p;
  }

  /** Route an external source through occlusion, with directionality applied. */
  _routeExternal(node, pos) {
    const dir = this.directionality ?? 0.2;
    if (dir > 0.25) {
      const panner = this._panner(pos);
      node.connect(panner);
      panner.connect(this.externalBus);
      return panner;
    }
    // Heavily occluded: collapse toward mono so localisation genuinely fails.
    const panner = this._panner(pos, 30, 2500);
    const mono = this.ctx.createGain();
    node.connect(panner);
    node.connect(mono);
    panner.connect(this.externalBus);
    mono.gain.value = (1 - dir) * 0.8;
    mono.connect(this.externalBus);
    return panner;
  }

  // ======================= One-shot sounds ================================

  /** The 8.8 cm firing. Inside a Tiger this is a physical event. */
  gunFire(pos, caliber = 88, interior = false) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const scale = caliber / 88;

    // The crack: a very short burst of filtered noise.
    const crack = ctx.createBufferSource();
    crack.buffer = this._noiseBuffer;
    crack.playbackRate.value = 1.6 / scale;
    const crackFilt = ctx.createBiquadFilter();
    crackFilt.type = 'bandpass';
    crackFilt.frequency.value = 900 / scale;
    crackFilt.Q.value = 0.6;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0, t);
    crackGain.gain.linearRampToValueAtTime(1.0, t + 0.004);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.30 * scale);
    crack.connect(crackFilt); crackFilt.connect(crackGain);

    // The body: a low thump that you feel more than hear.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 / scale, t);
    osc.frequency.exponentialRampToValueAtTime(28 / scale, t + 0.45 * scale);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.9, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.55 * scale);
    osc.connect(oscGain);

    if (interior) {
      // Firing your own gun inside the tank: enormously loud, and it rings.
      crackGain.connect(this.interiorBus);
      oscGain.connect(this.interiorBus);
      // The ring of the fighting compartment afterwards.
      const ring = ctx.createOscillator();
      ring.type = 'triangle';
      ring.frequency.value = 1750;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(0.22, t + 0.02);
      rg.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
      ring.connect(rg); rg.connect(this.interiorBus);
      ring.start(t); ring.stop(t + 2.3);
    } else {
      this._routeExternal(crackGain, pos);
      this._routeExternal(oscGain, pos);
    }

    crack.start(t); crack.stop(t + 0.5 * scale);
    osc.start(t); osc.stop(t + 0.6 * scale);
  }

  /**
   * A shell striking your armour. The single most informative sound in the
   * game: a non-penetration RINGS, a penetration CRACKS and then there is
   * noise inside the tank.
   */
  armourImpact(outcome, caliber = 76, interior = true) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const bus = interior ? this.interiorBus : this.externalBus;
    const scale = caliber / 88;

    if (outcome === 'non_penetration' || outcome === 'partial') {
      // A colossal bell note. Fifty-seven tonnes of steel struck like a gong.
      const freqs = [180, 420, 730, 1180, 1810];
      for (let i = 0; i < freqs.length; i++) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freqs[i] / scale;
        const g = ctx.createGain();
        const amp = 0.55 / (i + 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.8 - i * 0.22);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + 2.0);
      }
      // The initial hammer blow.
      this._noiseBurst(bus, 0.9, 1600, 0.09, t);
    } else if (outcome === 'ricochet') {
      // A rising whine as it goes off somewhere else.
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.8);
      this._noiseBurst(bus, 0.7, 2400, 0.07, t);
    } else if (outcome === 'penetration' || outcome === 'overmatch') {
      // A hard crack, then the sound of things breaking inside.
      this._noiseBurst(bus, 1.0, 3200, 0.05, t);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.20);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.6);
      // Spall rattling around the compartment.
      for (let i = 0; i < 7; i++) {
        this._noiseBurst(bus, 0.28, 3800 + Math.random() * 2500, 0.03,
          t + 0.05 + Math.random() * 0.5);
      }
    }
  }

  _noiseBurst(dest, amp, freq, dur, when) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer;
    n.playbackRate.value = 0.8 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    n.connect(f); f.connect(g); g.connect(dest);
    n.start(when); n.stop(when + dur + 0.05);
  }

  /** A shell burst in the open. */
  explosion(pos, fillerKg = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const scale = clamp(fillerKg, 0.1, 8);

    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer;
    n.playbackRate.value = 0.35;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.5 + scale * 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(clamp01(0.35 + scale * 0.12), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9 + scale * 0.2);
    n.connect(f); f.connect(g);
    this._routeExternal(g, pos);
    n.start(t); n.stop(t + 1.4 + scale * 0.2);

    // The low body of the blast.
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(85, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.6);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(og);
    this._routeExternal(og, pos);
    o.start(t); o.stop(t + 1.0);
  }

  /** A shell going past. You hear this before you hear the gun that fired it. */
  shellPass(pos) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.28);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(f); f.connect(g);
    this._routeExternal(g, pos);
    o.start(t); o.stop(t + 0.4);
  }

  /** Machine gun. */
  machineGun(pos, rounds = 6, interior = false) {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const dest = interior ? this.interiorBus : this.externalBus;
    // MG 34 at 850 rounds a minute is 14 rounds a second — the famous buzz.
    for (let i = 0; i < rounds; i++) {
      const when = t + i * (60 / 850);
      if (interior) this._noiseBurst(dest, 0.35, 1800, 0.035, when);
      else {
        const g = this.ctx.createGain();
        g.gain.value = 1;
        this._noiseBurst(g, 0.5, 2200, 0.04, when);
        this._routeExternal(g, pos);
      }
    }
  }

  /** Breech and shell-handling noises, always interior. */
  breechClose() { this._mechanical(0.55, 320, 0.16); }
  shellLoad() { this._mechanical(0.35, 180, 0.28); }
  turretTraverse(on) { on ? this._startLoop('traverse', 90, 'sawtooth', 0.06, this.interiorBus) : this._stopLoop('traverse'); }
  gunElevate(on) { on ? this._startLoop('elevate', 140, 'triangle', 0.03, this.interiorBus) : this._stopLoop('elevate'); }

  _mechanical(amp, freq, dur) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.35, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.interiorBus);
    o.start(t); o.stop(t + dur + 0.05);
    this._noiseBurst(this.interiorBus, amp * 0.6, 2400, dur * 0.4, t);
  }

  // ======================= Loops ==========================================

  /**
   * The Maybach HL 230. A 23-litre V-12 at 2600 rpm has a characteristic hard,
   * even note; a Soviet V-2 diesel clatters. The player can learn the difference
   * and use it, which is the point.
   */
  engineLoop(id, opts = {}) {
    if (!this.ready || !this.enabled) return null;
    const ctx = this.ctx;
    const diesel = !!opts.diesel;
    const interior = !!opts.interior;

    const entry = { oscs: [], gains: [], panner: null, id, diesel, interior };

    // Cylinder firing frequency: V-12 four-stroke fires 6 times per revolution.
    const base = ctx.createOscillator();
    base.type = diesel ? 'square' : 'sawtooth';
    base.frequency.value = 60;
    const baseGain = ctx.createGain();
    baseGain.gain.value = 0.16;
    base.connect(baseGain);

    const harm = ctx.createOscillator();
    harm.type = diesel ? 'sawtooth' : 'triangle';
    harm.frequency.value = 120;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.09;
    harm.connect(harmGain);

    // Mechanical clatter — much more of it on a diesel.
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;
    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'bandpass';
    noiseFilt.frequency.value = diesel ? 900 : 420;
    noiseFilt.Q.value = 1.1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = diesel ? 0.09 : 0.045;
    noise.connect(noiseFilt); noiseFilt.connect(noiseGain);

    const sum = ctx.createGain();
    sum.gain.value = opts.volume ?? 0.5;
    baseGain.connect(sum); harmGain.connect(sum); noiseGain.connect(sum);

    if (interior) {
      sum.connect(this.interiorBus);
    } else {
      entry.panner = this._routeExternal(sum, opts.pos || { x: 0, y: 0, z: 0 });
    }

    base.start(); harm.start(); noise.start();
    entry.oscs = [base, harm];
    entry.noise = noise;
    entry.sum = sum;
    entry.baseOsc = base;
    entry.harmOsc = harm;
    entry.noiseGain = noiseGain;
    this.loops.set(id, entry);
    return entry;
  }

  /** Update an engine loop from real rpm and load. */
  setEngine(id, rpm, load, pos) {
    const e = this.loops.get(id);
    if (!e || !this.ready) return;
    const t = this.ctx.currentTime;
    // V-12 four-stroke: firing frequency = rpm/60 * 6.
    const fire = clamp((rpm / 60) * 6, 20, 320);
    e.baseOsc.frequency.setTargetAtTime(fire, t, 0.08);
    e.harmOsc.frequency.setTargetAtTime(fire * 2, t, 0.08);
    e.noiseGain.gain.setTargetAtTime((e.diesel ? 0.09 : 0.045) * (0.6 + load * 0.9), t, 0.15);
    e.sum.gain.setTargetAtTime(clamp01(0.22 + load * 0.4), t, 0.12);
    if (e.panner && pos) {
      if (e.panner.positionX) {
        e.panner.positionX.setTargetAtTime(pos.x, t, 0.05);
        e.panner.positionY.setTargetAtTime(pos.y, t, 0.05);
        e.panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
      } else e.panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  /** Track and running-gear noise, which is most of what you hear inside. */
  trackLoop(id, opts = {}) {
    if (!this.ready || !this.enabled) return null;
    const ctx = this.ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer;
    noise.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 260; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    noise.connect(f); f.connect(g);
    if (opts.interior) g.connect(this.interiorBus);
    else this._routeExternal(g, opts.pos || { x: 0, y: 0, z: 0 });
    noise.start();
    const entry = { noise, filter: f, gain: g, id };
    this.loops.set(id, entry);
    return entry;
  }

  setTracks(id, speed) {
    const e = this.loops.get(id);
    if (!e || !this.ready) return;
    const t = this.ctx.currentTime;
    const s = Math.abs(speed);
    e.gain.gain.setTargetAtTime(clamp01(s / 9) * 0.30, t, 0.15);
    e.filter.frequency.setTargetAtTime(180 + s * 40, t, 0.15);
    e.noise.playbackRate.setTargetAtTime(clamp(0.5 + s / 8, 0.5, 2.2), t, 0.2);
  }

  _startLoop(id, freq, type, amp, dest) {
    if (!this.ready || this.loops.has(id)) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setTargetAtTime(amp, ctx.currentTime, 0.05);
    o.connect(g); g.connect(dest);
    o.start();
    this.loops.set(id, { oscs: [o], gain: g, id });
  }

  _stopLoop(id) {
    const e = this.loops.get(id);
    if (!e) return;
    const t = this.ctx.currentTime;
    if (e.gain) e.gain.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      try {
        e.oscs?.forEach((o) => o.stop());
        e.noise?.stop();
      } catch { /* already stopped */ }
      this.loops.delete(id);
    }, 220);
  }

  stopLoop(id) { this._stopLoop(id); }

  stopAll() {
    for (const id of Array.from(this.loops.keys())) this._stopLoop(id);
  }

  /** Radio traffic, with the characteristic static of a 1943 set. */
  radioBlip(quality = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this._noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12 * (2 - quality), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(f); f.connect(g); g.connect(this.voiceBus);
    n.start(t); n.stop(t + 0.5);
  }

  /**
   * A crewman speaking. Real speech synthesis is not available offline, so
   * the intercom voice is a short formant-shaped burst that carries the
   * URGENCY of the line — calm, strained or breaking — while the words are
   * read as subtitles. The tone genuinely changes with the man's stress.
   */
  voice(tone = 'calm', role = 'gunner', syllables = 4) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    let t = ctx.currentTime;
    // Each crewman gets a consistent pitch so you learn their voices.
    const pitch = { commander: 108, gunner: 124, loader: 138, driver: 116, radio: 132 }[role] ?? 120;
    const urgency = tone === 'breaking' ? 1.55 : tone === 'strained' ? 1.22 : 1.0;
    const rate = tone === 'breaking' ? 0.085 : tone === 'strained' ? 0.105 : 0.13;

    for (let i = 0; i < syllables; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = pitch * urgency * (0.88 + Math.random() * 0.28);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.linearRampToValueAtTime(f0 * (0.9 + Math.random() * 0.25), t + rate);

      // Two formants make it read as a voice rather than a beep.
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass'; f1.frequency.value = 620 + Math.random() * 350; f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass'; f2.frequency.value = 1500 + Math.random() * 700; f2.Q.value = 7;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16 * urgency, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + rate);

      o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(this.voiceBus);
      o.start(t); o.stop(t + rate + 0.02);
      t += rate * (0.85 + Math.random() * 0.35);
    }
  }

  /** Fire: a low roar that gets worse as the fire does. */
  setFire(severity) {
    if (!this.ready) return;
    if (severity <= 0.01) { this._stopLoop('fire'); return; }
    if (!this.loops.has('fire')) {
      const ctx = this.ctx;
      const n = ctx.createBufferSource();
      n.buffer = this._noiseBuffer;
      n.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(f); f.connect(g); g.connect(this.interiorBus);
      n.start();
      this.loops.set('fire', { noise: n, filter: f, gain: g, id: 'fire' });
    }
    const e = this.loops.get('fire');
    const t = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(clamp01(severity) * 0.42, t, 0.4);
    e.filter.frequency.setTargetAtTime(500 + severity * 1400, t, 0.4);
  }

  /** Tinnitus after a heavy hit or a near miss with the hatch open. */
  earRing(intensity = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 4200 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10 * intensity, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.5 * intensity);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 4 * intensity);

    // Duck everything else, the way a concussion does.
    const dm = this.master.gain;
    dm.cancelScheduledValues(t);
    dm.setValueAtTime(this.masterVolume, t);
    dm.linearRampToValueAtTime(this.masterVolume * (1 - 0.55 * intensity), t + 0.06);
    dm.linearRampToValueAtTime(this.masterVolume, t + 2.6 * intensity);
  }

  setVolume(v) {
    this.masterVolume = clamp01(v);
    if (this.ready) this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stopAll();
  }

  suspend() { if (this.ready) this.ctx.suspend(); }
  resume() { if (this.ready) this.ctx.resume(); }

  /** What the sound system is currently doing, for the settings screen. */
  describe() {
    const p = OCCLUSION[this.mode];
    return {
      mode: this.mode,
      label: p.label,
      lowpassHz: p.lowpassHz,
      directionality: p.directionality,
      description: this.mode === 'buttoned'
        ? 'External sound is heavily muffled and very hard to place. You will hear an engine but not where it is.'
        : this.mode === 'head_out'
          ? 'Full clarity and full directionality. You can place an engine by ear — and anyone can see your head.'
          : this.mode === 'hatch_open'
            ? 'Clearer than buttoned up, but you are still down in the cupola.'
            : 'Outside the tank.',
    };
  }
}

export const audio = new AudioEngine();
