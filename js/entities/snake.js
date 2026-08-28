window.BS = window.BS || {};
(function (BS) {
"use strict";
const { clamp, lerp, rand, TAU, lerpColor } = BS;

const SKINS = [
  {
    id: 'emerald', name: 'Emerald Python',
    c1: '#3fae63', c2: '#1d6b3c', belly: '#cdeea8', outline: '#0d331e',
    pattern: '#a5e06c', eye: '#ffd23e', pupil: '#181810', tongue: '#ff6b8a',
    banded: false, trail: null, unlock: null, hint: 'Default species'
  },
  {
    id: 'coral', name: 'Coral Serpent',
    c1: '#ff8a65', c2: '#e8455a', belly: '#ffd9c2', outline: '#5e1220',
    pattern: '#ffe0b8', eye: '#4fc3f7', pupil: '#101820', tongue: '#ff4d6d',
    banded: true, trail: null,
    unlock: { type: 'apples', value: 30 }, hint: 'Eat 30 apples (total)'
  },
  {
    id: 'golden', name: 'Golden Sun Dragon',
    c1: '#ffd54a', c2: '#f57f2c', belly: '#fff3b0', outline: '#7a3c07',
    pattern: '#fffbe0', eye: '#ff5252', pupil: '#201005', tongue: '#d84343',
    banded: false, trail: 'sparkle',
    unlock: { type: 'classicBest', value: 200 }, hint: 'Score 200+ in Classic'
  },
  {
    id: 'abyssal', name: 'Abyssal Biolume',
    c1: '#2a6f97', c2: '#14335c', belly: '#9be8f5', outline: '#071c33',
    pattern: '#6ee7f0', eye: '#7cf7d4', pupil: '#03141c', tongue: '#5fd0e8',
    banded: true, trail: 'glow',
    unlock: { type: 'level', value: 8 }, hint: 'Complete Sunken Maze'
  },
  {
    id: 'albino', name: 'Albino Royal',
    c1: '#f7f0f4', c2: '#d9b8dc', belly: '#ffffff', outline: '#8d6a93',
    pattern: '#f2c7ee', eye: '#b388ff', pupil: '#2a1440', tongue: '#ff8ab5',
    banded: false, trail: 'sparkle',
    unlock: { type: 'stars', value: 18 }, hint: 'Earn 18 stars'
  },
  {
    id: 'aurora', name: 'Cosmic Aurora',
    c1: '#a855f7', c2: '#06b6d4', belly: '#e0e7ff', outline: '#1e1b4b',
    pattern: '#f472b6', eye: '#38bdf8', pupil: '#0f172a', tongue: '#f43f5e',
    banded: true, trail: 'glow',
    unlock: { type: 'stars', value: 25 }, hint: 'Earn 25 stars'
  },
  {
    id: 'crimson', name: 'Crimson Dragon',
    c1: '#ef4444', c2: '#7f1d1d', belly: '#fef08a', outline: '#450a0a',
    pattern: '#f97316', eye: '#fbbf24', pupil: '#18181b', tongue: '#dc2626',
    banded: false, trail: 'sparkle',
    unlock: { type: 'classicBest', value: 350 }, hint: 'Score 350+ in Classic'
  }
];

const SAMPLE = 0.3;
// Mirrors BS.CONFIG.comboMax (kept local to avoid a load-order dependency)
const COMBO_MAX = 5;

function ss(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function taper(u) {
  return (0.58 + 0.42 * ss(0, 0.22, u)) * (1 - ss(0.78, 1, u) * 0.97);
}

function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ px: a.px * 0.75 + b.px * 0.25, py: a.py * 0.75 + b.py * 0.25 });
    out.push({ px: a.px * 0.25 + b.px * 0.75, py: a.py * 0.25 + b.py * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Precomputed color ramp per skin: drawBody indexes it by segment position
// instead of calling lerpColor (string alloc) for every segment every frame.
const RAMP_STEPS = 24;
const _rampCache = new Map();
function skinRamp(skin) {
  let ramp = _rampCache.get(skin.id);
  if (!ramp) {
    ramp = new Array(RAMP_STEPS);
    for (let i = 0; i < RAMP_STEPS; i++) {
      ramp[i] = lerpColor(skin.c2, skin.c1, i / (RAMP_STEPS - 1));
    }
    _rampCache.set(skin.id, ramp);
  }
  return ramp;
}

function visOffsets(min, max, size) {
  const res = [];
  const first = Math.ceil(-max / size - 1e-9);
  const last = Math.floor((size - min) / size + 1e-9);
  for (let k = first; k <= last; k++) {
    res.push(k * size);
    if (res.length >= 4) break;
  }
  if (!res.length) res.push(0);
  return res;
}

class Snake {
  constructor() {
    this.skin = SKINS[0];
    // Occupancy map: key = y * 4096 + x → count. Maintained incrementally so
    // collision/spawn checks are O(1) instead of scanning cells each time.
    // Counts (not booleans) because ghost mode may stack the body on itself.
    this.occ = new Map();
    this.reset(10, 10, { x: 1, y: 0 }, 4);
  }

  static occKey(x, y) { return y * 4096 + x; }

  _occAdd(x, y) {
    const k = Snake.occKey(x, y);
    this.occ.set(k, (this.occ.get(k) || 0) + 1);
  }

  _occRemove(x, y) {
    const k = Snake.occKey(x, y);
    const n = (this.occ.get(k) || 0) - 1;
    if (n <= 0) this.occ.delete(k); else this.occ.set(k, n);
  }

  isOccupied(x, y) {
    return this.occ.has(y * 4096 + x);
  }

  reset(cx, cy, dir, len) {
    this.dir = { x: dir.x, y: dir.y };
    this.pending = [];
    this.cells = [];
    this.path = [];
    this.occ.clear();
    for (let i = 0; i < len; i++) {
      const c = { x: cx - dir.x * i, y: cy - dir.y * i };
      this.cells.push(c);
      this.path.push({ x: c.x, y: c.y });
      this._occAdd(c.x, c.y);
    }
    this.cX = cx;
    this.cY = cy;
    this.growPending = 0;
    this.justTele = 0;
    this.impulse = 0;
    this.pulse = 0;
    this.mouth = 0;
    this.blinkT = rand(1800, 4200);
    this.blinkAnim = -1;
    this.tongueT = rand(1200, 2800);
    this.tongueAnim = -1;
  }

  get head() { return this.cells[0]; }
  get length() { return this.cells.length; }

  queueDir(d) {
    const last = this.pending.length ? this.pending[this.pending.length - 1] : this.dir;
    if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
    if (this.pending.length < 3) this.pending.push({ x: d.x, y: d.y });
  }

  grow(n) { this.growPending += n; }

  shrink(n) {
    const rem = Math.min(n, this.cells.length - 3);
    const removed = this.cells.splice(this.cells.length - rem, rem);
    for (const c of removed) this._occRemove(c.x, c.y);
    if (this.path.length > this.cells.length + 2) this.path.length = this.cells.length + 2;
    return removed;
  }

  eatPulse() { this.pulse = 1; this.impulse = Math.max(this.impulse, 0.8); }

  step(env) {
    while (this.pending.length) {
      const d = this.pending.shift();
      if (!(d.x === -this.dir.x && d.y === -this.dir.y) && !(d.x === this.dir.x && d.y === this.dir.y)) {
        this.dir = d;
        this.impulse = Math.max(this.impulse, 0.55);
        break;
      }
    }
    let nx = this.cells[0].x + this.dir.x;
    let ny = this.cells[0].y + this.dir.y;
    let teleported = false;
    let cut = false;
    this.cX += this.dir.x;
    this.cY += this.dir.y;
    if (this.justTele > 0) this.justTele--;
    const dest = env.portalAt ? env.portalAt(nx, ny) : null;
    if (dest && this.justTele === 0) {
      nx = dest.x; ny = dest.y;
      this.cX = nx; this.cY = ny;
      this.justTele = 2;
      teleported = true;
      cut = true;
    }
    if (env.wrap) {
      nx = (nx + env.cols) % env.cols;
      ny = (ny + env.rows) % env.rows;
    } else if (nx < 0 || ny < 0 || nx >= env.cols || ny >= env.rows) {
      return { death: 'wall' };
    }
    const willGrow = this.growPending > 0;
    if (!teleported) {
      // Self-collision: skipped by Ghost Phase power-up (ghost) or by Zen / daily ghosty (ghostSelf).
      if (!env.ghost && !env.ghostSelf) {
        const lim = this.cells.length - (willGrow ? 0 : 1);
        for (let i = 0; i < lim; i++) {
          const c = this.cells[i];
          if (c.x === nx && c.y === ny) return { death: 'self' };
        }
      }
      // Obstacle collision: skipped only by the Ghost Phase power-up (ghost).
      // Zen mode and the daily ghosty modifier do NOT grant obstacle immunity.
      if (!env.ghost) {
        const ob = env.blocked ? env.blocked(nx, ny) : null;
        if (ob) return { death: ob };
      }
    }

    this.cells.unshift({ x: nx, y: ny });
    this._occAdd(nx, ny);
    if (willGrow) this.growPending--;
    else {
      const tail = this.cells.pop();
      this._occRemove(tail.x, tail.y);
    }
    this.path.unshift({ x: this.cX, y: this.cY, cut });
    const maxPath = this.cells.length + 6;
    if (this.path.length > maxPath) this.path.length = maxPath;
    return { teleported };
  }

  tick(dt, mouthTarget) {
    this.impulse = Math.max(0, this.impulse - dt * 0.0035);
    this.pulse = Math.max(0, this.pulse - dt * 0.004);
    this.mouth += (mouthTarget - this.mouth) * Math.min(1, dt * 0.012);
    if (this.blinkAnim < 0) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) this.blinkAnim = 0;
    } else {
      this.blinkAnim += dt;
      if (this.blinkAnim > 260) {
        this.blinkAnim = -1;
        this.blinkT = rand(2000, 5200);
      }
    }
    if (this.tongueAnim < 0) {
      this.tongueT -= dt;
      if (this.tongueT <= 0) this.tongueAnim = 0;
    } else {
      this.tongueAnim += dt;
      if (this.tongueAnim > 340) {
        this.tongueAnim = -1;
        this.tongueT = rand(1400, 3600);
      }
    }
  }

  headPos(view, t) {
    const p0 = this.path[0];
    const p1 = this.path[1] && !this.path[1].cut ? this.path[1] : null;
    const x = p1 ? lerp(p1.x, p0.x, t) : p0.x;
    const y = p1 ? lerp(p1.y, p0.y, t) : p0.y;
    return { px: view.cx(x), py: view.cy(y) };
  }

  sampleSpine(view, t) {
    const p0 = this.path[0];
    const p1 = this.path[1];
    let hx;
    let hy;
    if (!p1 || p1.cut) {
      hx = p0.x; hy = p0.y;
    } else {
      hx = lerp(p1.x, p0.x, t);
      hy = lerp(p1.y, p0.y, t);
    }
    const total = this.cells.length;
    const raw = [{ x: hx, y: hy }];
    for (let i = 1; i < this.path.length; i++) raw.push(this.path[i]);
    const strands = [];
    let cur = [{ x: hx, y: hy }];
    let acc = 0;
    let next = SAMPLE;
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1];
      const b = raw[i];
      if (b.cut || a.cut) {
        cur.push({ x: b.x, y: b.y });
        strands.push(cur);
        cur = [];
        acc += 1;
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const seg = Math.hypot(dx, dy);
      if (seg === 0) continue;
      while (acc + seg >= next && next <= total) {
        const f = (next - acc) / seg;
        cur.push({ x: a.x + dx * f, y: a.y + dy * f });
        next += SAMPLE;
      }
      acc += seg;
      if (next > total) break;
    }
    strands.push(cur);
    const all = [];
    for (let si = 0; si < strands.length; si++) {
      const s = strands[si];
      if (s.length < 2) {
        if (si !== 0) continue;
        s.push({ x: s[0].x - this.dir.x * SAMPLE, y: s[0].y - this.dir.y * SAMPLE });
      }
      let pts = s.map(p => ({ px: view.cx(p.x), py: view.cy(p.y) }));
      if (pts.length > 150) {
        const k = Math.ceil(pts.length / 150);
        const thinned = [];
        for (let i = 0; i < pts.length; i += k) thinned.push(pts[i]);
        if (thinned[thinned.length - 1] !== pts[pts.length - 1]) thinned.push(pts[pts.length - 1]);
        pts = thinned;
      }
      all.push(chaikin(pts));
    }
    return { head: all[0], all };
  }

  render(ctx, view, t, time, state) {
    const sp = this.sampleSpine(view, t);
    const baseA = state.alpha !== undefined ? state.alpha : 1;
    const alpha = baseA * (state.ghost ? 0.66 + 0.08 * Math.sin(time * 0.008) : 1);
    const cell = view.cell;
    const hp = sp.head;
    const hdx = hp[0].px - hp[1].px;
    const hdy = hp[0].py - hp[1].py;
    const ang = (hdx !== 0 || hdy !== 0)
      ? Math.atan2(hdy, hdx)
      : Math.atan2(this.dir.y, this.dir.x);
    const headCopies = [];
    for (let si = 0; si < sp.all.length; si++) {
      const pts = sp.all[si];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        if (p.px < minX) minX = p.px;
        if (p.px > maxX) maxX = p.px;
        if (p.py < minY) minY = p.py;
        if (p.py > maxY) maxY = p.py;
      }
      const xs = visOffsets(minX, maxX, view.w);
      const ys = visOffsets(minY, maxY, view.h);
      for (const ox of xs) {
        for (const oy of ys) {
          ctx.save();
          ctx.translate(ox, oy);
          drawBody(ctx, pts, cell, this.skin, { alpha, time });
          ctx.restore();
          if (si === 0) headCopies.push([ox, oy]);
        }
      }
    }
    const headR = cell * 0.74 * 0.64 * (1 + this.pulse * 0.22);
    const hx = hp[0].px + Math.cos(ang) * cell * 0.14;
    const hy = hp[0].py + Math.sin(ang) * cell * 0.14;
    let pdx = 0;
    let pdy = 0;
    if (state.lookX !== undefined && state.lookX !== null) {
      const dx = state.lookX - hx;
      const dy = state.lookY - hy;
      const m = Math.hypot(dx, dy) || 1;
      pdx = dx / m;
      pdy = dy / m;
    }
    let blinkK = 1;
    if (this.blinkAnim >= 0) {
      const k = this.blinkAnim < 130 ? this.blinkAnim / 130 : (260 - this.blinkAnim) / 130;
      blinkK = clamp(k, 0.08, 1);
    }
    const tongueK = this.tongueAnim >= 0 ? Math.sin(Math.PI * this.tongueAnim / 340) : 0;
    for (const [ox, oy] of headCopies) {
      ctx.save();
      ctx.translate(ox, oy);
      drawHead(ctx, hx, hy, ang, headR, this.skin, {
        alpha,
        mouth: this.mouth,
        blinkK,
        pdx, pdy,
        tongueK,
        stretch: this.impulse
      });
      if (state.magnet) {
        ctx.save();
        ctx.globalAlpha = baseA * (0.3 + 0.18 * Math.sin(time * 0.008));
        ctx.strokeStyle = '#69b7ff';
        ctx.lineWidth = cell * 0.09;
        ctx.beginPath();
        ctx.arc(hx, hy, cell * (1.02 + 0.09 * Math.sin(time * 0.006)), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      if (state.combo >= 2) {
        // Combo heat aura: ring intensity scales with the multiplier
        const ck = clamp((state.combo - 1) / (COMBO_MAX - 1), 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(time * (0.006 + ck * 0.008));
        ctx.save();
        ctx.globalAlpha = baseA * (0.16 + ck * 0.3) * (0.65 + 0.35 * pulse);
        ctx.strokeStyle = state.combo >= 4 ? '#ff69b4' : '#ffd54a';
        ctx.lineWidth = cell * (0.07 + ck * 0.06);
        ctx.beginPath();
        ctx.arc(hx, hy, cell * (0.86 + 0.12 * pulse + ck * 0.14), 0, TAU);
        ctx.stroke();
        if (ck >= 1) {
          ctx.globalAlpha = baseA * (0.2 + 0.2 * pulse);
          ctx.beginPath();
          ctx.arc(hx, hy, cell * (1.24 + 0.1 * pulse), 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }
}

function segLine(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.px, a.py);
  ctx.lineTo(b.px, b.py);
  ctx.stroke();
}

function drawBody(ctx, pts, cell, skin, o) {
  const n = pts.length;
  if (n < 2) return;
  const maxW = cell * 0.74;
  const time = o.time ?? 0;
  const alpha = o.alpha ?? 1;
  const ramp = skin.banded ? null : skinRamp(skin);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.26;
  ctx.strokeStyle = '#000';
  for (let i = n - 1; i > 0; i--) {
    const u = i / (n - 1);
    ctx.lineWidth = maxW * taper(u) * 1.04;
    ctx.beginPath();
    ctx.moveTo(pts[i].px + 2, pts[i].py + 3);
    ctx.lineTo(pts[i - 1].px + 2, pts[i - 1].py + 3);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  for (let i = n - 1; i > 0; i--) {
    const u = i / (n - 1);
    const breathe = 1 + 0.03 * Math.sin(time * 0.0026 + u * 6);
    const w = maxW * taper(u) * breathe;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = w + Math.max(2, cell * 0.09);
    segLine(ctx, pts[i], pts[i - 1]);
    ctx.strokeStyle = skin.banded
      ? (Math.floor((n - i) / 4) % 2 ? skin.c1 : skin.c2)
      : ramp[Math.min(RAMP_STEPS - 1, ((1 - u) * (RAMP_STEPS - 1)) | 0)];
    ctx.lineWidth = w;
    segLine(ctx, pts[i], pts[i - 1]);
  }
  ctx.globalAlpha = alpha * 0.38;
  ctx.strokeStyle = skin.belly;
  for (let i = n - 1; i > 0; i -= 3) {
    const u = i / (n - 1);
    const w = maxW * taper(u);
    const dx = pts[i - 1].px - pts[i].px;
    const dy = pts[i - 1].py - pts[i].py;
    const segLen = Math.hypot(dx, dy) || 1;
    const nx = -dy / segLen;
    const ny = dx / segLen;
    const offset = w * 0.16;
    ctx.lineWidth = Math.max(1.5, w * 0.28);
    ctx.beginPath();
    ctx.moveTo(pts[i].px + nx * offset, pts[i].py + ny * offset);
    ctx.lineTo(pts[i - 1].px + nx * offset, pts[i - 1].py + ny * offset);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = skin.pattern;
  const step = Math.max(6, Math.round(2 * 1.15 / SAMPLE));
  for (let i = 8; i < n - 6; i += step) {
    const u = i / (n - 1);
    const s = maxW * taper(u) * 0.24;
    const ang = Math.atan2(pts[i - 1].py - pts[i + 1].py, pts[i - 1].px - pts[i + 1].px);
    ctx.save();
    ctx.translate(pts[i].px, pts[i].py);
    ctx.rotate(ang + Math.PI / 4);
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawHead(ctx, x, y, ang, R, skin, o) {
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(x, y);
  ctx.rotate(ang);
  const st = o.stretch ?? 0;
  ctx.scale(1 + st * 0.22, 1 - st * 0.13);
  ctx.lineWidth = R * 0.2;
  ctx.strokeStyle = skin.outline;
  ctx.fillStyle = skin.c1;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 1.18, R * 0.94, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin.belly;
  ctx.globalAlpha = (o.alpha ?? 1) * 0.5;
  ctx.beginPath();
  ctx.ellipse(R * 0.42, 0, R * 0.55, R * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.mouth > 0.06) {
    const mo = o.mouth;
    ctx.fillStyle = '#4a0e1e';
    ctx.beginPath();
    ctx.moveTo(R * 0.1, 0);
    ctx.lineTo(R * 1.3, -R * 0.62 * mo);
    ctx.quadraticCurveTo(R * 1.42, 0, R * 1.3, R * 0.62 * mo);
    ctx.closePath();
    ctx.fill();
    if (mo > 0.4) {
      ctx.strokeStyle = skin.tongue;
      ctx.lineWidth = R * 0.1;
      ctx.beginPath();
      ctx.moveTo(R * 0.5, 0);
      ctx.lineTo(R * 1.15, 0);
      ctx.stroke();
    }
  }
  // Rotate world gaze vector into head-relative local coordinate space
  const cosA = Math.cos(-ang);
  const sinA = Math.sin(-ang);
  const rawX = o.pdx ?? 0;
  const rawY = o.pdy ?? 0;
  const localLookX = rawX * cosA - rawY * sinA;
  const localLookY = rawX * sinA + rawY * cosA;

  for (const s of [-1, 1]) {
    const ex = R * 0.3;
    const ey = s * R * 0.5;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, o.blinkK ?? 1);
    ctx.fillStyle = '#fdfdf5';
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.pupil;
    ctx.beginPath();
    ctx.arc(localLookX * R * 0.16, localLookY * R * 0.16, R * 0.19, 0, TAU);
    ctx.fill();
    ctx.fillStyle = skin.eye;
    ctx.beginPath();
    ctx.arc(localLookX * R * 0.16 - R * 0.06, localLookY * R * 0.16 - R * 0.08, R * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = skin.outline;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(R * 0.98, s * R * 0.2, R * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (o.tongueK > 0.02 && (o.mouth ?? 0) < 0.3) {
    const len = R * 1.5 * o.tongueK;
    const tx = x + Math.cos(ang) * R * 1.15;
    const ty = y + Math.sin(ang) * R * 1.15;
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.strokeStyle = skin.tongue;
    ctx.lineWidth = R * 0.13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    const mx = tx + Math.cos(ang) * len * 0.6;
    const my = ty + Math.sin(ang) * len * 0.6;
    ctx.lineTo(mx, my);
    const fork = len * 0.4;
    ctx.lineTo(mx + Math.cos(ang - 0.4) * fork, my + Math.sin(ang - 0.4) * fork);
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + Math.cos(ang + 0.4) * fork, my + Math.sin(ang + 0.4) * fork);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSkinPreview(canvas, skin) {
  const w = 84;
  const h = 56;
  const dpr = 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const f = i / 22;
    pts.push({
      px: w - 8 - f * (w - 18),
      py: h / 2 + Math.sin(f * 5.2) * h * 0.24
    });
  }
  drawBody(ctx, pts, 17, skin, { alpha: 1, time: 800 });
  drawHead(ctx, pts[0].px + 4, pts[0].py, 0, 17 * 0.74 * 0.62, skin, {
    alpha: 1, mouth: 0.25, blinkK: 1, pdx: 0.8, pdy: 0, tongueK: 0, stretch: 0
  });
}

Object.assign(BS, { SKINS, Snake, drawBody, drawHead, drawSkinPreview });

})(window.BS);
