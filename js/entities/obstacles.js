window.BS = window.BS || {};
(function (BS) {
"use strict";
const { COLS, ROWS, TAU, mulberry32 } = BS;

class Obstacles {
  constructor() {
    this.rocks = [];
    this.brambles = [];
    this.spores = [];
    this.portals = [];
    this.time = 0;
    this._ver = 0;
    this._rockKey = '';
    this._rockCv = null;
  }

  clear() {
    this.rocks.length = 0;
    this.brambles.length = 0;
    this.spores.length = 0;
    this.portals.length = 0;
    this._ver++;
  }

  loadFromMap(rows) {
    this.clear();
    const pairs = {};
    for (let y = 0; y < Math.min(rows.length, BS.view ? BS.view.rows : ROWS); y++) {
      const row = rows[y];
      for (let x = 0; x < COLS; x++) {
        const ch = row[x] || '.';
        if (ch === '#') {
          this.rocks.push({ x, y, seed: (x * 73856093 ^ y * 19349663) >>> 0, radii: this._blob((x * 73856093 ^ y * 19349663) >>> 0) });
        } else if (ch === '^') {
          this.brambles.push({ x, y, rot: ((x * 31 + y * 17) % 10) / 10 * TAU });
        } else if (ch === '*') {
          this.spores.push({ x, y, phase: (x + y) * 0.7 });
        } else if (ch >= 'A' && ch <= 'F') {
          if (!pairs[ch]) pairs[ch] = [];
          pairs[ch].push({ x, y });
        }
      }
    }
    let pi = 0;
    for (const key of Object.keys(pairs).sort()) {
      const cells = pairs[key];
      if (cells.length < 2) continue;
      const hue = pi % 2 === 0 ? { main: '#ff9f43', glow: 'rgba(255,159,67,' } : { main: '#48dbfb', glow: 'rgba(72,219,251,' };
      for (const c of cells) {
        this.portals.push({ x: c.x, y: c.y, pair: key, hue, phase: pi });
      }
      pi++;
    }
    this._ver++;
  }

  _bakeRocks(view) {
    this._rockKey = view.cell + '_' + view.dpr + '_' + this._ver;
    if (!this.rocks.length) {
      this._rockCv = null;
      return;
    }
    const cv = document.createElement('canvas');
    cv.width = Math.round(view.w * view.dpr);
    cv.height = Math.round(view.h * view.dpr);
    const c = cv.getContext('2d');
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const cell = view.cell;
    for (const r of this.rocks) {
      const cx = view.cx(r.x);
      const cy = view.cy(r.y);
      c.save();
      c.translate(cx, cy);
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(2, cell * 0.22, cell * 0.42, cell * 0.16, 0, 0, TAU);
      c.fill();
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rr = r.radii[i] * cell;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr * 0.85;
        if (i === 0) c.moveTo(px, py);
        else c.quadraticCurveTo(Math.cos(a - TAU / 16) * rr * 1.12, Math.sin(a - TAU / 16) * rr, px, py);
      }
      c.closePath();
      c.fillStyle = '#6d7884';
      c.fill();
      c.strokeStyle = '#3c444e';
      c.lineWidth = cell * 0.05;
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.ellipse(-cell * 0.1, -cell * 0.14, cell * 0.18, cell * 0.1, -0.5, 0, TAU);
      c.fill();
      c.restore();
    }
    this._rockCv = cv;
  }

  _blob(seed) {
    const rng = mulberry32(seed);
    const r = [];
    for (let i = 0; i < 8; i++) r.push(0.32 + rng() * 0.16);
    return r;
  }

  blocked(x, y) {
    if (this.rocks.some(r => r.x === x && r.y === y)) return 'rock';
    if (this.brambles.some(b => b.x === x && b.y === y)) return 'bramble';
    if (this.spores.some(s => s.x === x && s.y === y)) return 'spore';
    return null;
  }

  portalAt(x, y) {
    const p = this.portals.find(p => p.x === x && p.y === y);
    if (!p) return null;
    const partner = this.portals.find(q => q.pair === p.pair && q !== p);
    return partner ? { x: partner.x, y: partner.y } : null;
  }

  // Distance (in cells) to the nearest hazard adjacent to (x, y), or null.
  nearMissDistance(x, y) {
    let best = null;
    const consider = (hx, hy) => {
      const d = Math.max(Math.abs(hx - x), Math.abs(hy - y));
      if (d >= 1 && (best === null || d < best)) best = d;
    };
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.blocked(nx, ny)) consider(nx, ny);
      }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
  }

  render(ctx, view, time) {
    const cell = view.cell;
    const key = view.cell + '_' + view.dpr + '_' + this._ver;
    if (this._rockKey !== key) this._bakeRocks(view);
    if (this.rocks.length && this._rockCv) {
      ctx.drawImage(this._rockCv, 0, 0, view.w, view.h);
    }
    for (const b of this.brambles) {
      const cx = view.cx(b.x);
      const cy = view.cy(b.y);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(b.rot + Math.sin(time * 0.001 + b.rot) * 0.04);
      ctx.fillStyle = '#274e36';
      ctx.strokeStyle = '#132b1d';
      ctx.lineWidth = cell * 0.03;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.28) * cell * 0.14, Math.sin(a - 0.28) * cell * 0.14);
        ctx.lineTo(Math.cos(a) * cell * 0.46, Math.sin(a) * cell * 0.46);
        ctx.lineTo(Math.cos(a + 0.28) * cell * 0.14, Math.sin(a + 0.28) * cell * 0.14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#3a6b4a';
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e05252';
      for (const [sx, sy] of [[-0.08, -0.06], [0.09, 0.02], [-0.02, 0.1]]) {
        ctx.beginPath();
        ctx.arc(sx * cell, sy * cell, cell * 0.035, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const s of this.spores) {
      const cx = view.cx(s.x);
      const cy = view.cy(s.y);
      const pulse = 1 + 0.14 * Math.sin(time * 0.004 + s.phase);
      const r = cell * 0.34 * pulse;
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      g.addColorStop(0, 'rgba(156,80,220,0.4)');
      g.addColorStop(1, 'rgba(156,80,220,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,40,180,0.82)';
      ctx.strokeStyle = 'rgba(210,150,255,0.9)';
      ctx.lineWidth = cell * 0.045;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,190,255,0.9)';
      for (let i = 0; i < 3; i++) {
        const a = time * 0.0015 + s.phase + i * (TAU / 3);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cell * 0.045, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const p of this.portals) {
      const cx = view.cx(p.x);
      const cy = view.cy(p.y);
      const dir = p.phase % 2 === 0 ? 1 : -1;
      ctx.save();
      ctx.translate(cx, cy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 0.75);
      g.addColorStop(0, p.hue.glow + '0.5)');
      g.addColorStop(1, p.hue.glow + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.75, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = p.hue.main;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a0 = time * 0.0035 * dir + i * (TAU / 3) + p.phase;
        ctx.lineWidth = cell * 0.07 - i * cell * 0.015;
        ctx.globalAlpha = 0.55 + i * 0.15;
        ctx.beginPath();
        ctx.arc(0, 0, cell * (0.18 + i * 0.11), a0, a0 + Math.PI * 1.15);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.hue.main;
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.07, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

Object.assign(BS, { Obstacles });

})(window.BS);
