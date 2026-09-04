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
    this._pool = [];   // recycled particle objects
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
    const colors = o.colors ?? ['#7ee08a'];
    const type = o.type ?? 'dot';
    const grav = o.grav ?? 0;
    const baseLife = o.life ?? 500;
    const baseSize = o.size ?? 2;
    const spread = (o.spread ?? TAU) / 2;
    const angle = o.angle;
    const minSpeed = o.minSpeed ?? 0.02;
    const speed = o.speed ?? 0.12;
    const up = o.up ?? 0;
    for (let i = 0; i < count; i++) {
      if (this.list.length > 420) break;
      // Reuse a dead particle's object if one is pooled; otherwise allocate.
      const p = this._pool.pop() || {};
      const a = angle !== undefined ? angle + rand(-spread, spread) : rand(0, TAU);
      const sp = rand(minSpeed, speed);
      const life = rand(baseLife, baseLife * 1.6);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - up;
      p.life = life;
      p.maxLife = life;
      p.size = rand(baseSize, baseSize * 2);
      p.color = pick(colors);
      p.type = type;
      p.grav = grav;
      p.rot = rand(0, TAU);
      p.vr = rand(-0.004, 0.004);
      this.list.push(p);
    }
  }

  popup(x, y, text, color = '#fff', size = 16) {
    if (this.popups.length >= 8) this.popups.shift();
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
    // Swap-pop removal: O(1) per death, no splice array-shifting
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        if (this._pool.length < 256) this._pool.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.rot += p.vr * dt;
      if (p.type === 'leaf') p.x += Math.sin(p.rot * 2) * 0.35;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const t = this.popups[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.popups[i] = this.popups[this.popups.length - 1];
        this.popups.pop();
        continue;
      }
      t.y -= dt * 0.028;
    }
    this.shakeMag *= Math.pow(0.0025, dt / 1000);
    if (this.shakeMag < 0.5) this.shakeMag = 0;
    this.shakeX = this.shakeMag ? Math.round(rand(-1, 1) * this.shakeMag) : 0;
    this.shakeY = this.shakeMag ? Math.round(rand(-1, 1) * this.shakeMag) : 0;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 0.0016);
  }

  render(ctx) {
    // Fast path for the dominant dot/spark/glow types: set globalAlpha
    // directly (no save/restore) — those draws don't mutate transform.
    for (const p of this.list) {
      const a = clamp01(p.life / p.maxLife);
      if (p.type === 'glow' || p.type === 'spark') {
        ctx.globalAlpha = a;
        const r = p.size * 3;
        ctx.drawImage(dotSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
      } else if (p.type === 'leaf' || p.type === 'bubble') {
        ctx.save();
        ctx.globalAlpha = a;
        if (p.type === 'leaf') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU);
          ctx.fill();
        } else {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.popups) {
      const a = clamp01(t.life / t.maxLife);
      const scale = 1 + (1 - a) * 0.25;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size * scale}px 'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(6, 12, 8, 0.75)';
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
