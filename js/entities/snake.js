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
const BODY_LOD_PTS = 120;
// Mirrors BS.CONFIG.comboMax (kept local to avoid a load-order dependency)
const COMBO_MAX = 5;
const MOUTH_MAX = 1.25;
const BITE_MS = 260;
const JAW_HINGE = -0.1;
const GUM = '#e26d8c';

function ss(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function taper(u) {
  return (0.58 + 0.42 * ss(0, 0.22, u)) * (1 - ss(0.78, 1, u) * 0.97);
}

function chaikin(pts) {
  const len = pts.length;
  if (len < 3) return pts;
  const out = [pts[0]];
  for (let i = 0; i < len - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const prev = i > 0 ? pts[i - 1] : null;
    const next = i < len - 2 ? pts[i + 2] : null;
    const straightBefore = prev && Math.abs((b.px - a.px) * (a.py - prev.py) - (b.py - a.py) * (a.px - prev.px)) < 0.1 && ((b.px - a.px) * (a.px - prev.px) + (b.py - a.py) * (a.py - prev.py)) > 0;
    const straightAfter = next && Math.abs((next.px - b.px) * (b.py - a.py) - (next.py - b.py) * (b.px - a.px)) < 0.1 && ((next.px - b.px) * (b.px - a.px) + (next.py - b.py) * (b.py - a.py)) > 0;

    if (straightBefore && straightAfter) {
      out.push(b);
    } else {
      out.push({ px: a.px * 0.75 + b.px * 0.25, py: a.py * 0.75 + b.py * 0.25 });
      out.push({ px: a.px * 0.25 + b.px * 0.75, py: a.py * 0.25 + b.py * 0.75 });
    }
  }
  out.push(pts[len - 1]);
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

  rebuildOcc() {
    this.occ.clear();
    for (const c of this.cells) {
      this._occAdd(c.x, c.y);
    }
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
    this.mouthVel = 0;
    this.biteT = 0;
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
    const rem = Math.max(0, Math.min(n, this.cells.length - 3));
    const removed = this.cells.splice(this.cells.length - rem, rem);
    for (const c of removed) this._occRemove(c.x, c.y);
    if (this.path.length > this.cells.length + 2) this.path.length = this.cells.length + 2;
    return removed;
  }

  eatPulse() {
    this.pulse = 1;
    this.impulse = Math.max(this.impulse, 0.8);
    this.biteT = BITE_MS;
    this.mouthVel = Math.min(this.mouthVel, -0.006);
  }

  // 0..1 squash curve peaking as the jaws snap shut after an eat.
  biteK() {
    const e = BITE_MS - this.biteT;
    return this.biteT > 0 && e < 140 ? Math.sin(Math.PI * e / 140) : 0;
  }

  step(env) {
    while (this.pending.length) {
      const d = this.pending.shift();
      if (!(d.x === -this.dir.x && d.y === -this.dir.y) && !(d.x === this.dir.x && d.y === this.dir.y)) {
        this.dir = d;
        this.impulse = Math.max(this.impulse, 0.55);
        break;
      }
    }
    // Nothing below is committed until the move is known to be survivable, so
    // a fatal result leaves the snake exactly as it was (crash forgiveness and
    // the Molt Shield rely on being able to hold the snake in place).
    let nx = this.cells[0].x + this.dir.x;
    let ny = this.cells[0].y + this.dir.y;
    let teleported = false;
    let cut = false;
    let cX = this.cX + this.dir.x;
    let cY = this.cY + this.dir.y;
    let justTele = this.justTele > 0 ? this.justTele - 1 : 0;
    const dest = env.portalAt ? env.portalAt(nx, ny) : null;
    if (dest && justTele === 0) {
      nx = dest.x; ny = dest.y;
      cX = nx; cY = ny;
      justTele = 2;
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
    // Self-collision: skipped by Ghost Phase power-up (ghost) or by Zen / daily ghosty (ghostSelf).
    if (!env.ghost && !env.ghostSelf && this.isOccupied(nx, ny)) {
      if (willGrow) return { death: 'self' };
      const tail = this.cells[this.cells.length - 1];
      if (nx !== tail.x || ny !== tail.y || (this.occ.get(Snake.occKey(nx, ny)) || 0) > 1) {
        return { death: 'self' };
      }
    }
    // Obstacle collision: skipped only by the Ghost Phase power-up (ghost).
    // Zen mode and the daily ghosty modifier do NOT grant obstacle immunity.
    if (!env.ghost) {
      const ob = env.blocked ? env.blocked(nx, ny) : null;
      if (ob) return { death: ob };
    }

    this.cX = cX;
    this.cY = cY;
    this.justTele = justTele;
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

  tick(dt, mouthTarget, mouthKind) {
    this.impulse = Math.max(0, this.impulse - dt * 0.0035);
    this.pulse = Math.max(0, this.pulse - dt * 0.004);
    this._tickMouth(dt, mouthTarget, mouthKind);
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

  // Damped spring: slow, slightly overshooting gape; fast snap shut that
  // bounces off closed. During a bite the target is held shut, then a small
  // reflex re-open, before following the approach target again.
  _tickMouth(dt, target, kind) {
    if (kind === 'golden' || kind === 'egg') target *= 1.2;
    else if (kind === 'insect') target *= 0.3;
    if (this.biteT > 0) {
      this.biteT = Math.max(0, this.biteT - dt);
      const e = BITE_MS - this.biteT;
      target = e < 90 ? 0 : e < 190 ? 0.3 : target;
    }
    let left = Math.min(dt, 100);
    while (left > 0) {
      const h = Math.min(16, left);
      left -= h;
      // Small settles around the target keep the soft spring so the gape overshoots.
      const closing = target < this.mouth - 0.2;
      const w = this.biteT > 0 ? 0.05 : closing ? 0.032 : 0.011;
      const z = this.biteT > 0 ? 0.45 : closing ? 0.75 : 0.5;
      this.mouthVel += (w * w * (target - this.mouth) - 2 * z * w * this.mouthVel) * h;
      this.mouth += this.mouthVel * h;
      if (this.mouth < 0) {
        this.mouth = 0;
        this.mouthVel *= -0.35;
      } else if (this.mouth > MOUTH_MAX) {
        this.mouth = MOUTH_MAX;
        this.mouthVel = 0;
      }
    }
    // Insects get tasted, not gulped: flick the tongue while one is close.
    if (kind === 'insect' && target > 0.05 && this.tongueAnim < 0) {
      this.tongueT = Math.min(this.tongueT, 90);
    }
  }

  headPos(view, t) {
    const p0 = this.path[0];
    if (p0 && p0.cut) {
      return { px: view.cx(p0.x), py: view.cy(p0.y) };
    }
    const p1 = this.path[1] || null;
    const x = p1 ? lerp(p1.x, p0.x, t) : p0.x;
    const y = p1 ? lerp(p1.y, p0.y, t) : p0.y;
    return { px: view.cx(x), py: view.cy(y) };
  }

  sampleSpine(view, t) {
    const p0 = this.path[0];
    const p1 = this.path[1];
    let hx;
    let hy;
    if (!p1 || (p0 && p0.cut)) {
      hx = p0.x; hy = p0.y;
    } else {
      hx = lerp(p1.x, p0.x, t);
      hy = lerp(p1.y, p0.y, t);
    }
    const total = this.cells.length;
    const raw = [{ x: hx, y: hy, cut: !!(p0 && p0.cut) }];
    for (let i = 1; i < this.path.length; i++) raw.push(this.path[i]);
    const strands = [];
    let cur = [{ px: view.cx(hx), py: view.cy(hy) }];
    let acc = 0;
    let next = SAMPLE;
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1];
      const b = raw[i];
      if (a.cut) {
        if (cur.length > 0) strands.push(cur);
        cur = [{ px: view.cx(b.x), py: view.cy(b.y) }];
        acc += 1;
        next += 1;
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const seg = Math.hypot(dx, dy);
      if (seg === 0) continue;
      while (acc + seg >= next && next <= total) {
        const f = (next - acc) / seg;
        cur.push({ px: view.cx(a.x + dx * f), py: view.cy(a.y + dy * f) });
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
        s.push({ px: s[0].px - this.dir.x * SAMPLE * view.cell, py: s[0].py - this.dir.y * SAMPLE * view.cell });
      }
      let pts = s;
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
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.px < minX) minX = p.px;
        if (p.px > maxX) maxX = p.px;
        if (p.py < minY) minY = p.py;
        if (p.py > maxY) maxY = p.py;
      }
      const xs = visOffsets(minX, maxX, view.w);
      const ys = visOffsets(minY, maxY, view.h);
      if (xs.length === 1 && xs[0] === 0 && ys.length === 1 && ys[0] === 0) {
        drawBody(ctx, pts, cell, this.skin, { alpha, time });
        if (si === 0) headCopies.push([0, 0]);
      } else {
        for (let xi = 0; xi < xs.length; xi++) {
          const ox = xs[xi];
          for (let yi = 0; yi < ys.length; yi++) {
            const oy = ys[yi];
            if (ox === 0 && oy === 0) {
              drawBody(ctx, pts, cell, this.skin, { alpha, time });
            } else {
              ctx.translate(ox, oy);
              drawBody(ctx, pts, cell, this.skin, { alpha, time });
              ctx.translate(-ox, -oy);
            }
            if (si === 0) headCopies.push([ox, oy]);
          }
        }
      }
    }
    const headR = cell * 0.74 * 0.64 * (1 + this.pulse * 0.22);
    const hx = hp[0].px + Math.cos(ang) * cell * 0.14;
    const hy = hp[0].py + Math.sin(ang) * cell * 0.14;
    const w = view.w;
    const h = view.h;
    const lookHx = w ? ((hx % w) + w) % w : hx;
    const lookHy = h ? ((hy % h) + h) % h : hy;
    let pdx = 0;
    let pdy = 0;
    if (state.lookX !== undefined && state.lookX !== null) {
      let dx = state.lookX - lookHx;
      let dy = state.lookY - lookHy;
      if (w && h) {
        if (Math.abs(dx) > w / 2) dx -= Math.sign(dx) * w;
        if (Math.abs(dy) > h / 2) dy -= Math.sign(dy) * h;
      }
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

    // Precalculate aura parameters once outside headCopies loop
    let magnetAlpha = 0, magnetR1 = 0, magnetR2 = 0, magnetW = 0, magnetPhase = 0;
    if (state.magnet) {
      magnetAlpha = baseA * (0.32 + 0.16 * Math.sin(time * 0.008));
      magnetR1 = cell * (0.95 + 0.08 * Math.sin(time * 0.006));
      magnetR2 = cell * (1.25 + 0.12 * Math.sin(time * 0.005 + 1));
      magnetW = cell * 0.08;
      magnetPhase = time * 0.003;
    }

    let comboAlpha1 = 0, comboR1 = 0, comboW = 0, comboStroke = '', comboAlpha2 = 0, comboR2 = 0;
    const hasCombo = state.combo >= 2;
    if (hasCombo) {
      const ck = clamp((state.combo - 1) / (COMBO_MAX - 1), 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(time * (0.006 + ck * 0.008));
      comboAlpha1 = baseA * (0.16 + ck * 0.3) * (0.65 + 0.35 * pulse);
      comboStroke = state.combo >= 4 ? '#ff69b4' : '#ffd54a';
      comboW = cell * (0.07 + ck * 0.06);
      comboR1 = cell * (0.86 + 0.12 * pulse + ck * 0.14);
      if (ck >= 1) {
        comboAlpha2 = baseA * (0.2 + 0.2 * pulse);
        comboR2 = cell * (1.24 + 0.1 * pulse);
      }
    }

    for (let ci = 0; ci < headCopies.length; ci++) {
      const [ox, oy] = headCopies[ci];
      ctx.save();
      ctx.translate(ox, oy);
      drawHead(ctx, hx, hy, ang, headR, this.skin, {
        alpha,
        mouth: this.mouth,
        blinkK,
        pdx, pdy,
        tongueK,
        stretch: this.impulse,
        bite: this.biteK(),
        time
      });
      if (state.magnet) {
        ctx.save();
        ctx.strokeStyle = '#69b7ff';
        ctx.lineWidth = magnetW;
        ctx.lineCap = 'round';
        ctx.globalAlpha = magnetAlpha * 0.85;
        ctx.beginPath();
        ctx.arc(hx, hy, magnetR1, 0, TAU);
        ctx.stroke();

        ctx.globalAlpha = magnetAlpha * 0.55;
        ctx.beginPath();
        ctx.arc(hx, hy, magnetR2, magnetPhase, magnetPhase + Math.PI * 0.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, magnetR2, magnetPhase + Math.PI, magnetPhase + Math.PI * 1.75);
        ctx.stroke();
        ctx.restore();
      }
      if (state.shield) {
        // Slowly turning hexagon: reads as "armoured" and never as a timer ring
        const sr = cell * 0.82;
        const rot = time * 0.0012;
        ctx.save();
        ctx.globalAlpha = baseA * (0.55 + 0.2 * Math.sin(time * 0.005));
        ctx.strokeStyle = '#7cf2b5';
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = rot + k * (TAU / 6);
          if (k === 0) ctx.moveTo(hx + Math.cos(a) * sr, hy + Math.sin(a) * sr);
          else ctx.lineTo(hx + Math.cos(a) * sr, hy + Math.sin(a) * sr);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      if (hasCombo) {
        ctx.globalAlpha = comboAlpha1;
        ctx.strokeStyle = comboStroke;
        ctx.lineWidth = comboW;
        ctx.beginPath();
        ctx.arc(hx, hy, comboR1, 0, TAU);
        ctx.stroke();
        if (comboAlpha2 > 0) {
          ctx.globalAlpha = comboAlpha2;
          ctx.beginPath();
          ctx.arc(hx, hy, comboR2, 0, TAU);
          ctx.stroke();
        }
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

function polyLine(ctx, pts, from, to) {
  ctx.beginPath();
  ctx.moveTo(pts[from].px, pts[from].py);
  for (let j = from - 1; j >= to; j--) ctx.lineTo(pts[j].px, pts[j].py);
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
  const chunk = 4;
  for (let i = n - 1; i > 0; i -= chunk) {
    const u = i / (n - 1);
    ctx.lineWidth = maxW * taper(u) * 1.04;
    ctx.beginPath();
    ctx.moveTo(pts[i].px + 2, pts[i].py + 3);
    const end = Math.max(0, i - chunk);
    for (let j = i - 1; j >= end; j--) {
      ctx.lineTo(pts[j].px + 2, pts[j].py + 3);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  // Two strokes per spine segment is the dominant per-frame cost; past
  // BODY_LOD_PTS points, stroke short polylines instead so long snakes
  // (and their wrap copies) stay within a fixed draw-call budget.
  const stride = n > BODY_LOD_PTS ? Math.ceil(n / BODY_LOD_PTS) : 1;
  for (let i = n - 1; i > 0; i -= stride) {
    const end = Math.max(0, i - stride);
    const u = i / (n - 1);
    const breathe = 1 + 0.03 * Math.sin(time * 0.0026 + u * 6);
    const w = maxW * taper(u) * breathe;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = w + Math.max(2, cell * 0.09);
    if (stride === 1) segLine(ctx, pts[i], pts[end]);
    else polyLine(ctx, pts, i, end);
    ctx.strokeStyle = skin.banded
      ? (Math.floor((n - i) / 4) % 2 ? skin.c1 : skin.c2)
      : ramp[Math.min(RAMP_STEPS - 1, ((1 - u) * (RAMP_STEPS - 1)) | 0)];
    ctx.lineWidth = w;
    if (stride === 1) segLine(ctx, pts[i], pts[end]);
    else polyLine(ctx, pts, i, end);
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
  ctx.beginPath();
  let hasDiamonds = false;
  for (let i = 8; i < n - 6; i += step) {
    const u = i / (n - 1);
    const s = maxW * taper(u) * 0.24;
    const ang = Math.atan2(pts[i - 1].py - pts[i + 1].py, pts[i - 1].px - pts[i + 1].px);
    const d = s * 1.4142;
    const ca = Math.cos(ang) * d;
    const sa = Math.sin(ang) * d;
    const px = pts[i].px;
    const py = pts[i].py;
    ctx.moveTo(px + ca, py + sa);
    ctx.lineTo(px - sa, py + ca);
    ctx.lineTo(px - ca, py - sa);
    ctx.lineTo(px + sa, py - ca);
    ctx.closePath();
    hasDiamonds = true;
  }
  if (hasDiamonds) ctx.fill();
  ctx.restore();
}

function drawHead(ctx, x, y, ang, R, skin, o) {
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.translate(x, y);
  ctx.rotate(ang);
  const st = o.stretch ?? 0;
  const bite = o.bite ?? 0;
  ctx.scale((1 + st * 0.22) * (1 - bite * 0.1), (1 - st * 0.13) * (1 + bite * 0.12));
  const alpha = o.alpha ?? 1;
  const mo = o.mouth ?? 0;
  const rx = R * 1.18;
  const ry = R * 0.94;
  // Each side of the head is a jaw pivoting on a hinge behind the eyes.
  const ga = mo > 0.04 ? mo * 0.4 : 0;
  const hx = R * JAW_HINGE;
  ctx.lineWidth = R * 0.2;
  ctx.strokeStyle = skin.outline;
  if (!ga) {
    ctx.fillStyle = skin.c1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.belly;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.ellipse(R * 0.42, 0, R * 0.55, R * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
  } else {
    drawJaws(ctx, R, rx, ry, hx, ga, mo, skin, alpha, o.time ?? 0);
  }
  // Rotate world gaze vector into head-relative local coordinate space
  const cosA = Math.cos(-ang);
  const sinA = Math.sin(-ang);
  const rawX = o.pdx ?? 0;
  const rawY = o.pdy ?? 0;
  const localLookX = rawX * cosA - rawY * sinA;
  const localLookY = rawX * sinA + rawY * cosA;

  for (const s of [-1, 1]) {
    // Eyes ride half the jaw swing so they spread without leaving the skull.
    const [ex, ey] = rotAbout(R * 0.3, s * R * 0.5, hx, s * ga * 0.5);
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
    const [nx, ny] = rotAbout(R * 0.98, s * R * 0.2, hx, s * ga);
    ctx.beginPath();
    ctx.arc(nx, ny, R * 0.05, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (o.tongueK > 0.02 && mo < 0.3) {
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

function rotAbout(px, py, hx, a) {
  if (!a) return [px, py];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = px - hx;
  return [hx + dx * c - py * s, dx * s + py * c];
}

// Open-mouth head, in head-local space (+x forward). Draw order: throat,
// tongue, the two jaws (with gums and fangs), then the static skull cap
// that hides the jaws' back ends around the hinge.
function drawJaws(ctx, R, rx, ry, hx, ga, mo, skin, alpha, time) {
  const reach = rx - hx;
  const tipX = hx + reach * Math.cos(ga);
  const tipY = reach * Math.sin(ga);
  const throat = ctx.createRadialGradient(hx, 0, 0, hx, 0, reach);
  throat.addColorStop(0, '#1e040d');
  throat.addColorStop(0.6, '#4a0e1e');
  throat.addColorStop(1, '#7a2038');
  ctx.fillStyle = throat;
  ctx.beginPath();
  ctx.moveTo(hx, 0);
  ctx.lineTo(tipX, -tipY);
  ctx.quadraticCurveTo(tipX + R * 0.1, 0, tipX, tipY);
  ctx.closePath();
  ctx.fill();

  if (mo > 0.35) {
    const tk = clamp((mo - 0.35) / 0.4, 0, 1);
    const wig = Math.sin(time * 0.025) * R * 0.07 * tk;
    const bx = hx + R * 0.25;
    const mx = bx + R * 0.65 * tk;
    const fork = R * 0.18 * tk;
    ctx.strokeStyle = skin.tongue;
    ctx.lineWidth = R * 0.11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.quadraticCurveTo((bx + mx) / 2, -wig * 0.5, mx, wig);
    ctx.lineTo(mx + fork, wig - fork * 0.55);
    ctx.moveTo(mx, wig);
    ctx.lineTo(mx + fork, wig + fork * 0.55);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  const lipK = clamp(mo * 4, 0, 1);
  const fangK = clamp((mo - 0.3) / 0.3, 0, 1);
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(hx, 0);
    ctx.rotate(s * ga);
    ctx.translate(-hx, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(hx, s < 0 ? -ry * 1.3 : 0, rx * 2, ry * 1.3);
    ctx.clip();
    ctx.fillStyle = skin.c1;
    ctx.strokeStyle = skin.outline;
    ctx.lineWidth = R * 0.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.belly;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.ellipse(R * 0.42, 0, R * 0.55, R * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha * lipK;
    ctx.strokeStyle = GUM;
    ctx.lineWidth = R * 0.16;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(rx, 0);
    ctx.stroke();
    ctx.restore();
    if (fangK > 0) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fdfdf5';
      ctx.strokeStyle = skin.outline;
      ctx.lineWidth = R * 0.05;
      ctx.beginPath();
      ctx.moveTo(R * 0.6, 0);
      ctx.lineTo(R * 0.84, 0);
      ctx.lineTo(R * 0.74, -s * R * 0.26 * fangK);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-rx * 1.5, -ry * 1.5, hx + rx * 1.5, ry * 3);
  ctx.clip();
  ctx.fillStyle = skin.c1;
  ctx.lineWidth = R * 0.2;
  ctx.strokeStyle = skin.outline;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin.belly;
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.ellipse(R * 0.42, 0, R * 0.55, R * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;
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
    alpha: 1, mouth: 0, blinkK: 1, pdx: 0.8, pdy: 0, tongueK: 0, stretch: 0
  });
}

Object.assign(BS, { SKINS, Snake, drawBody, drawHead, drawSkinPreview });

})(window.BS);
