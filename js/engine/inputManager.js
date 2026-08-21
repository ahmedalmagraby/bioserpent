window.BS = window.BS || {};
(function (BS) {
"use strict";
const { clamp } = BS;

"use strict";

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const KEY_DIR = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

class InputManager {
  constructor(stage, handlers) {
    this.stage = stage;
    this.h = handlers;
    this.pref = 'auto';
    this.mode = 'keys';
    this._swipe = null;
    this._joyId = null;
    this._burstId = null;
    this._joyCenter = null;
    this.joyBase = document.getElementById('joyBase');
    this.joyStick = document.getElementById('joyStick');
    this.rippleEl = document.getElementById('ripple');
    this._kd = e => this.onKeyDown(e);
    this._ku = e => this.onKeyUp(e);
    this._pd = e => this.onPointerDown(e);
    this._pm = e => this.onPointerMove(e);
    this._pu = e => this.onPointerUp(e);
    this._blur = () => this.h.onBurst(false);
    this._ctx = e => e.preventDefault();
  }

  get isTouch() {
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  resolve() {
    if (this.pref === 'auto') return this.isTouch ? 'swipe' : 'keys';
    return this.pref;
  }

  setPref(pref) {
    this.pref = pref;
    this.mode = this.resolve();
    this.hideJoy();
  }

  attach() {
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    this.stage.addEventListener('pointerdown', this._pd);
    this.stage.addEventListener('pointermove', this._pm);
    this.stage.addEventListener('pointerup', this._pu);
    this.stage.addEventListener('pointercancel', this._pu);
    this.stage.addEventListener('contextmenu', this._ctx);
  }

  detach() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('blur', this._blur);
    this.stage.removeEventListener('pointerdown', this._pd);
    this.stage.removeEventListener('pointermove', this._pm);
    this.stage.removeEventListener('pointerup', this._pu);
    this.stage.removeEventListener('pointercancel', this._pu);
    this.stage.removeEventListener('contextmenu', this._ctx);
  }

  onKeyDown(e) {
    const dir = KEY_DIR[e.code];
    if (dir) {
      if (!e.repeat) this.h.onDir(dir);
      e.preventDefault();
      return;
    }
    if (e.code === 'Space' || e.code === 'KeyP') {
      if (!e.repeat) this.h.onPause();
      e.preventDefault();
      return;
    }
    if (e.code === 'Escape') {
      if (!e.repeat) this.h.onEscape();
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyM') {
      if (!e.repeat && this.h.onMute) this.h.onMute();
      return;
    }
    if (e.code === 'KeyR') {
      if (!e.repeat && this.h.onRestartKey) this.h.onRestartKey();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat && this.h.onConfirm) this.h.onConfirm();
      e.preventDefault();
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.h.onBurst(true);
    }
  }

  onKeyUp(e) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.h.onBurst(false);
  }

  pos(e) {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onPointerDown(e) {
    if (this.mode === 'keys' || this.mode === 'dpad') return;
    const p = this.pos(e);
    try { this.stage.setPointerCapture(e.pointerId); } catch (_) {}
    if (this._joyId === null && this._swipe === null) {
      if (this.mode === 'swipe') {
        this._swipe = { id: e.pointerId, x: p.x, y: p.y };
        this.showRipple(p.x, p.y);
      } else if (this.mode === 'joystick') {
        this._joyId = e.pointerId;
        this._joyCenter = p;
        this.joyBase.classList.remove('hidden');
        this.joyBase.style.left = p.x + 'px';
        this.joyBase.style.top = p.y + 'px';
        this.joyStick.style.transform = 'translate(-50%,-50%)';
      }
    } else if (this._burstId === null && e.pointerId !== this._joyId) {
      this._burstId = e.pointerId;
      this.h.onBurst(true);
    }
  }

  onPointerMove(e) {
    if (this.mode === 'keys' || this.mode === 'dpad') return;
    const p = this.pos(e);
    if (this._swipe && e.pointerId === this._swipe.id) {
      const dx = p.x - this._swipe.x;
      const dy = p.y - this._swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 22) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.h.onDir(dir);
        this._swipe.x = p.x;
        this._swipe.y = p.y;
      }
    } else if (this._joyId !== null && e.pointerId === this._joyId) {
      let dx = p.x - this._joyCenter.x;
      let dy = p.y - this._joyCenter.y;
      const mag = Math.hypot(dx, dy);
      const cl = Math.min(mag, 38);
      const nx = mag > 0 ? dx / mag : 0;
      const ny = mag > 0 ? dy / mag : 0;
      this.joyStick.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
      if (mag > 16) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.h.onDir(dir);
      }
    }
  }

  onPointerUp(e) {
    if (this._swipe && e.pointerId === this._swipe.id) this._swipe = null;
    if (e.pointerId === this._joyId) {
      this._joyId = null;
      this.hideJoy();
    }
    if (e.pointerId === this._burstId) {
      this._burstId = null;
      this.h.onBurst(false);
    }
  }

  hideJoy() {
    this.joyBase.classList.add('hidden');
  }

  showRipple(x, y) {
    const el = this.rippleEl;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  bindDPad(container) {
    container.querySelectorAll('.dp-btn[data-dir]').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        this.h.onDir(btn.dataset.dir);
      });
    });
    const burstBtn = document.getElementById('dpBurst');
    burstBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.h.onBurst(true);
    });
    const end = () => this.h.onBurst(false);
    burstBtn.addEventListener('pointerup', end);
    burstBtn.addEventListener('pointercancel', end);
    burstBtn.addEventListener('pointerleave', end);
  }
}

Object.assign(BS, { DIRS, InputManager });

})(window.BS);
