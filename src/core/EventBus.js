// Minimal synchronous pub/sub. Systems talk through this rather than reaching
// into each other, which keeps the simulation testable in isolation from render.

export class EventBus {
  constructor() { this._map = new Map(); this._any = []; }

  on(type, fn) {
    if (!this._map.has(type)) this._map.set(type, []);
    this._map.get(type).push(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }

  onAny(fn) { this._any.push(fn); return () => { const i = this._any.indexOf(fn); if (i >= 0) this._any.splice(i, 1); }; }

  off(type, fn) {
    const l = this._map.get(type);
    if (!l) return;
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }

  emit(type, payload) {
    const l = this._map.get(type);
    if (l) for (let i = 0; i < l.length; i++) l[i](payload, type);
    for (let i = 0; i < this._any.length; i++) this._any[i](payload, type);
  }

  clear() { this._map.clear(); this._any.length = 0; }
}

export const bus = new EventBus();
