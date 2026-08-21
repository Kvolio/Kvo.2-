// Fixed-timestep simulation loop with a decoupled render step.
//
// The ballistics, penetration and crew models must be framerate independent —
// a shell fired on a 120 Hz desktop must behave exactly as one fired on a
// 30 Hz iPad. So simulation always advances in fixed 1/60 s steps and render
// interpolates. This is also what makes the game deterministic for replay.

export class Loop {
  constructor({ fixedStep = 1 / 60, maxSubSteps = 5, onFixed, onRender } = {}) {
    this.fixedStep = fixedStep;
    this.maxSubSteps = maxSubSteps;
    this.onFixed = onFixed;
    this.onRender = onRender;
    this._acc = 0;
    this._last = 0;
    this._raf = 0;
    this.running = false;
    this.timeScale = 1;
    this.simTime = 0;
    this.frameCount = 0;
    // Rolling perf window drives the dynamic-resolution controller.
    this.smoothedFrameMs = 16.7;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      let dt = (now - this._last) / 1000;
      this._last = now;
      // Guard against tab-switch / iOS suspend producing a giant delta.
      if (dt > 0.25) dt = 0.25;
      this.smoothedFrameMs += ((dt * 1000) - this.smoothedFrameMs) * 0.05;

      this._acc += dt * this.timeScale;
      let steps = 0;
      while (this._acc >= this.fixedStep && steps < this.maxSubSteps) {
        this.onFixed?.(this.fixedStep, this.simTime);
        this.simTime += this.fixedStep;
        this._acc -= this.fixedStep;
        steps++;
      }
      if (steps === this.maxSubSteps) this._acc = 0; // shed backlog rather than spiral
      this.frameCount++;
      this.onRender?.(dt, this._acc / this.fixedStep);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }
  get fps() { return 1000 / Math.max(1, this.smoothedFrameMs); }
}
