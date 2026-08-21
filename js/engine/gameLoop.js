window.BS = window.BS || {};
(function (BS) {
"use strict";
class GameLoop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this._last = 0;
    this._raf = 0;
    this._tick = now => {
      if (!this.running) return;
      let dt = now - this._last;
      this._last = now;
      if (dt > 50) dt = 50;
      if (dt < 0) dt = 0;
      this.update(dt);
      this.render(dt);
      this._raf = requestAnimationFrame(this._tick);
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }
}

Object.assign(BS, { GameLoop });

})(window.BS);
