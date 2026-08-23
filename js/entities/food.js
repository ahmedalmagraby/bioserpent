window.BS = window.BS || {};
(function (BS) {
"use strict";
const { COLS, ROWS, TAU, rand, randi, pick, easeOutCubic, CONFIG } = BS;
// Live board height (adaptive rows); falls back to the static default.
const liveRows = () => (BS.view && BS.view.rows) || ROWS;

const DIR8 = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }
];
const CARDINALS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
];

class FoodManager {
  constructor() {
    this.items = [];
    this.insects = [];
  }

  reset() {
    this.items.length = 0;
    this.insects.length = 0;
  }

  occupied(x, y) {
    if (this.items.some(i => i.gx === x && i.gy === y)) return true;
    return this.insects.some(n =>
      (Math.round(n.fx) === x && Math.round(n.fy) === y) ||
      (n.tx === x && n.ty === y));
  }

  randomFree(isFree) {
    const m = CONFIG.spawnMargin || 0;
    const x0 = Math.min(m, COLS - 1);
    const x1 = Math.max(x0, COLS - 1 - m);
    const R = liveRows();
    const y0 = Math.min(m, R - 1);
    const y1 = Math.max(y0, R - 1 - m);
    for (let i = 0; i < 60; i++) {
      const x = randi(x0, x1);
      const y = randi(y0, y1);
      if (!isFree(x, y)) continue;
      if (this.occupied(x, y)) continue;
      return { x, y };
    }
    for (let i = 0; i < 40; i++) {
      const x = randi(0, COLS - 1);
      const y = randi(0, R - 1);
      if (!isFree(x, y)) continue;
      if (this.occupied(x, y)) continue;
      return { x, y };
    }
    const freeCells = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (isFree(x, y) && !this.occupied(x, y)) {
          freeCells.push({ x, y });
        }
      }
    }
    if (!freeCells.length) {
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < COLS; x++) {
          if (isFree(x, y) && !this.occupied(x, y)) {
            freeCells.push({ x, y });
          }
        }
      }
    }
    return freeCells.length ? pick(freeCells) : null;
  }

  spawnApple(isFree) {
    const c = this.randomFree(isFree);
    if (c) {
      this.items.push({ type: 'apple', gx: c.x, gy: c.y, age: rand(0, 3000), hop: 0, pop: 0 });
      return true;
    }
    return false;
  }

  trySpawnGolden(isFree) {
    if (this.items.some(i => i.type === 'golden')) return false;
    const c = this.randomFree(isFree);
    if (!c) return false;
    this.items.push({ type: 'golden', gx: c.x, gy: c.y, age: 0, life: CONFIG.goldenLifeMs, maxLife: CONFIG.goldenLifeMs, hop: 0, pop: 0 });
    return true;
  }

  spawnInsect(kind, isFree) {
    const c = this.randomFree(isFree);
    if (!c) return false;
    const dur = kind === 'dragonfly' ? 240 : kind === 'beetle' ? 320 : 460;
    this.insects.push({
      kind,
      fx: c.x, fy: c.y, tx: c.x, ty: c.y,
      prog: 1,
      dur,
      dir: pick(kind === 'dragonfly' ? DIR8 : CARDINALS),
      age: rand(0, 2000),
      wing: rand(0, TAU),
      pop: 0
    });
    return true;
  }

  // Serpent Egg: a rare, stationary risk/reward snack. Catch it quickly for a
  // big payout — ignore it and it hatches into a golden berry.
  trySpawnEgg(isFree, particles, view) {
    if (this.items.some(i => i.type === 'egg')) return false;
    const c = this.randomFree(isFree);
    if (!c) return false;
    this.items.push({ type: 'egg', gx: c.x, gy: c.y, age: 0, life: CONFIG.eggLifeMs, maxLife: CONFIG.eggLifeMs, hop: 0, pop: 0, wob: rand(0, TAU) });
    if (particles && view) {
      particles.burst(view.cx(c.x), view.cy(c.y), {
        count: 10, colors: ['#f8f4e6', '#d9cba8', '#ffffff'], speed: 0.07, size: 2, life: 550
      });
    }
    return true;
  }


  magnetPull(head, canLand) {
    for (const it of this.items) {
      const dx = head.x - it.gx;
      const dy = head.y - it.gy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 6 || dist === 0) continue;
      let nx = it.gx;
      let ny = it.gy;
      if (Math.abs(dx) >= Math.abs(dy)) nx += Math.sign(dx);
      else ny += Math.sign(dy);
      if (canLand(nx, ny) && !this.occupied(nx, ny)) {
        it.gx = nx;
        it.gy = ny;
        it.hop = 1;
      }
    }
  }

  update(dt, env) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      it.hop = Math.max(0, it.hop - dt * 0.004);
      if (it.pop !== undefined && it.pop < 1) it.pop = Math.min(1, it.pop + dt / 220);
      if (it.type === 'golden') {
        it.life -= dt;
        if (it.life <= 0) {
          if (env.particles) {
            env.particles.burst(env.view.cx(it.gx), env.view.cy(it.gy), {
              count: 10, colors: ['#ffd54a', '#fff3b0'], speed: 0.08, size: 2, life: 500
            });
          }
          this.items.splice(i, 1);
        }
      } else if (it.type === 'egg') {
        it.wob += dt * 0.004;
        it.life -= dt;
        if (it.life <= 0 && env.view) {
          // Hatch into a golden berry with a fresh timer
          const px = it.gx;
          const py = it.gy;
          this.items.splice(i, 1);
          this.items.push({ type: 'golden', gx: px, gy: py, age: 0, life: CONFIG.goldenLifeMs, maxLife: CONFIG.goldenLifeMs, hop: 0, pop: 0 });
          if (env.particles) {
            env.particles.burst(env.view.cx(px), env.view.cy(py), {
              count: 16, colors: ['#f8f4e6', '#ffd54a', '#fff59d'], speed: 0.12, size: 2.2, life: 650, type: 'spark'
            });
          }
        }
      }
    }
    for (const n of this.insects) {
      n.age += dt;
      n.wing += dt * (n.kind === 'dragonfly' ? 0.08 : n.kind === 'firefly' ? 0.05 : 0.02);
      if (n.pop !== undefined && n.pop < 1) n.pop = Math.min(1, n.pop + dt / 220);
      if (n.prog < 1) {
        n.prog = Math.min(1, n.prog + dt / n.dur);
        continue;
      }
      n.fx = n.tx;
      n.fy = n.ty;
      let chosen = null;
      let bestScore = -Infinity;
      const fleeing = !!env.head &&
        Math.abs(env.head.x - n.fx) + Math.abs(env.head.y - n.fy) <= (n.kind === 'dragonfly' ? 5 : 4);
      const cands = [];
      const dirPool = n.kind === 'dragonfly' ? DIR8 : CARDINALS;
      if (Math.random() < (fleeing ? 0.9 : n.kind === 'dragonfly' ? 0.75 : n.kind === 'beetle' ? 0.65 : 0.3)) cands.push(n.dir);
      // Safely add remaining directions without infinite while loops
      const shuffled = [...dirPool].sort(() => Math.random() - 0.5);
      for (const d of shuffled) {
        if (!cands.some(t => t.x === d.x && t.y === d.y)) cands.push(d);
      }
      for (const d of cands) {
        const nx = n.fx + d.x;
        const ny = n.fy + d.y;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= liveRows()) continue;
        if (env.isFree && !env.isFree(nx, ny)) continue;
        if (this.occupied(nx, ny)) continue;
        if (fleeing) {
          const score = Math.abs(env.head.x - nx) + Math.abs(env.head.y - ny) + Math.random() * 0.4;
          if (score > bestScore) {
            bestScore = score;
            chosen = d;
          }
        } else {
          chosen = d;
          break;
        }
      }
      if (chosen) {
        n.dir = chosen;
        n.tx = n.fx + chosen.x;
        n.ty = n.fy + chosen.y;
        n.prog = 0;
        const baseDur = n.kind === 'dragonfly' ? 240 : n.kind === 'beetle' ? 320 : 460;
        if (fleeing) n.dur = baseDur * (n.kind === 'dragonfly' ? 0.5 : n.kind === 'beetle' ? 0.55 : 0.8);
        else n.dur = baseDur;
      }
    }
  }

  collideCell(gx, gy) {
    const idx = this.items.findIndex(i => i.gx === gx && i.gy === gy);
    if (idx >= 0) return this.items.splice(idx, 1)[0];
    return null;
  }

  insectPos(n) {
    const e = easeOutCubic(n.prog);
    return {
      x: n.fx + (n.tx - n.fx) * e,
      y: n.fy + (n.ty - n.fy) * e
    };
  }

  insectHit(px, py, cell) {
    for (let i = 0; i < this.insects.length; i++) {
      const n = this.insects[i];
      const p = this.insectPos(n);
      const ix = (p.x + 0.5) * cell;
      const iy = (p.y + 0.5) * cell;
      const threshold = cell * (n.kind === 'dragonfly' ? 0.88 : 0.66);
      if (Math.hypot(ix - px, iy - py) < threshold) {
        return this.insects.splice(i, 1)[0];
      }
    }
    return null;
  }


  getNearestItemPx(px, py, cell) {
    let best = null;
    let bd = Infinity;
    const consider = (x, y) => {
      const d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = { x, y, d }; }
    };
    for (const it of this.items) consider((it.gx + 0.5) * cell, (it.gy + 0.5) * cell);
    for (const n of this.insects) {
      const p = this.insectPos(n);
      consider((p.x + 0.5) * cell, (p.y + 0.5) * cell);
    }
    return best;
  }

  render(ctx, view, time) {
    const cell = view.cell;
    for (const it of this.items) {
      const bob = Math.sin(time * 0.003 + it.gx * 2) * cell * 0.04 + it.hop * cell * 0.18;
      const x = view.cx(it.gx);
      const y = view.cy(it.gy) - bob;
      const pop = it.pop === undefined ? 1 : 0.3 + 0.7 * easeOutCubic(Math.min(1, it.pop));
      ctx.save();
      if (pop < 1) {
        ctx.translate(x, view.cy(it.gy));
        ctx.scale(pop, pop);
        ctx.translate(-x, -view.cy(it.gy));
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(view.cx(it.gx), view.cy(it.gy) + cell * 0.3, cell * 0.24, cell * 0.07, 0, 0, TAU);
      ctx.fill();
      if (it.type === 'apple') {
        ctx.fillStyle = '#c62828';
        ctx.strokeStyle = '#7f1616';
        ctx.lineWidth = cell * 0.04;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.32, 0, TAU);
        ctx.fill();
        ctx.stroke();
        const g = ctx.createRadialGradient(x - cell * 0.1, y - cell * 0.12, 1, x, y, cell * 0.36);
        g.addColorStop(0, '#ff8a80');
        g.addColorStop(0.5, '#e53935');
        g.addColorStop(1, '#c62828');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.32, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(x - cell * 0.11, y - cell * 0.12, cell * 0.07, cell * 0.045, -0.6, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#6d4c41';
        ctx.lineWidth = cell * 0.05;
        ctx.beginPath();
        ctx.moveTo(x, y - cell * 0.28);
        ctx.quadraticCurveTo(x + cell * 0.03, y - cell * 0.42, x + cell * 0.08, y - cell * 0.46);
        ctx.stroke();
        ctx.fillStyle = '#43a047';
        ctx.beginPath();
        ctx.ellipse(x + cell * 0.17, y - cell * 0.42, cell * 0.13, cell * 0.06, -0.5, 0, TAU);
        ctx.fill();
      } else if (it.type === 'egg') {
        // Serpent Egg: cream shell, speckles, wobble intensifies near hatching
        const urgency = 1 - it.life / (it.maxLife || 1);
        const wob = Math.sin(time * (0.008 + urgency * 0.02) + it.wob) * (0.08 + urgency * 0.22);
        ctx.translate(x, y);
        ctx.rotate(wob);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.beginPath();
        ctx.ellipse(0, cell * 0.3 - (y - y), cell * 0.22, cell * 0.06, 0, 0, TAU);
        ctx.fill();
        const g = ctx.createRadialGradient(-cell * 0.07, -cell * 0.09, 1, 0, 0, cell * 0.34);
        g.addColorStop(0, '#fffdf4');
        g.addColorStop(0.7, '#f2e9cf');
        g.addColorStop(1, '#d9cba8');
        ctx.fillStyle = g;
        ctx.strokeStyle = '#a89a72';
        ctx.lineWidth = cell * 0.04;
        ctx.beginPath();
        ctx.ellipse(0, 0, cell * 0.26, cell * 0.33, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(140,120,80,0.55)';
        for (const [sx, sy, sr] of [[-0.08, -0.12, 0.03], [0.09, -0.04, 0.025], [-0.05, 0.08, 0.028], [0.06, 0.14, 0.02]]) {
          ctx.beginPath();
          ctx.arc(sx * cell, sy * cell, sr * cell, 0, TAU);
          ctx.fill();
        }
        if (urgency > 0.65) {
          // Cracks appear as hatching nears
          ctx.strokeStyle = '#8c7c52';
          ctx.lineWidth = cell * 0.03;
          ctx.beginPath();
          ctx.moveTo(-cell * 0.16, -cell * 0.05);
          ctx.lineTo(-cell * 0.05, 0);
          ctx.lineTo(-cell * 0.12, cell * 0.08);
          ctx.stroke();
        }
      } else {
        const pulse = 0.85 + 0.15 * Math.sin(time * 0.007 + it.gx);
        const blink = it.life < 2600 ? (Math.sin(time * 0.025) > -0.3 ? 1 : 0.25) : 1;
        ctx.globalAlpha = blink;
        const g = ctx.createRadialGradient(x, y, 0, x, y, cell * 0.9 * pulse);
        g.addColorStop(0, 'rgba(255,213,74,0.75)');
        g.addColorStop(1, 'rgba(255,213,74,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.9 * pulse, 0, TAU);
        ctx.fill();
        const frac = Math.max(0, it.life / (it.maxLife || CONFIG.goldenLifeMs));
        ctx.strokeStyle = frac < 0.35 ? '#ff6b6b' : '#ffd54a';
        ctx.lineWidth = cell * 0.06;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.46, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
        ctx.stroke();
        ctx.fillStyle = '#ffca28';
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = cell * 0.035;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.26, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff59d';
        ctx.beginPath();
        ctx.arc(x - cell * 0.08, y - cell * 0.09, cell * 0.08, 0, TAU);
        ctx.fill();
        for (let k = 0; k < 3; k++) {
          const a = time * 0.004 + k * (TAU / 3);
          ctx.fillStyle = '#fffde7';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * cell * 0.42, y + Math.sin(a) * cell * 0.42, cell * 0.045, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    for (const n of this.insects) {
      const p = this.insectPos(n);
      const x = (p.x + 0.5) * cell;
      const y = (p.y + 0.5) * cell;
      const pop = n.pop === undefined ? 1 : Math.min(1, n.pop);
      ctx.save();
      ctx.translate(x, y);
      if (pop < 1) ctx.scale(pop, pop);
      if (n.kind === 'firefly') {
        const glow = 0.7 + 0.3 * Math.sin(time * 0.01 + n.wing);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 0.8);
        g.addColorStop(0, `rgba(212,255,120,${0.5 * glow})`);
        g.addColorStop(1, 'rgba(212,255,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.8, 0, TAU);
        ctx.fill();
        const flap = Math.sin(n.wing) * 0.7;
        ctx.fillStyle = 'rgba(220,240,255,0.75)';
        for (const s of [-1, 1]) {
          ctx.save();
          ctx.rotate(s * (0.9 + flap * s));
          ctx.beginPath();
          ctx.ellipse(cell * 0.12, 0, cell * 0.16, cell * 0.06, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#33691e';
        ctx.beginPath();
        ctx.arc(-cell * 0.08, 0, cell * 0.09, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#d4ff78';
        ctx.shadowColor = '#d4ff78';
        ctx.shadowBlur = cell * 0.3;
        ctx.beginPath();
        ctx.ellipse(cell * 0.08, 0, cell * 0.14, cell * 0.1, 0, 0, TAU);
        ctx.fill();
      } else if (n.kind === 'dragonfly') {
        const ang = Math.atan2(n.ty - n.fy, n.tx - n.fx);
        if (!(n.tx === n.fx && n.ty === n.fy)) ctx.rotate(ang);
        const flap = Math.sin(n.wing * 1.6) * 0.45;
        // 4 wings (2 on each side)
        ctx.fillStyle = 'rgba(140, 230, 255, 0.6)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = cell * 0.02;
        for (const s of [-1, 1]) {
          // Front wing
          ctx.save();
          ctx.rotate(s * (1.1 + flap * s));
          ctx.beginPath();
          ctx.ellipse(0, s * cell * 0.22, cell * 0.07, cell * 0.26, s * 0.2, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          // Back wing
          ctx.save();
          ctx.rotate(s * (1.5 - flap * s * 0.8));
          ctx.beginPath();
          ctx.ellipse(-cell * 0.06, s * cell * 0.18, cell * 0.06, cell * 0.22, -s * 0.2, 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        // Long slender iridescent body
        const grad = ctx.createLinearGradient(-cell * 0.3, 0, cell * 0.25, 0);
        grad.addColorStop(0, '#00b4d8');
        grad.addColorStop(0.5, '#48cae4');
        grad.addColorStop(1, '#90e0ef');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(-cell * 0.08, 0, cell * 0.28, cell * 0.05, 0, 0, TAU);
        ctx.fill();
        // Thorax & Head
        ctx.fillStyle = '#023e8a';
        ctx.beginPath();
        ctx.arc(cell * 0.14, 0, cell * 0.07, 0, TAU);
        ctx.fill();
        // Compound big glowing eyes
        ctx.fillStyle = '#00f5d4';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cell * 0.18, s * cell * 0.05, cell * 0.04, 0, TAU);
          ctx.fill();
        }
      } else {
        const ang = Math.atan2(n.ty - n.fy, n.tx - n.fx);
        if (!(n.tx === n.fx && n.ty === n.fy)) ctx.rotate(ang);
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = cell * 0.03;
        for (let l = 0; l < 3; l++) {
          const lx = -cell * 0.1 + l * cell * 0.12;
          const sw = Math.sin(n.wing * 3 + l * 2) * cell * 0.05;
          ctx.beginPath();
          ctx.moveTo(lx, -cell * 0.08);
          ctx.lineTo(lx - cell * 0.06, -cell * 0.18 + sw);
          ctx.moveTo(lx, cell * 0.08);
          ctx.lineTo(lx - cell * 0.06, cell * 0.18 - sw);
          ctx.stroke();
        }
        ctx.fillStyle = '#4e342e';
        ctx.strokeStyle = '#2a1815';
        ctx.lineWidth = cell * 0.03;
        ctx.beginPath();
        ctx.ellipse(0, 0, cell * 0.24, cell * 0.17, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#8d6e63';
        ctx.lineWidth = cell * 0.025;
        ctx.beginPath();
        ctx.moveTo(-cell * 0.16, 0);
        ctx.lineTo(cell * 0.16, 0);
        ctx.stroke();
        ctx.fillStyle = '#d7ccc8';
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cell * 0.26, s * cell * 0.06, cell * 0.025, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#3e2723';
        ctx.beginPath();
        ctx.arc(cell * 0.27, 0, cell * 0.08, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = cell * 0.02;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cell * 0.32, s * cell * 0.04);
          ctx.lineTo(cell * 0.44, s * cell * 0.12);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}

Object.assign(BS, { FoodManager });

})(window.BS);
