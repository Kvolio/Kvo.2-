// Object pooling — required on mobile, where allocating per-frame particle and
// projectile objects causes GC hitches inside the fighting compartment.

export class Pool {
  constructor(factory, reset, initial = 32) {
    this._factory = factory;
    this._reset = reset;
    this._free = [];
    this._live = new Set();
    for (let i = 0; i < initial; i++) this._free.push(factory());
  }

  acquire() {
    const o = this._free.pop() || this._factory();
    this._live.add(o);
    return o;
  }

  release(o) {
    if (!this._live.delete(o)) return;
    if (this._reset) this._reset(o);
    this._free.push(o);
  }

  releaseAll() { for (const o of Array.from(this._live)) this.release(o); }
  get liveCount() { return this._live.size; }
  forEachLive(fn) { for (const o of this._live) fn(o); }
}
