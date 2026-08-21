// ===========================================================================
//  INPUT
//
//  One simulation, two control surfaces. The PC path is keyboard and mouse with
//  pointer lock; the mobile path is a left thumbstick, right-side look, and
//  contextual buttons that appear only when they are relevant.
//
//  Both paths produce THE SAME intent object. Nothing downstream knows or cares
//  which one the player is using, which is what keeps the two versions the same
//  game rather than two games.
// ===========================================================================

import { clamp, clamp01 } from '../core/MathUtil.js';
import { loadBindings, saveBindings, DEFAULT_BINDINGS } from './Bindings.js';

export const INPUT_MODE = { DESKTOP: 'desktop', TOUCH: 'touch' };

export function detectInputMode() {
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
  return (coarse || touch) ? INPUT_MODE.TOUCH : INPUT_MODE.DESKTOP;
}

/** The shared intent object every downstream system reads. */
function emptyIntent() {
  return {
    move: { x: 0, y: 0 },       // -1..1, on foot
    look: { x: 0, y: 0 },       // delta this frame, radians
    run: false,
    crouch: false,
    interact: false,            // edge-triggered
    actions: new Set(),         // edge-triggered action names
    held: new Set(),            // continuously held action names
    pointer: { x: 0, y: 0, down: false },
  };
}

export class InputManager {
  constructor(canvas, bus) {
    this.canvas = canvas;
    this.bus = bus;
    this.mode = detectInputMode();
    this.bindings = loadBindings();
    this.intent = emptyIntent();
    this._keys = new Set();
    this._pressedThisFrame = new Set();
    this._lookAccum = { x: 0, y: 0 };
    this.lookSensitivity = 0.0022;
    this.touchLookSensitivity = 0.0038;
    this.invertY = false;
    this.pointerLocked = false;
    this.enabled = true;
    this.rebinding = null;

    this._reverse = this._buildReverse();
    this._installKeyboard();
    this._installMouse();
    this._installTouch();
  }

  _buildReverse() {
    const r = new Map();
    for (const [action, codes] of Object.entries(this.bindings)) {
      for (const c of codes) {
        if (!r.has(c)) r.set(c, []);
        r.get(c).push(action);
      }
    }
    return r;
  }

  setBinding(action, code) {
    this.bindings[action] = [code];
    this._reverse = this._buildReverse();
    saveBindings(this.bindings);
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_BINDINGS };
    this._reverse = this._buildReverse();
    saveBindings(this.bindings);
  }

  // ---- Keyboard -----------------------------------------------------------

  _installKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (this.rebinding) {
        e.preventDefault();
        const action = this.rebinding;
        this.rebinding = null;
        this.setBinding(action, e.code);
        this.bus?.emit('input:rebound', { action, code: e.code });
        return;
      }
      // Tab must not move focus out of the game.
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (this._keys.has(e.code)) return;   // ignore auto-repeat
      this._keys.add(e.code);
      for (const a of this._reverse.get(e.code) || []) {
        this._pressedThisFrame.add(a);
        this.intent.held.add(a);
      }
    });

    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      for (const a of this._reverse.get(e.code) || []) this.intent.held.delete(a);
    });

    // Losing focus must release everything, or the tank drives off on its own.
    window.addEventListener('blur', () => {
      this._keys.clear();
      this.intent.held.clear();
    });
  }

  // ---- Mouse --------------------------------------------------------------

  _installMouse() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.intent.pointer.down = true;
      if (e.button === 0 && !this.pointerLocked && this.mode === INPUT_MODE.DESKTOP && this.wantPointerLock) {
        this.canvas.requestPointerLock?.();
      }
      this._pressedThisFrame.add(e.button === 2 ? 'secondary' : 'primary');
    });
    window.addEventListener('mouseup', () => { this.intent.pointer.down = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const r = this.canvas.getBoundingClientRect();
      this.intent.pointer.x = (e.clientX - r.left) / r.width;
      this.intent.pointer.y = (e.clientY - r.top) / r.height;
      if (this.pointerLocked) {
        this._lookAccum.x += e.movementX * this.lookSensitivity;
        this._lookAccum.y += e.movementY * this.lookSensitivity * (this.invertY ? -1 : 1);
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.bus?.emit('input:pointerlock', { locked: this.pointerLocked });
    });

    // The optics zoom on the scroll wheel.
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.bus?.emit('input:zoom', { delta: Math.sign(e.deltaY) });
    }, { passive: false });
  }

  // ---- Touch --------------------------------------------------------------

  _installTouch() {
    this.touchState = {
      moveId: null, moveOrigin: { x: 0, y: 0 }, moveCurrent: { x: 0, y: 0 },
      lookId: null, lookLast: { x: 0, y: 0 },
      // The virtual stick appears where the thumb lands, which is what makes
      // it usable without looking at the screen.
      stickVisible: false, stickCentre: { x: 0, y: 0 }, stickKnob: { x: 0, y: 0 },
      stickRadius: 62,
    };

    const isLeftHalf = (x) => x < window.innerWidth * 0.42;

    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (isLeftHalf(t.clientX) && this.touchState.moveId === null) {
          this.touchState.moveId = t.identifier;
          this.touchState.moveOrigin = { x: t.clientX, y: t.clientY };
          this.touchState.moveCurrent = { x: t.clientX, y: t.clientY };
          this.touchState.stickVisible = true;
          this.touchState.stickCentre = { x: t.clientX, y: t.clientY };
          this.touchState.stickKnob = { x: t.clientX, y: t.clientY };
        } else if (this.touchState.lookId === null) {
          this.touchState.lookId = t.identifier;
          this.touchState.lookLast = { x: t.clientX, y: t.clientY };
          this._lookStart = performance.now();
          this._lookMoved = 0;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchState.moveId) {
          this.touchState.moveCurrent = { x: t.clientX, y: t.clientY };
          const dx = t.clientX - this.touchState.stickCentre.x;
          const dy = t.clientY - this.touchState.stickCentre.y;
          const d = Math.hypot(dx, dy);
          const r = this.touchState.stickRadius;
          const k = d > r ? r / d : 1;
          this.touchState.stickKnob = {
            x: this.touchState.stickCentre.x + dx * k,
            y: this.touchState.stickCentre.y + dy * k,
          };
        } else if (t.identifier === this.touchState.lookId) {
          const dx = t.clientX - this.touchState.lookLast.x;
          const dy = t.clientY - this.touchState.lookLast.y;
          this._lookAccum.x += dx * this.touchLookSensitivity;
          this._lookAccum.y += dy * this.touchLookSensitivity * (this.invertY ? -1 : 1);
          this._lookMoved += Math.hypot(dx, dy);
          this.touchState.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchState.moveId) {
          this.touchState.moveId = null;
          this.touchState.stickVisible = false;
        } else if (t.identifier === this.touchState.lookId) {
          // A tap on the right half, rather than a drag, is a "look at that"
          // gesture — which is how the commander designates a target on mobile.
          const dt = performance.now() - (this._lookStart || 0);
          if (dt < 260 && this._lookMoved < 12) {
            const r = this.canvas.getBoundingClientRect();
            this.bus?.emit('input:tap', {
              x: (t.clientX - r.left) / r.width,
              y: (t.clientY - r.top) / r.height,
            });
          }
          this.touchState.lookId = null;
        }
      }
    };
    this.canvas.addEventListener('touchend', endTouch, { passive: false });
    this.canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }

  /** Called by the touch UI when a contextual button is pressed. */
  pressAction(name) {
    this._pressedThisFrame.add(name);
  }

  holdAction(name, on) {
    if (on) this.intent.held.add(name);
    else this.intent.held.delete(name);
  }

  // ---- Frame --------------------------------------------------------------

  /** Build this frame's intent. Call once per rendered frame. */
  poll() {
    const i = this.intent;
    i.actions = this._pressedThisFrame;
    this._pressedThisFrame = new Set();

    // Look delta, consumed.
    i.look.x = this._lookAccum.x;
    i.look.y = this._lookAccum.y;
    this._lookAccum.x = 0;
    this._lookAccum.y = 0;

    // Movement.
    if (this.mode === INPUT_MODE.TOUCH && this.touchState.moveId !== null) {
      const dx = this.touchState.stickKnob.x - this.touchState.stickCentre.x;
      const dy = this.touchState.stickKnob.y - this.touchState.stickCentre.y;
      const r = this.touchState.stickRadius;
      i.move.x = clamp(dx / r, -1, 1);
      i.move.y = clamp(-dy / r, -1, 1);
      i.run = Math.hypot(dx, dy) > r * 0.85;
    } else {
      let x = 0, y = 0;
      if (i.held.has('walkForward')) y += 1;
      if (i.held.has('walkBack')) y -= 1;
      if (i.held.has('walkRight')) x += 1;
      if (i.held.has('walkLeft')) x -= 1;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      i.move.x = x; i.move.y = y;
      i.run = i.held.has('run');
      i.crouch = i.held.has('crouch');
    }

    i.interact = i.actions.has('interact');
    return i;
  }

  /** Consume an edge-triggered action. */
  took(action) { return this.intent.actions.has(action); }

  requestPointerLock() {
    this.wantPointerLock = true;
    if (this.mode === INPUT_MODE.DESKTOP) this.canvas.requestPointerLock?.();
  }

  releasePointerLock() {
    this.wantPointerLock = false;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) { this._keys.clear(); this.intent.held.clear(); }
  }

  beginRebind(action) { this.rebinding = action; }
}
