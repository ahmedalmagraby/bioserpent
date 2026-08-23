window.BS = window.BS || {};
(function (BS) {
"use strict";
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
const COLS = 20;
const BASE_ROWS = 20;          // default board height in cells
const ROWS_MIN = 14;
const ROWS_MAX = 30;
const TAU = Math.PI * 2;

// Adaptive board height: keep cells big by growing/shrinking ROW count to the
// viewport aspect. Campaign levels are always square (their maps are authored
// on a fixed 20x20 grid).
function rowsFor(availW, availH, forced) {
  if (forced) return forced;
  const idealRows = availW > 0 ? Math.round((availH / availW) * COLS) : BASE_ROWS;
  return clamp(idealRows, ROWS_MIN, ROWS_MAX);
}

const CONFIG = {
  stepMs: { classic: 145, timeattack: 125, zen: 165, demo: 135 },
  minStepMs: 68,
  speedPerApple: 2.1,
  topSpeedMs: 80,
  burstMul: 0.55,
  slowMul: 0.5,
  easeMs: 700,
  easeBoost: 0.7,
  comboMs: 3800,
  comboMax: 5,
  comboStep: 0.3,
  taStartMs: 90000,
  taUrgentMs: 10000,
  taAppleBonus: 3000,
  taGoldenBonus: 6000,
  taBeetleBonus: 5000,
  taFireflyBonus: 5000,
  taDragonflyBonus: 7000,
  gains: { apple: 10, golden: 50, beetle: 40, firefly: 30, dragonfly: 60 },
  goldenLifeMs: 11000,
  eggLifeMs: 9000,
  eggRatePerMs: 0.000045,
  gainsEgg: 75,
  powerupLifeMs: 12000,
  goldenRatePerMs: 0.00009,
  powerupRatePerMs: 0.00007,
  insectRespawnMs: 2600,
  nearMissGain: 5,
  nearMissDist: 1.6,
  nearMissCooldownMs: 900,
  spawnMargin: 1,
  maxStepCatchup: 4,
  hudThrottleMs: 110,
  dprMax: 3
};

const REDUCED_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class View {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.cell = 24;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.resize();

    if (typeof ResizeObserver !== 'undefined' && this.stage) {
      let rzTimer = null;
      this._ro = new ResizeObserver(() => {
        clearTimeout(rzTimer);
        rzTimer = setTimeout(() => {
          this.resize();
          if (BS.game && BS.game.onResize) BS.game.onResize();
        }, 16);
      });
      this._ro.observe(this.stage);
    }
  }

  resize() {
    if (!this.stage) return;
    const r = this.stage.getBoundingClientRect();
    const cs = getComputedStyle(this.stage);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const availW = Math.max(120, r.width - padL - padR);
    const availH = Math.max(120, r.height - padT - padB);
    this.rows = rowsFor(availW, availH, this.forcedRows);
    this.cell = Math.max(13, Math.floor(Math.min(availW / COLS, availH / this.rows)));
    this.w = this.cell * COLS;
    this.h = this.cell * this.rows;
    this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.dprMax);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  cx(gx) { return (gx + 0.5) * this.cell; }
  cy(gy) { return (gy + 0.5) * this.cell; }
}


Object.assign(BS, { COLS, ROWS: BASE_ROWS, BASE_ROWS, ROWS_MIN, ROWS_MAX, TAU, CONFIG, REDUCED_MOTION, clamp, lerp, rand, randi, pick, easeOutCubic, lerpColor, mulberry32, View });

})(window.BS);
