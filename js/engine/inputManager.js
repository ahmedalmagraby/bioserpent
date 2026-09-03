window.BS = window.BS || {};
(function (BS) {
"use strict";
const { clamp } = BS;

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

// Gamepad mapping (standard layout):
//   D-pad / left stick → steer
//   A / B / RB / RT    → speed burst (hold)
//   Start (+)          → pause / resume
//   A on menus         → confirm / start
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
    this._joyLastDir = null;
    this.joyBase = document.getElementById('joyBase');
    this.joyStick = document.getElementById('joyStick');
    this.rippleEl = document.getElementById('ripple');
    this._kd = e => this.onKeyDown(e);
    this._ku = e => this.onKeyUp(e);
    this._pd = e => this.onPointerDown(e);
    this._pm = e => this.onPointerMove(e);
    this._pu = e => this.onPointerUp(e);
    this._blur = () => { this.h.onBurst(false); this.resetPad(); };
    this._ctx = e => e.preventDefault();
    // --- Gamepad state ---
    this.padIndex = null;        // gamepad index claimed as the active pad
    this._padDir = null;         // last direction sent (edge-trigger)
    this._padBurst = false;      // burst currently held via pad
    this._padStart = false;      // Start button edge state
    this._padA = false;          // A button edge state (confirm)
    this.STICK_THRESHOLD = 0.55;
  }

  resetPad() {
    if (this._padDir) { this._padDir = null; }
    if (this._padBurst) {
      this._padBurst = false;
      this.h.onBurst(false);
      this.setBurstVisual(false);
    }
    this._padStart = false;
    this._padA = false;
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
    this._gc = e => this.onGamepadConnected(e);
    this._gd = e => this.onGamepadDisconnected(e);
    window.addEventListener('gamepadconnected', this._gc);
    window.addEventListener('gamepaddisconnected', this._gd);
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
    window.removeEventListener('gamepadconnected', this._gc);
    window.removeEventListener('gamepaddisconnected', this._gd);
    this.stage.removeEventListener('pointerdown', this._pd);
    this.stage.removeEventListener('pointermove', this._pm);
    this.stage.removeEventListener('pointerup', this._pu);
    this.stage.removeEventListener('pointercancel', this._pu);
    this.stage.removeEventListener('contextmenu', this._ctx);
  }

  // ---- Gamepad ----
  // Polled every frame by the game loop (navigator.getGamepads is poll-only).
  // First pad to press a button becomes the active pad; only that one drives input.
  onGamepadConnected(e) {
    if (this.padIndex === null) {
      this.padIndex = e.gamepad.index;
      if (this.h.onGamepad) this.h.onGamepad(true);
    }
  }

  onGamepadDisconnected(e) {
    if (e.gamepad.index === this.padIndex) {
      this.padIndex = null;
      this.resetPad();
      if (this.h.onGamepad) this.h.onGamepad(false);
    }
  }

  getActivePad() {
    if (typeof navigator.getGamepads !== 'function') return null;
    const pads = navigator.getGamepads();
    if (this.padIndex !== null) return pads[this.padIndex] || null;
    // No pad claimed yet: claim the first one with any active input so a
    // freshly-plugged controller works even before 'gamepadconnected'.
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const pressed = p.buttons.some(b => b && b.pressed);
      const moved = p.axes.some(a => Math.abs(a) > this.STICK_THRESHOLD);
      if (pressed || moved) {
        this.padIndex = p.index;
        if (this.h.onGamepad) this.h.onGamepad(true);
        return p;
      }
    }
    return null;
  }

  pollGamepad() {
    const pad = this.getActivePad();
    if (!pad) return;
    const bt = i => !!(pad.buttons[i] && pad.buttons[i].pressed);

    // --- Steer: D-pad buttons (12-15) or left stick (axes 0/1)
    let dir = null;
    if (bt(12)) dir = 'up';
    else if (bt(13)) dir = 'down';
    else if (bt(14)) dir = 'left';
    else if (bt(15)) dir = 'right';
    else {
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      if (Math.abs(ax) > this.STICK_THRESHOLD || Math.abs(ay) > this.STICK_THRESHOLD) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
      }
    }
    if (dir && dir !== this._padDir) {
      this._padDir = dir;
      this.h.onDir(dir);
    } else if (!dir) {
      this._padDir = null;
    }

    // --- Burst: A(0) / B(1) / RB(5) / RT(7), hold-to-burst
    const burstNow = bt(0) || bt(1) || bt(5) || bt(7);
    if (burstNow !== this._padBurst) {
      this._padBurst = burstNow;
      this.h.onBurst(burstNow);
      this.setBurstVisual(burstNow);
    }

    // --- Start(9): pause/resume, edge-triggered
    const startNow = bt(9);
    if (startNow && !this._padStart) {
      this.h.onPause();
    }
    this._padStart = startNow;

    // --- A(0) when NOT bursting-only context: confirm / restart, edge-triggered.
    // Safe during play too — the handler ignores presses while playing.
    const aNow = bt(0);
    if (aNow && !this._padA && this.h.onConfirm) {
      this.h.onConfirm();
    }
    this._padA = aNow;
  }

  onKeyDown(e) {
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
    if (e.key === '?' || e.code === 'KeyH') {
      if (!e.repeat && this.h.onGuideKey) {
        this.h.onGuideKey();
        e.preventDefault();
        return;
      }
    }
    const t = e.target;
    if (t && t.closest && t.closest('input, select, textarea, button, a')) return;
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
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (!e.repeat && this.h.onConfirm) this.h.onConfirm();
      e.preventDefault();
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.h.onBurst(true);
      this.setBurstVisual(true);
    }
  }

  onKeyUp(e) {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.h.onBurst(false);
      this.setBurstVisual(false);
    }
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
        this._joyLastDir = null;
        const r = this.stage ? this.stage.getBoundingClientRect() : null;
        // Offset center slightly above touch point so thumb doesn't block stick
        const joyOffsetY = 40;
        const maxW = r && r.width > 110 ? r.width - 55 : 55;
        const maxH = r && r.height > 110 ? r.height - 55 : 55;
        const cx = Math.max(55, Math.min(maxW, p.x));
        const cy = Math.max(55, Math.min(maxH, p.y - joyOffsetY));
        this._joyCenter = { x: cx, y: cy };
        this.joyBase.classList.remove('hidden');
        this.joyBase.style.left = cx + 'px';
        this.joyBase.style.top = cy + 'px';
        this.joyStick.style.transform = 'translate(-50%,-50%)';
      }
    } else if (this._burstId === null && e.pointerId !== this._joyId) {
      this._burstId = e.pointerId;
      this.h.onBurst(true);
      this.setBurstVisual(true);
      if (!this._burstHintShown) {
        this._burstHintShown = true;
        if (this.h.onBurstHint) this.h.onBurstHint();
      }
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
        if (dir !== this._joyLastDir) {
          this._joyLastDir = dir;
          this.h.onDir(dir);
        }
      } else {
        this._joyLastDir = null;
      }
    }
  }

  onPointerUp(e) {
    if (this._swipe && e.pointerId === this._swipe.id) this._swipe = null;
    if (e.pointerId === this._joyId) {
      this._joyId = null;
      this._joyLastDir = null;
      this.hideJoy();
    }
    if (e.pointerId === this._burstId) {
      this._burstId = null;
      this.h.onBurst(false);
      this.setBurstVisual(false);
    }
  }

  hideJoy() {
    this._joyLastDir = null;
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

  setBurstVisual(active) {
    const btn = document.getElementById('dpBurst');
    if (btn) {
      btn.classList.toggle('held', !!active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  bindDPad(container) {
    this._dpDirId = null;
    this._dpBurstId = null;
    this._dpLastDir = null;
    container.addEventListener('pointerdown', e => {
      const btn = e.target && e.target.closest
        ? e.target.closest('.dp-btn')
        : (e.target && (e.target.id === 'dpBurst' || (e.target.classList && e.target.classList.contains('dp-btn'))) ? e.target : null);
      if (!btn) return;
      if (e.preventDefault) e.preventDefault();
      try { if (btn.releasePointerCapture) btn.releasePointerCapture(e.pointerId); } catch (_) {}
      if (btn.id === 'dpBurst' || !btn.dataset.dir) {
        this._dpBurstId = e.pointerId;
        this.h.onBurst(true);
        this.setBurstVisual(true);
      } else {
        this._dpDirId = e.pointerId;
        this._dpLastDir = btn.dataset.dir;
        this.h.onDir(btn.dataset.dir);
      }
    });
    container.addEventListener('pointermove', e => {
      if (e.pointerId !== this._dpDirId || this._dpLastDir === null) return;
      const el = document.elementFromPoint ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const btn = el && el.closest ? el.closest('.dp-btn[data-dir]') : null;
      const dir = btn ? btn.dataset.dir : null;
      if (dir && dir !== this._dpLastDir) {
        this._dpLastDir = dir;
        this.h.onDir(dir);
      }
    });
    const release = e => {
      if (e.pointerId === this._dpBurstId) {
        this._dpBurstId = null;
        this.h.onBurst(false);
        this.setBurstVisual(false);
      }
      if (e.pointerId === this._dpDirId) {
        this._dpDirId = null;
        this._dpLastDir = null;
      }
    };
    container.addEventListener('pointerup', release);
    container.addEventListener('pointercancel', release);
  }
}

Object.assign(BS, { DIRS, InputManager });


})(window.BS);
