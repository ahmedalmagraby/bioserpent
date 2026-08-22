window.BS = window.BS || {};
(function (BS) {
"use strict";
const { rand, randi, pick, TAU, REDUCED_MOTION } = BS;

const _spriteCache = new Map();
function dotSprite(color) {
  let cv = _spriteCache.get(color);
  if (cv) return cv;
  const r = 32;
  cv = document.createElement('canvas');
  cv.width = r * 2;
  cv.height = r * 2;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, r * 2, r * 2);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, r * 2, r * 2);
  _spriteCache.set(color, cv);
  return cv;
}

class Particles {
  constructor() {
    this.list = [];
    this.popups = [];
    this.shakeMag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.biome = null;
    this._ambAcc = 0;
  }

  clear() {
    this.list.length = 0;
    this.popups.length = 0;
    this.shakeMag = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this._ambAcc = 0;
  }

  shake(m) {
    if (REDUCED_MOTION) m *= 0.35;
    this.shakeMag = Math.max(this.shakeMag, m);
  }

  flash(color, a) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, a);
  }

  burst(x, y, o = {}) {
    const count = o.count ?? 12;
    for (let i = 0; i < count; i++) {
      if (this.list.length > 420) break;
      const a = o.angle !== undefined
        ? o.angle + rand(-(o.spread ?? TAU) / 2, (o.spread ?? TAU) / 2)
        : rand(0, TAU);
      const sp = rand(o.minSpeed ?? 0.02, o.speed ?? 0.12);
      const life = rand(o.life ?? 500, (o.life ?? 500) * 1.6);
      this.list.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.up ?? 0),
        life,
        maxLife: life,
        size: rand(o.size ?? 2, (o.size ?? 2) * 2),
        color: pick(o.colors ?? ['#7ee08a']),
        type: o.type ?? 'dot',
        grav: o.grav ?? 0,
        rot: rand(0, TAU),
        vr: rand(-0.004, 0.004)
      });
    }
  }

  popup(x, y, text, color = '#fff', size = 16) {
    this.popups.push({ x, y, text, color, size, life: 1100, maxLife: 1100 });
  }

  ambient(key, w, h, dt) {
    if (!key) return;
    this._ambAcc += dt;
    let interval = key === 'cavern' ? 260 : 340;
    if (REDUCED_MOTION) interval *= 3;
    while (this._ambAcc > interval) {
      this._ambAcc -= interval;
      if (this.list.length > 380) break;
      if (key === 'rainforest') {
        this.list.push({
          x: rand(0, w), y: -10,
          vx: rand(0.008, 0.03), vy: rand(0.02, 0.05),
          life: 9000, maxLife: 9000,
          size: rand(3, 6), color: pick(['#3f7d4b', '#57a05a', '#2f6640']),
          type: 'leaf', grav: 0, rot: rand(0, TAU), vr: rand(-0.002, 0.002)
        });
      } else if (key === 'oasis') {
        this.list.push({
          x: rand(0, w), y: rand(0, h),
          vx: rand(0.02, 0.06), vy: rand(-0.004, 0.004),
          life: 6000, maxLife: 6000,
          size: rand(1, 2.4), color: pick(['#e8c98a', '#d9a95f']),
          type: 'dot', grav: 0, rot: 0, vr: 0
        });
      } else if (key === 'cavern') {
        this.list.push({
          x: rand(0, w), y: rand(0, h),
          vx: rand(-0.006, 0.006), vy: rand(-0.015, -0.004),
          life: 7000, maxLife: 7000,
          size: rand(1.5, 3), color: pick(['#6ee7f0', '#8f7bff', '#54d0c8']),
          type: 'glow', grav: 0, rot: 0, vr: 0
        });
      } else if (key === 'reef') {
        this.list.push({
          x: rand(0, w), y: h + 8,
          vx: rand(-0.008, 0.008), vy: rand(-0.05, -0.025),
          life: 8000, maxLife: 8000,
          size: rand(2, 5), color: pick(['#9fdcf0', '#cfeef8']),
          type: 'bubble', grav: 0, rot: 0, vr: 0
        });
      }
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.rot += p.vr * dt;
      if (p.type === 'leaf') p.x += Math.sin(p.rot * 2) * 0.35;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const t = this.popups[i];
      t.life -= dt;
      if (t.life <= 0) { this.popups.splice(i, 1); continue; }
      t.y -= dt * 0.028;
    }
    this.shakeMag *= Math.pow(0.0025, dt / 1000);
    if (this.shakeMag < 0.5) this.shakeMag = 0;
    this.shakeX = this.shakeMag ? Math.round(rand(-1, 1) * this.shakeMag) : 0;
    this.shakeY = this.shakeMag ? Math.round(rand(-1, 1) * this.shakeMag) : 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.0016);
  }

  render(ctx) {
    for (const p of this.list) {
      const a = clamp01(p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.type === 'glow' || p.type === 'spark') {
        const r = p.size * 3;
        ctx.drawImage(dotSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.type === 'leaf') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU);
        ctx.fill();
      } else if (p.type === 'bubble') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const t of this.popups) {
      const a = clamp01(t.life / t.maxLife);
      const scale = 1 + (1 - a) * 0.25;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size * scale}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  renderFlash(ctx, w, h) {
    if (this.flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

Object.assign(BS, { Particles });

})(window.BS);
