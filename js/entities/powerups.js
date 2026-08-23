window.BS = window.BS || {};
(function (BS) {
"use strict";
const { COLS, ROWS, TAU, rand, randi, pick, CONFIG } = BS;
// Live board height (adaptive rows); falls back to the static default.
const liveRows = () => (BS.view && BS.view.rows) || ROWS;

const POWERUP_META = {
  magnet: { label: 'Magnet Spore', short: 'M', color: '#69b7ff', cap: '#3f7fd0', spot: '#bcdcff', dur: 9000 },
  slow: { label: 'Slow-Mo Amber', short: 'S', color: '#ffc24b', cap: '#d98f2b', spot: '#ffe4ae', dur: 7000 },
  ghost: { label: 'Ghost Phase', short: 'G', color: '#cfd8ff', cap: '#8f9bd0', spot: '#eceffb', dur: 8000 },
  multi: { label: '2× Multiplier', short: '×2', color: '#ffd54a', cap: '#e0a52b', spot: '#fff3b0', dur: 9000 },
  prune: { label: 'Prune Shroom', short: '−3', color: '#ff9ad5', cap: '#c85fa5', spot: '#ffd9ef', dur: 0 }
};

const TYPES = Object.keys(POWERUP_META);

class PowerUpManager {
  constructor() {
    this.field = [];
  }

  reset() {
    this.field.length = 0;
  }

  occupied(x, y) {
    return this.field.some(p => p.gx === x && p.gy === y);
  }

  spawn(isFree, forceType) {
    if (this.field.length >= 2) return;
    const m = CONFIG.spawnMargin || 0;
    const x0 = Math.min(m, COLS - 1);
    const x1 = Math.max(x0, COLS - 1 - m);
    const R = liveRows();
    const y0 = Math.min(m, R - 1);
    const y1 = Math.max(y0, R - 1 - m);
    for (let i = 0; i < 50; i++) {
      const x = randi(x0, x1);
      const y = randi(y0, y1);
      if (!isFree(x, y)) continue;
      if (this.occupied(x, y)) continue;
      this.field.push({ type: forceType ?? pick(TYPES), gx: x, gy: y, age: rand(0, 2000), life: CONFIG.powerupLifeMs });
      return;
    }
    for (let i = 0; i < 30; i++) {
      const x = randi(0, COLS - 1);
      const y = randi(0, R - 1);
      if (!isFree(x, y)) continue;
      if (this.occupied(x, y)) continue;
      this.field.push({ type: forceType ?? pick(TYPES), gx: x, gy: y, age: rand(0, 2000), life: CONFIG.powerupLifeMs });
      return;
    }
    const freeCells = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (isFree(x, y) && !this.occupied(x, y)) freeCells.push({ x, y });
      }
    }
    if (!freeCells.length) {
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < COLS; x++) {
          if (isFree(x, y) && !this.occupied(x, y)) freeCells.push({ x, y });
        }
      }
    }
    if (freeCells.length) {
      const c = pick(freeCells);
      this.field.push({ type: forceType ?? pick(TYPES), gx: c.x, gy: c.y, age: rand(0, 2000), life: CONFIG.powerupLifeMs });
    }
  }

  update(dt) {
    for (let i = this.field.length - 1; i >= 0; i--) {
      const p = this.field[i];
      p.age += dt;
      p.life -= dt;
      if (p.life <= 0) this.field.splice(i, 1);
    }
  }

  collide(gx, gy) {
    const idx = this.field.findIndex(p => p.gx === gx && p.gy === gy);
    if (idx >= 0) return this.field.splice(idx, 1)[0];
    return null;
  }

  render(ctx, view, time) {
    const cell = view.cell;
    for (const p of this.field) {
      const meta = POWERUP_META[p.type];
      const x = view.cx(p.gx);
      const bob = Math.sin(time * 0.0035 + p.gx) * cell * 0.06;
      const y = view.cy(p.gy) + bob;
      const blink = p.life < 3000 ? (Math.sin(time * 0.02) > -0.2 ? 1 : 0.2) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      const pulse = 0.8 + 0.2 * Math.sin(time * 0.006 + p.gy);
      const g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.95 * pulse);
      g.addColorStop(0, meta.color + '66');
      g.addColorStop(1, meta.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.95 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, view.cy(p.gy) + cell * 0.32, cell * 0.24, cell * 0.08, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#efe6d8';
      ctx.strokeStyle = 'rgba(60,50,40,0.6)';
      ctx.lineWidth = cell * 0.03;
      ctx.beginPath();
      ctx.roundRect(x - cell * 0.11, y, cell * 0.22, cell * 0.3, cell * 0.08);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = meta.cap;
      ctx.strokeStyle = 'rgba(30,20,30,0.55)';
      ctx.beginPath();
      ctx.ellipse(x, y, cell * 0.36, cell * 0.27, 0, Math.PI, TAU);
      ctx.quadraticCurveTo(x, y + cell * 0.12, x - cell * 0.36, y);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = meta.spot;
      for (const [sx, sy, sr] of [[-0.16, -0.13, 0.055], [0.14, -0.16, 0.045], [0.02, -0.05, 0.04]]) {
        ctx.beginPath();
        ctx.arc(x + sx * cell, y + sy * cell, sr * cell, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(25,20,35,0.85)';
      ctx.font = `900 ${cell * 0.26}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.short, x, y - cell * 0.12);
      ctx.restore();
    }
  }
}

Object.assign(BS, { POWERUP_META, PowerUpManager });

})(window.BS);
