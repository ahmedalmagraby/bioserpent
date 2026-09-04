window.BS = window.BS || {};
(function (BS) {
"use strict";
const { View, COLS, ROWS, BASE_ROWS, clamp, rand, randi, TAU, mulberry32, GameLoop, InputManager, DIRS, Particles, SoundManager, Snake, SKINS, FoodManager, PowerUpManager, POWERUP_META, Obstacles, LEVELS, BIOMES, UIManager, CONFIG, Rival } = BS;

// Live row count for the active game (adaptive board height). Use this instead
// of the static ROWS constant anywhere the *current* playfield matters.
const liveRows = () => (view ? view.rows : BASE_ROWS);

const SAVE_KEY = 'bioSerpentSave_v1';
let _demoBlocked = null, _demoPrev = null, _demoSeen = null, _demoQueue = null, _demoFloodSeen = null, _demoFloodQueue = null;

function defaultSave() {
  return {
    best: { classic: 0, timeattack: 0, zen: 0 },
    levelBest: {},
    stars: {},
    settings: { music: 0.7, sfx: 0.9, muted: false, touch: 'auto', walls: 'solid', shake: true, flash: true, rival: false },
    daily: { key: '', best: 0, streak: 0, lastPlayed: '' },
    history: {},
    skin: 'emerald',
    seenHint: false,
    stats: { apples: 0, golden: 0, insects: 0, dragonflies: 0, powerups: 0, games: 0, maxLength: 0, topspeed: false, pacifist: false, combos: 0, nearMisses: 0, dailyPlayed: 0 },
    badges: []
  };
}

function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (_) {
    return defaultSave();
  }
  if (!raw) return defaultSave();
  let s = null;
  try {
    s = JSON.parse(raw);
  } catch (_) {
    try { localStorage.setItem(SAVE_KEY + '.corrupt', raw); } catch (_) {}
    return defaultSave();
  }
  const d = defaultSave();
  const skin = s.skin && SKINS.some(sk => sk.id === s.skin) ? s.skin : 'emerald';
  const music = typeof s.settings?.music === 'number' && Number.isFinite(s.settings.music) ? clamp(s.settings.music, 0, 1) : d.settings.music;
  const sfx = typeof s.settings?.sfx === 'number' && Number.isFinite(s.settings.sfx) ? clamp(s.settings.sfx, 0, 1) : d.settings.sfx;
  const settings = Object.assign(d.settings, s.settings || {}, { music, sfx });
  return {
    best: Object.assign(d.best, s.best),
    daily: Object.assign(d.daily, s.daily || {}),
    history: s.history || {},
    levelBest: s.levelBest || {},
    stars: s.stars || {},
    settings,
    skin,
    seenHint: !!s.seenHint,
    stats: Object.assign(d.stats, s.stats),
    badges: s.badges || []
  };
}

const BADGES = [
  { id: 'centipede', name: 'Centipede', desc: 'Reach length 30', test: s => s.stats.maxLength >= 30 },
  { id: 'fruitsalad', name: 'Fruit Salad', desc: 'Eat 100 apples total', test: s => s.stats.apples >= 100 },
  { id: 'goldenhunter', name: 'Golden Hunter', desc: 'Catch 15 golden berries', test: s => s.stats.golden >= 15 },
  { id: 'shroomlord', name: 'Shroom Lord', desc: 'Use 25 power-ups', test: s => s.stats.powerups >= 25 },
  { id: 'speeddemon', name: 'Speed Demon', desc: 'Hit top speed in Classic', test: s => !!s.stats.topspeed },
  { id: 'pacifist', name: 'Pacifist', desc: 'Finish a level eating no prey', test: s => !!s.stats.pacifist },
  { id: 'dragonflyhunter', name: 'Dragonfly Ace', desc: 'Catch 5 swift dragonflies', test: s => (s.stats.dragonflies || 0) >= 5 },
  { id: 'combomaster', name: 'Combo Master', desc: 'Hit a 5× combo multiplier', test: s => (s.stats.combos || 0) >= 5 },
  { id: 'aurora', name: 'Cosmic Traveler', desc: 'Earn 25 stars in Garden', test: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 25 },
  { id: 'daredevil', name: 'Daredevil', desc: 'Score 25 near misses', test: s => (s.stats.nearMisses || 0) >= 25 },
  { id: 'dailydevotee', name: 'Daily Devotee', desc: 'Play the Daily Challenge 7 days', test: s => (s.stats.dailyPlayed || 0) >= 7 }
];

// ---------- Daily Challenge ----------
// Deterministic per calendar day: everyone gets the same modifiers + biome.
const DAY_MS = 86400000;
function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function epochDays(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / DAY_MS);
}
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function dailySpec(key = dayKey()) {
  const rng = mulberry32(hashStr(key));
  // Pick exactly two distinct modifiers
  const pool = DAILY_MODS.slice();
  const mods = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    mods.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return { key, mods };
}
const DAILY_MODS = [
  { id: 'haste', label: 'Hasty Hatchling', desc: 'Everything moves faster', stepMul: 0.78 },
  { id: 'giant', label: 'Titan Serpent', desc: 'Each meal grows you double', growMul: 2 },
  { id: 'wrap', label: 'Portal Edges', desc: 'Walls wrap around', wrap: true },
  { id: 'ghosty', label: 'Ghost Garden', desc: 'Pass through your own tail', ghost: true },
  { id: 'frenzy', label: 'Feeding Frenzy', desc: 'Prey is twice as plentiful', insectMul: 2 }
];
function dailyModActive(id) {
  return !!(game.dailyMods && game.dailyMods.some(m => m.id === id));
}

const CAUSE_TITLE = {
  wall: 'Splat! Wall strike',
  self: 'You bit yourself!',
  rock: 'Crushed on a rock',
  bramble: 'Pricked by brambles',
  spore: 'Poisoned by spores',
  rival: 'Devoured by the rival serpent!'
};

const BIOME_ORDER = ['rainforest', 'oasis', 'cavern', 'reef'];

const DIR_VALUES = Object.values(DIRS);

let _lastBuzz = 0;
function buzz(pattern) {
  const s = game.save.settings;
  if (!s || s.muted || s.sfx === 0) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - _lastBuzz < 40) return;
  _lastBuzz = now;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch (_) {}
}

class Game {
  constructor(view, sound, ui, input) {
    this.view = view;
    this.sound = sound;
    this.ui = ui;
    this.input = input;
    this.snake = new Snake();
    this.food = new FoodManager();
    this.powerups = new PowerUpManager();
    this.obstacles = new Obstacles();
    this.particles = new Particles();
    this.save = loadSave();
    this.state = 'menu';
    this.mode = 'classic';
    this.levelIdx = -1;
    this.biomeKey = 'rainforest';
    this.biome = BIOMES.rainforest;
    this.time = 0;
    this.acc = 0;
    this.tInterp = 0;
    this.stepMs = CONFIG.stepMs.classic;
    this.burst = false;
    this.effects = { magnet: 0, slow: 0, ghost: 0, multi: 0 };
    this.taTime = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.insectTimer = 2500;
    this.hudTimer = 0;
    this.trailAcc = 0;
    this.decor = [];
    this.demoSnake = new Snake();
    this.demoFood = new FoodManager();
    this.demoAcc = 0;
    this.deathFade = 1;
    this.dissolving = false;
    this.biomeStage = 0;
    this.newBestShown = false;
    this.streakAcc = 0;
    this.run = null;
    this.startEase = 0;
    this.milestone = 0;
    this.lastLen = 0;
    this.insectCfg = {};
    this._pan = 0;
    this._lastTickSec = 91;
    this._urgent = false;
    this._lastBurstI = 0;
    this.rival = null;
    this.bgCanvas = null;
    this.bgKey = '';
    this.bgCache = new Map();   // baked backgrounds keyed per biome + size
    this.countdownTimer = 0;
    this.countdownNum = 0;
    this._nearMissCd = 0;
    this.regenDecor();
    this.resetDemo();
  }

  getModeName() {
    if (this.mode === 'classic') return '🐍 Classic Run';
    if (this.mode === 'timeattack') return '⏱ Time Attack';
    if (this.mode === 'zen') return '🪷 Zen Flow';
    if (this.mode === 'daily') return `📅 Daily Challenge · ${dayKey()}`;
    if (this.mode === 'level') {
      const lv = LEVELS[this.levelIdx];
      return `🌿 Level ${this.levelIdx + 1}: ${lv ? lv.name : ''}`;
    }
    return '';
  }


  resetDemo() {
    const dirs = Object.values(DIRS);
    const d = dirs[Math.floor(Math.random() * 4)];
    this.demoSnake.skin = SKINS[Math.floor(Math.random() * SKINS.length)];
    this.demoSnake.reset(randi(4, 15), randi(4, 15), d, 5);
    this.demoFood.reset();
    this.spawnDemoApple();
  }

  spawnDemoApple() {
    const m = CONFIG.spawnMargin || 0;
    for (let i = 0; i < 100; i++) {
      const x = randi(m, COLS - 1 - m);
      const y = randi(m, liveRows() - 1 - m);
      if (!this.demoFood.occupied(x, y) && Math.abs(this.demoSnake.head.x - x) + Math.abs(this.demoSnake.head.y - y) >= 4) {
        this.demoFood.items.push({ type: 'apple', gx: x, gy: y, age: 0, hop: 0 });
        return;
      }
    }
  }

  // Smarter menu AI: BFS shortest path to the apple (wrapping board), with a
  // flood-fill space check so the snake doesn't box itself into a pocket.
  // Falls back to greedy scoring when no safe path exists.
  demoPickDir(s, apple) {
    const R = liveRows();
    const W = COLS;
    const size = W * R;
    if (!_demoBlocked || _demoBlocked.length < size) {
      _demoBlocked = new Uint8Array(size);
      _demoPrev = new Int16Array(size);
      _demoSeen = new Uint8Array(size);
      _demoQueue = new Int32Array(size);
      _demoFloodSeen = new Uint8Array(size);
      _demoFloodQueue = new Int32Array(size);
    }
    const blocked = _demoBlocked;
    blocked.fill(0, 0, size);
    for (let i = 0; i < s.cells.length - 1; i++) { // tail cell vacates each step
      blocked[s.cells[i].y * W + s.cells[i].x] = 1;
    }
    const start = s.head.y * W + s.head.x;
    const target = apple ? apple.gy * W + apple.gx : -1;
    const prev = _demoPrev;
    prev.fill(-1, 0, size);
    const seen = _demoSeen;
    seen.fill(0, 0, size);
    seen[start] = 1;

    const q = _demoQueue;
    let qHead = 0;
    let qTail = 0;
    q[qTail++] = start;
    let found = false;
    while (qHead < qTail) {
      const cur = q[qHead++];
      if (cur === target) { found = true; break; }
      const cx2 = cur % W;
      const cy2 = Math.floor(cur / W);
      for (const d of DIR_VALUES) {
        const nx = (cx2 + d.x + W) % W;
        const ny = (cy2 + d.y + R) % R;
        const ni = ny * W + nx;
        if (seen[ni] || blocked[ni]) continue;
        seen[ni] = 1;
        prev[ni] = cur;
        q[qTail++] = ni;
      }
    }
    if (!found) return null;
    // Walk back to find the first step on the path
    let step = target;
    while (prev[step] !== start && prev[step] !== -1) step = prev[step];
    if (prev[step] === -1) return null;
    const sx = step % W;
    const sy = Math.floor(step / W);
    for (const d of DIR_VALUES) {
      if ((s.head.x + d.x + W) % W === sx && (s.head.y + d.y + R) % R === sy) {
        // Safety: don't take a path into a region smaller than our body length
        if (this.floodFillSize(sx, sy, blocked, W, R, s.cells.length) < s.cells.length) return null;
        return d;
      }
    }
    return null;
  }

  floodFillSize(x0, y0, blocked, W, R, limit = Infinity) {
    const startIdx = y0 * W + x0;
    if (blocked[startIdx]) return 0;
    const size = W * R;
    if (!_demoFloodSeen || _demoFloodSeen.length < size) {
      _demoFloodSeen = new Uint8Array(size);
      _demoFloodQueue = new Int32Array(size);
    }
    const seen = _demoFloodSeen;
    seen.fill(0, 0, size);
    seen[startIdx] = 1;
    const q = _demoFloodQueue;
    let qHead = 0;
    let qTail = 0;
    q[qTail++] = startIdx;
    let n = 0;
    while (qHead < qTail) {
      const cur = q[qHead++];
      n++;
      if (n >= limit) return n;
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (const d of DIR_VALUES) {
        const nx = (cx + d.x + W) % W;
        const ny = (cy + d.y + R) % R;
        const ni = ny * W + nx;
        if (!seen[ni] && !blocked[ni]) {
          seen[ni] = 1;
          q[qTail++] = ni;
        }
      }
    }
    return n;
  }

  updateDemo(dt) {
    this.demoAcc += dt;
    while (this.demoAcc >= CONFIG.stepMs.demo) {
      this.demoAcc -= CONFIG.stepMs.demo;
      const s = this.demoSnake;
      const apple = this.demoFood.items[0];
      const smart = this.demoPickDir(s, apple);
      if (smart) {
        s.dir = smart;
      } else {
        // Greedy fallback: keep the old heuristic behaviour
        const turns = [
          { x: s.dir.x, y: s.dir.y },
          { x: s.dir.y, y: -s.dir.x },
          { x: -s.dir.y, y: s.dir.x }
        ];
        let bestDir = null;
        let bestScore = Infinity;
        for (const d of turns) {
          const nx = (s.head.x + d.x + COLS) % COLS;
          const R = liveRows();
          const ny = (s.head.y + d.y + R) % R;
          if (s.cells.some((c, i) => i < s.cells.length - 1 && c.x === nx && c.y === ny)) continue;
          const dist = apple ? Math.abs(apple.gx - nx) + Math.abs(apple.gy - ny) : 0;
          const score = dist + (d === turns[0] ? -0.4 : 0) + Math.random() * 0.35;
          if (score < bestScore) {
            bestScore = score;
            bestDir = d;
          }
        }
        if (bestDir) s.dir = bestDir;
      }
      const res = s.step({ wrap: true, cols: COLS, rows: liveRows(), ghost: false });
      if (!res || res.death) {
        this.resetDemo();
        break;
      }
      const eaten = this.demoFood.collideCell(s.head.x, s.head.y);
      if (eaten) {
        s.grow(2);
        s.eatPulse();
        if (s.length > 16) s.shrink(6);
        this.particles.burst(this.view.cx(s.head.x), this.view.cy(s.head.y), {
          count: 8, colors: ['#e53935', '#ff8a80'], speed: 0.08, size: 1.8, life: 450
        });
        this.spawnDemoApple();
      }
    }
    const apple = this.demoFood.items[0];
    const mouthTarget = apple
      ? clamp((Math.abs(apple.gx - this.demoSnake.head.x) + Math.abs(apple.gy - this.demoSnake.head.y)) < 3 ? 1 : 0, 0, 1)
      : 0;
    this.demoSnake.tick(dt, mouthTarget);
  }

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (_) {}
  }

  sumStars() {
    return Object.values(this.save.stars).reduce((a, b) => a + b, 0);
  }

  isSkinUnlocked(id) {
    const sk = SKINS.find(s => s.id === id);
    if (!sk) return false;
    const u = sk.unlock;
    if (!u) return true;
    if (u.type === 'apples') return this.save.stats.apples >= u.value;
    if (u.type === 'classicBest') return this.save.best.classic >= u.value;
    if (u.type === 'level') return (this.save.stars[u.value] || 0) >= 1;
    if (u.type === 'stars') return this.sumStars() >= u.value;
    return false;
  }

  isLevelUnlocked(i) {
    return i === 0 || (this.save.stars[i - 1] || 0) >= 1;
  }

  checkBadges() {
    if (this.save.badges.length >= BADGES.length) return;
    for (const b of BADGES) {
      if (!this.save.badges.includes(b.id) && b.test(this.save)) {
        this.save.badges.push(b.id);
        this.persist();
        this.ui.toast(`🏅 Badge <b>${b.name}</b> unlocked!<br><small>${b.desc}</small>`, 'badge');
        this.sound.achieve();
      }
    }
  }


  isPassableCell(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= liveRows()) return false;
    if (this.obstacles.blocked(x, y)) return false;
    if (this.obstacles.portalAt(x, y)) return false;
    return true;
  }

  isFreeCell(x, y) {
    if (!this.isPassableCell(x, y)) return false;
    if (this.snake.isOccupied(x, y)) return false;
    if (this.powerups && this.powerups.occupied && this.powerups.occupied(x, y)) return false;
    const h = this.snake.head;
    if (h && Math.abs(h.x - x) + Math.abs(h.y - y) < 3) return false;
    return true;
  }

  isMagnetSafe(x, y) {
    if (!this.isPassableCell(x, y)) return false;
    if (this.snake.isOccupied(x, y)) return false;
    if (this.powerups.occupied(x, y)) return false;
    return true;
  }

  regenDecor() {
    // Guard: view must be sized before generating pixel-coordinate decor.
    // This can be called during construction before the first layout pass completes.
    if (!this.view || !this.view.w || !this.view.h) return;
    const rng = mulberry32(this.biomeKey.length * 7919 + this.biomeKey.charCodeAt(0) * 131);
    const w = this.view.w;
    const h = this.view.h;
    const d = [];
    const key = this.biomeKey;
    if (key === 'rainforest') {
      for (let i = 0; i < 10; i++) {
        const edge = rng() < 0.5;
        d.push({
          t: 'leaf', x: edge ? rng() * w * 0.22 : w - rng() * w * 0.22,
          y: rng() * h, rx: 26 + rng() * 46, ry: 10 + rng() * 18,
          rot: rng() * TAU, c: 'rgba(8,28,16,0.5)'
        });
      }
      for (let i = 0; i < 3; i++) {
        const x = w * (0.15 + i * 0.3) + rng() * 60;
        d.push({ t: 'ray', x, w: 40 + rng() * 70, c: 'rgba(190,255,170,0.05)' });
      }
    } else if (key === 'oasis') {
      d.push({ t: 'sun', x: w * 0.82, y: h * 0.16, r: Math.min(w, h) * 0.24 });
      for (let i = 0; i < 3; i++) {
        d.push({ t: 'dune', y: h * (0.72 + i * 0.1), amp: 14 + rng() * 16, c: `rgba(140,105,50,${0.14 + i * 0.04})` });
      }
      for (let i = 0; i < 5; i++) {
        d.push({ t: 'rock', x: rng() * w, y: h * (0.75 + rng() * 0.2), r: 8 + rng() * 16 });
      }
    } else if (key === 'cavern') {
      for (let i = 0; i < 12; i++) {
        const x = rng() * w;
        d.push({ t: 'stal', x, w: 14 + rng() * 26, h: 30 + rng() * 80 });
      }
      for (let i = 0; i < 8; i++) {
        d.push({
          t: 'crystal', x: rng() * w, y: h * (0.3 + rng() * 0.65),
          r: 2 + rng() * 4, ph: rng() * TAU,
          c: rng() < 0.5 ? '#6ee7f0' : '#8f7bff'
        });
      }
    } else if (key === 'reef') {
      for (let i = 0; i < 7; i++) {
        d.push({ t: 'coral', x: rng() * w, y: h - rng() * h * 0.12, r: 18 + rng() * 34, branches: 3 + Math.floor(rng() * 3) });
      }
      for (let i = 0; i < 3; i++) {
        d.push({ t: 'ray2', x: w * (0.1 + i * 0.35), w: 50 + rng() * 80, c: 'rgba(150,220,255,0.05)' });
      }
    }
    this.decor = d;
    this.bgKey = '';   // invalidate — next drawBackground blit rebuilds lazily
  }

  buildBg() {
    const v = this.view;
    const want = this.biomeKey + '|' + v.cell + '|' + v.dpr + '|' + v.rows;
    let cv = this.bgCache.get(want);
    if (cv) {
      this.bgCanvas = cv;
      this.bgKey = want;
      return;
    }
    cv = document.createElement('canvas');
    cv.width = Math.round(v.w * v.dpr);
    cv.height = Math.round(v.h * v.dpr);
    const c = cv.getContext('2d');
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, v.h);
    g.addColorStop(0, this.biome.sky[0]);
    g.addColorStop(0.55, this.biome.sky[1]);
    g.addColorStop(1, this.biome.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, v.w, v.h);
    // Checkerboard as a repeating 2x2-cell pattern tile: one fillRect instead
    // of a per-cell loop over up to ~600 rects.
    const tile = document.createElement('canvas');
    tile.width = tile.height = v.cell * 2;
    const tc = tile.getContext('2d');
    tc.fillStyle = 'rgba(255,255,255,0.02)';
    tc.fillRect(0, 0, v.cell, v.cell);
    tc.fillRect(v.cell, v.cell, v.cell, v.cell);
    c.fillStyle = c.createPattern(tile, 'repeat');
    c.fillRect(0, 0, v.w, v.h);
    for (const d of this.decor) {
      this.drawDecor(c, d, 0.55);
    }
    const vg = c.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.42, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = vg;
    c.fillRect(0, 0, v.w, v.h);

    this.bgCache.delete(want);
    this.bgCache.set(want, cv);
    if (this.bgCache.size > 4) {
      this.bgCache.delete(this.bgCache.keys().next().value);
    }
    this.bgCanvas = cv;
    this.bgKey = want;
  }

  drawDecor(c, d, crystalAlpha) {
    const v = this.view;
    if (d.t === 'leaf') {
      c.save();
      c.translate(d.x, d.y);
      c.rotate(d.rot);
      c.fillStyle = d.c;
      c.beginPath();
      c.ellipse(0, 0, d.rx, d.ry, 0, 0, TAU);
      c.fill();
      c.restore();
    } else if (d.t === 'ray') {
      c.fillStyle = d.c;
      c.beginPath();
      c.moveTo(d.x, 0);
      c.lineTo(d.x + d.w, 0);
      c.lineTo(d.x + d.w * 1.8, v.h);
      c.lineTo(d.x + d.w * 0.4, v.h);
      c.closePath();
      c.fill();
    } else if (d.t === 'sun') {
      const g = c.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      g.addColorStop(0, 'rgba(255,214,130,0.22)');
      g.addColorStop(1, 'rgba(255,214,130,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, TAU);
      c.fill();
    } else if (d.t === 'dune') {
      c.fillStyle = d.c;
      c.beginPath();
      c.moveTo(0, d.y);
      c.quadraticCurveTo(v.w * 0.25, d.y - d.amp, v.w * 0.5, d.y);
      c.quadraticCurveTo(v.w * 0.75, d.y + d.amp, v.w, d.y);
      c.lineTo(v.w, v.h);
      c.lineTo(0, v.h);
      c.closePath();
      c.fill();
    } else if (d.t === 'rock') {
      c.fillStyle = 'rgba(90,70,40,0.35)';
      c.beginPath();
      c.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, TAU);
      c.fill();
    } else if (d.t === 'stal') {
      c.fillStyle = 'rgba(16,16,44,0.85)';
      c.beginPath();
      c.moveTo(d.x - d.w / 2, 0);
      c.lineTo(d.x + d.w / 2, 0);
      c.lineTo(d.x, d.h);
      c.closePath();
      c.fill();
    } else if (d.t === 'crystal') {
      c.save();
      c.globalAlpha = crystalAlpha;
      const g = c.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 4);
      g.addColorStop(0, d.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(d.x, d.y, d.r * 4, 0, TAU);
      c.fill();
      c.restore();
    } else if (d.t === 'coral') {
      c.strokeStyle = 'rgba(12,52,66,0.85)';
      c.lineCap = 'round';
      c.lineWidth = 7;
      for (let b = 0; b < d.branches; b++) {
        const ang = -Math.PI / 2 + (b - (d.branches - 1) / 2) * 0.5;
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.quadraticCurveTo(
          d.x + Math.cos(ang) * d.r * 0.5, d.y + Math.sin(ang) * d.r * 0.6,
          d.x + Math.cos(ang) * d.r, d.y + Math.sin(ang) * d.r
        );
        c.stroke();
      }
    } else if (d.t === 'ray2') {
      c.fillStyle = d.c;
      c.beginPath();
      c.moveTo(d.x, 0);
      c.lineTo(d.x + d.w, 0);
      c.lineTo(d.x + d.w * 2.2, v.h);
      c.lineTo(d.x + d.w * 0.6, v.h);
      c.closePath();
      c.fill();
    }
  }

  onResize() {
    this.regenDecor();
    if (this.food && (this.state === 'playing' || this.state === 'countdown')) {
      const R = liveRows();
      for (let i = this.food.items.length - 1; i >= 0; i--) {
        const it = this.food.items[i];
        if (it.gy >= R || it.gx >= COLS || it.gy < 0 || it.gx < 0) {
          this.food.items.splice(i, 1);
        }
      }
      if (!this.food.items.some(i => i.type === 'apple' && i.gy < R && i.gx < COLS && i.gy >= 0 && i.gx >= 0)) {
        this.food.spawnApple((x, y) => this.isFreeCell(x, y));
      }
    }
    if (this.powerups && (this.state === 'playing' || this.state === 'countdown')) {
      const R = liveRows();
      for (let i = this.powerups.field.length - 1; i >= 0; i--) {
        const p = this.powerups.field[i];
        if (p.gy >= R || p.gx >= COLS || p.gy < 0 || p.gx < 0) {
          this.powerups.field.splice(i, 1);
        }
      }
    }
  }

  currentBest() {
    if (this.mode === 'classic') return this.save.best.classic;
    if (this.mode === 'timeattack') return this.save.best.timeattack;
    if (this.mode === 'zen') return this.save.best.zen;
    if (this.mode === 'daily') return this.save.daily.key === dayKey() ? this.save.daily.best : 0;
    return this.save.levelBest[this.levelIdx] || 0;
  }

  startRun(mode, levelIdx = -1) {
    const wasDailyActive = this.mode === 'daily' && this.run &&
      (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown');
    if (wasDailyActive) {
      this.recordDailyScore();
    }
    const wasZenActive = this.mode === 'zen' && this.run &&
      (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown');
    if (wasZenActive) {
      this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
      if (this.snake.length > this.save.best.zen) {
        this.save.best.zen = this.snake.length;
      }
      this.persist();
    }
    this.sound.unlock();
    this.ui.closeSettingsModal();
    this.ui.closeSaveModal();
    this.ui.closeGuide();
    this.mode = mode;
    this.levelIdx = levelIdx;
    const lv = mode === 'level' ? LEVELS[levelIdx] : null;
    this.dailyMods = [];
    let dailyStepMul = 1;
    if (mode === 'daily') {
      const spec = dailySpec();
      this.dailyMods = spec.mods;
      for (const m of spec.mods) {
        if (m.stepMul) dailyStepMul *= m.stepMul;
      }
    }
    const dk = { haste: '🏜️', giant: '🦣', wrap: '🌀', ghosty: '👻', frenzy: '🔥' };
    // Campaign maps are authored on a fixed 20x20 grid — lock the board square.
    this.view.forcedRows = mode === 'level' ? BASE_ROWS : null;

    // Apply active HUD and screen visibility before calculating board dimensions
    this.ui.setHUD(true);
    this.ui.showScreen(null);
    this.ui.setDpadVisible(this.input.mode === 'dpad');
    this.biomeKey = mode === 'level' ? lv.biome
      : mode === 'daily' ? ['rainforest', 'oasis', 'cavern', 'reef'][epochDays() % 4]
      : mode === 'timeattack' ? 'oasis' : mode === 'zen' ? 'reef' : 'rainforest';
    this.biome = BIOMES[this.biomeKey];
    this.regenDecor();
    this.obstacles.clear();
    let sx = 5;
    let sy = 9;
    if (lv) {
      this.obstacles.loadFromMap(lv.map);
      for (let y = 0; y < lv.map.length; y++) {
        const x = lv.map[y].indexOf('S');
        if (x >= 0) { sx = x; sy = y; break; }
      }
    }
    this.snake.skin = SKINS.find(s => s.id === this.save.skin) || SKINS[0];
    this.snake.reset(sx, sy, DIRS.right, mode === 'zen' ? 6 : 4);
    this.food.reset();
    this.powerups.reset();
    this.particles.clear();
    this.effects = { magnet: 0, slow: 0, ghost: 0, multi: 0 };
    this.stepMs = mode === 'level' ? lv.stepMs : CONFIG.stepMs[mode] || CONFIG.stepMs.classic;
    if (this.mode === 'daily') {
      this.stepMs = Math.round(this.stepMs * dailyStepMul);
      const modsHtml = this.dailyMods.map(m => `${dk[m.id] || '•'} <b>${m.label}</b> — ${m.desc}`).join('<br>');
      setTimeout(() => {
        if (this.state === 'playing' || this.state === 'countdown') {
          this.ui.toast(`📅 Today's twist:<br>${modsHtml}`, 'biome');
        }
      }, 1400);
    }
    this.acc = 0;
    this.tInterp = 0;
    this.burst = false;
    this.run = { score: 0, apples: 0, golden: 0, foodEaten: 0, insects: 0, powerups: 0, lengthMax: this.snake.length, pacifist: true, time: 0 };
    this.combo = 0;
    this.comboTimer = 0;
    this.taTime = mode === 'timeattack' ? CONFIG.taStartMs : 0;
    this.insectTimer = 2500;
    this.trailAcc = 0;
    this.startEase = mode === 'zen' ? 0 : CONFIG.easeMs;
    this.milestone = (Math.floor(this.snake.length / 10) + 2) * 10;
    this.lastLen = this.snake.length;
    this._lastBurstI = 0;
    const biomeName = this.biome.name;
    setTimeout(() => {
      if (this.state === 'playing' || this.state === 'countdown') {
        this.ui.toast(`${{ rainforest: '🌿', oasis: '🏜️', cavern: '💎', reef: '🌊' }[this.biomeKey] || '🌿'} <b>${biomeName}</b>`, 'biome');
      }
    }, 650);
    this.insectCfg = mode === 'level' ? lv.insects : mode === 'timeattack' ? { firefly: 1, beetle: 2, dragonfly: 1 } : mode === 'zen' ? { firefly: 1 } : { firefly: 1, beetle: 1, dragonfly: 1 };
    if (mode === 'daily' && this.dailyMods.some(m => m.id === 'frenzy')) {
      for (const k of Object.keys(this.insectCfg)) this.insectCfg[k] *= 2;
    }
    for (const kind of Object.keys(this.insectCfg)) {
      for (let i = 0; i < this.insectCfg[kind]; i++) {
        const spawned = this.food.spawnInsect(kind, (x, y) => this.isFreeCell(x, y));
        if (!spawned) this.food.spawnInsect(kind, (x, y) => this.isPassableCell(x, y));
      }
    }
    this.food.spawnApple((x, y) => this.isFreeCell(x, y));
    // Rival serpent (Classic only, off by default — Settings toggle)
    if (mode === 'classic' && this.save.settings.rival) {
      this.rival = new Rival();
      this.rival.reset(this.view, this.snake.cells, null, 6);
    } else {
      this.rival = null;
    }
    this.biomeStage = 0;
    this.newBestShown = false;
    this.dissolving = false;
    this.deathFade = 1;
    this._lastTickSec = 91;
    this.streakAcc = 0;
    if (this._urgent) {
      this._urgent = false;
      this.ui.setUrgent(false);
    }
    if (!this.save.seenHint) {
      this.save.seenHint = true;
      this.persist();
      const m = this.input.mode;
      const tip = m === 'dpad' ? 'D-pad steers · ⚡ holds a speed burst'
        : m === 'joystick' ? 'Drag the floating stick · second finger = speed burst'
        : m === 'swipe' ? 'Swipe anywhere to steer · second finger = speed burst'
        : 'Arrows / WASD steer · hold Shift for speed burst · Space pauses';
      setTimeout(() => this.ui.toast('🎮 ' + tip, 'hint'), 300);
    }
    
    // 3-2-1 Countdown before action starts
    this.state = 'countdown';
    this.countdownTimer = 1600;
    this.countdownNum = 3;
    this.ui.showCountdown(3);
    this.sound.startMusic(this.biome.music);
    this.sound.click();
    this.hudTimer = 999;
    this.updateHUDFrame(0);
  }

  gotoMenu() {
    this.ui.hideCountdown();
    if (this.mode === 'daily' && this.run && (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown')) {
      this.recordDailyScore();
    }
    if (this.mode === 'zen' && this.run && (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown')) {
      this.run.time = Math.max(this.run.time, 0);
      this.save.stats.games++;
      this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
      if (this.snake.length > this.save.best.zen) {
        this.save.best.zen = this.snake.length;
        this.ui.toast(`🪷 New Zen best length: <b>${this.snake.length}</b>`, 'badge');
        this.sound.achieve();
      }
      this.checkBadges();
    }
    this.state = 'menu';
    this.mode = 'classic';
    this.obstacles.clear();
    this.food.reset();
    this.powerups.reset();
    this.particles.clear();
    this.resetDemo();
    this.biomeKey = 'rainforest';
    this.biome = BIOMES.rainforest;
    this.regenDecor();
    this.ui.setHUD(false);
    this.ui.showScreen('menu');
    this.ui.setDpadVisible(false);
    this.view.resize();
    this.onResize();
    if (this._urgent) {
      this._urgent = false;
      this.ui.setUrgent(false);
    }
    this.refreshMenuStats();
    this.sound.startMusic(BIOMES.rainforest.music);
    this.persist();
  }

  refreshMenuStats() {
    const s = this.save.stats;
    const today = dayKey();
    const daily = {
      best: this.save.daily.key === today ? this.save.daily.best : 0,
      streak: this.save.daily.streak || 0,
      playedToday: this.save.daily.key === today
    };
    this.ui.updateMenuSubLabels(this.save.best, this.sumStars(), LEVELS.length * 3, { daily, badgesCount: this.save.badges.length }, this.save.skin);
    this.ui.setMenuStats(
      `🐍 Classic <b>${this.save.best.classic}</b><span>·</span>⏱ Attack <b>${this.save.best.timeattack}</b>` +
      `<span>·</span>🪷 Zen <b>${this.save.best.zen}</b><span>·</span>🍎 <b>${s.apples}</b>` +
      `<span>·</span>⭐ <b>${this.sumStars()}/${LEVELS.length * 3}</b><span>·</span>🏅 <b>${this.save.badges.length}/${BADGES.length}</b>` +
      `<span>·</span>📅 <b>${daily.streak || 0}</b>🔥`
    );
  }

  clearTransientHUD() {
    this.ui.updateHUD({ combo: null, bar: null });
    this.ui.setChips([]);
  }

  togglePause() {
    if (this.state === 'playing' || this.state === 'countdown') {
      this.state = 'paused';
      if (this.mode === 'zen' && this.run) {
        this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
        if (this.snake.length > this.save.best.zen) {
          this.save.best.zen = this.snake.length;
        }
        this.persist();
      }
      this.ui.hideCountdown();
      this.burst = false;
      if (this._lastBurstI) {
        this._lastBurstI = 0;
        this.sound.setIntensity(0);
      }
      this.clearTransientHUD();
      this.ui.showPauseStats({
        score: this.run.score,
        length: this.snake.length,
        apples: this.run.apples,
        time: Math.floor(this.run.time / 1000)
      }, this.getModeName());
      this.ui.setPauseTip(PAUSE_TIPS[Math.floor(Math.random() * PAUSE_TIPS.length)]);
      this.ui.showScreen('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hudTimer = CONFIG.hudThrottleMs;
      this.ui.showScreen(null);
    }
  }

  openSettings() {
    this.ui.syncSettings(this.save.settings);
    this.ui.openSettingsModal();
  }

  closeSettings() {
    this.ui.closeSettingsModal();
  }

  applySettings() {
    this.sound.setVolumes(this.save.settings);
    this.input.setPref(this.save.settings.touch);
    // Rival toggle: removing it despawns immediately (any state); enabling it
    // spawns whenever a Classic run exists or is starting — including from the
    // menu/pause/game-over paths, so the rival can never silently go missing.
    if (this.rival && !this.save.settings.rival) this.rival = null;
    if (!this.rival && this.save.settings.rival && this.mode === 'classic'
        && this.state !== 'menu') {
      this.rival = new Rival();
      this.rival.reset(this.view, this.snake.cells || [], null, 4);
    }
    if (this.state === 'playing' || this.state === 'countdown') {
      this.ui.setDpadVisible(this.input.mode === 'dpad');
    }
    this.view.resize();
    this.onResize();
    this.persist();
  }

  consume(kind) {
    this.combo = Math.min(CONFIG.comboMax, (this.combo || 0) + 1);
    this.comboTimer = CONFIG.comboMs;
    if (this.combo > 1) {
      this.save.stats.combos = Math.max(this.save.stats.combos || 0, this.combo);
    }
    const comboMult = this.combo > 1 ? 1 + (this.combo - 1) * CONFIG.comboStep : 1;
    const mult = (this.effects.multi > 0 ? 2 : 1) * comboMult;
    const base = kind === 'apple' ? CONFIG.gains.apple : CONFIG.gains.golden;
    const gain = Math.round(base * mult);
    this.run.score += gain;
    this.snake.grow((kind === 'apple' ? 1 : 2) * (dailyModActive('giant') ? 2 : 1));
    this.snake.eatPulse();
    if (kind === 'apple') this.run.apples++; else this.run.golden++;
    this.run.foodEaten++;
    if (kind === 'apple') this.save.stats.apples++; else this.save.stats.golden++;
    if (this.mode === 'classic') {
      const stage = Math.floor(this.run.foodEaten / 12) % BIOME_ORDER.length;
      if (stage !== this.biomeStage) {
        this.biomeStage = stage;
        this.setBiome(BIOME_ORDER[stage]);
      }
    }
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    let burstOpts;
    if (kind === 'apple') {
      burstOpts = { count: 14, colors: ['#e53935', '#ff8a80', '#ffcdd2'], speed: 0.14, size: 2.4, life: 550, grav: 0.0004 };
      let playedChime = false;
      if (this.combo > 1) {
        playedChime = this.sound.comboChime(this.combo, this._pan);
      }
      if (!playedChime) {
        this.sound.bite(this._pan);
      }
      buzz(12);
    } else {
      burstOpts = { count: 22, colors: ['#ffd54a', '#fff59d', '#ffffff'], speed: 0.17, size: 2.6, life: 750, type: 'spark' };
      if (this.save.settings.flash !== false) this.particles.flash('#ffd54a', 0.08);
      this.sound.golden(this._pan);
      if (this.combo > 1) this.sound.comboChime(this.combo, this._pan);
      buzz([16, 24, 16]);
    }
    const popColor = this.combo >= 4 ? '#ff69b4' : this.combo > 1 || mult > 1 ? '#ffd54a' : '#eaf5ec';
    const popSize = this.combo > 2 ? 18 : 15;
    this._queueEat(hx, hy, burstOpts, gain, hx, hy - this.view.cell * 0.6, popColor, popSize);
    if (this.mode === 'timeattack') {
      this.taTime += kind === 'apple' ? CONFIG.taAppleBonus : CONFIG.taGoldenBonus;
    }
    this.checkBadges();
    this.maybeNewBest();
  }

  consumeInsect(kind) {
    this.combo = Math.min(CONFIG.comboMax, (this.combo || 0) + 1);
    this.comboTimer = CONFIG.comboMs;
    if (this.combo > 1) {
      this.save.stats.combos = Math.max(this.save.stats.combos || 0, this.combo);
    }
    const comboMult = this.combo > 1 ? 1 + (this.combo - 1) * CONFIG.comboStep : 1;
    const mult = (this.effects.multi > 0 ? 2 : 1) * comboMult;
    const base = CONFIG.gains[kind] || CONFIG.gains.beetle;
    const gain = Math.round(base * mult);
    this.run.score += gain;
    this.run.insects++;
    this.run.pacifist = false;
    this.save.stats.insects++;
    if (kind === 'dragonfly') {
      this.save.stats.dragonflies = (this.save.stats.dragonflies || 0) + 1;
    }
    this.snake.grow((kind === 'dragonfly' ? 2 : 1) * (dailyModActive('giant') ? 2 : 1));
    this.snake.eatPulse();
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    let burstOpts;
    if (kind === 'dragonfly') {
      burstOpts = {
        count: 18,
        colors: ['#00f5d4', '#00b4d8', '#90e0ef', '#ffffff'],
        speed: 0.16, size: 2.5, life: 750, type: 'spark'
      };
      this.sound.dragonfly(this._pan);
    } else {
      burstOpts = {
        count: 12,
        colors: kind === 'firefly' ? ['#d4ff78', '#f0ffc4'] : ['#8d6e63', '#d7ccc8'],
        speed: 0.13, size: 2, life: 600, type: 'glow'
      };
      this.sound.insect(this._pan);
    }
    if (this.combo > 1) this.sound.comboChime(this.combo, this._pan);
    buzz(12);
    const popColor = kind === 'dragonfly' ? '#00f5d4' : '#d4ff78';
    this._queueEat(hx, hy, burstOpts, gain, hx, hy - this.view.cell * 0.6, popColor, 17);
    if (this.mode === 'timeattack') {
      this.taTime += kind === 'dragonfly' ? CONFIG.taDragonflyBonus : kind === 'beetle' ? CONFIG.taBeetleBonus : CONFIG.taFireflyBonus;
    }
    this.checkBadges();
    this.maybeNewBest();
  }

  consumeEgg() {
    const gain = CONFIG.gainsEgg;
    this.run.score += gain;
    this.run.eggs = (this.run.eggs || 0) + 1;
    this.snake.grow(dailyModActive('giant') ? 4 : 2);
    this.snake.eatPulse();
    // Egg bonus: brief magnet burst as a reward
    this.effects.magnet = Math.max(this.effects.magnet, 3000);
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    const burstOpts = {
      count: 24, colors: ['#fffdf4', '#f2e9cf', '#ffd54a', '#ffffff'], speed: 0.16, size: 2.6, life: 750, type: 'spark'
    };
    if (this.save.settings.flash !== false) this.particles.flash('#f8f4e6', 0.09);
    this.sound.golden(this._pan);
    buzz([14, 20, 14]);
    this._queueEat(hx, hy, burstOpts, gain, hx, hy - this.view.cell * 0.7, '#f2e9cf', 18);
    this.checkBadges();
    this.maybeNewBest();
  }

  _queueEat(burstX, burstY, burstOpts, gain, popX, popY, popColor, popSize) {
    this._eatsThisTick = (this._eatsThisTick || 0) + 1;
    this._tickPoints = (this._tickPoints || 0) + gain;
    if (!this._tickBurst || (burstOpts && (burstOpts.count ?? 0) > (this._tickBurst.opts?.count ?? 0))) {
      this._tickBurst = { x: burstX, y: burstY, opts: burstOpts };
    }
    this._tickPopup = { x: popX, y: popY, color: popColor, size: popSize };
    if (!this._inTick) {
      this._flushTickEats();
    }
  }

  _flushTickEats() {
    if (this._eatsThisTick > 0 && this._tickBurst && this._tickPopup) {
      this.particles.burst(this._tickBurst.x, this._tickBurst.y, this._tickBurst.opts);
      const text = '+' + this._tickPoints + (this.combo > 1 ? ` (×${this.combo})` : '');
      this.particles.popup(this._tickPopup.x, this._tickPopup.y, text, this._tickPopup.color, this._tickPopup.size);
      this._tickBurst = null;
      this._tickPopup = null;
    }
  }

  maybeNewBest() {
    if (this.newBestShown || !this.run) return;
    const best = this.currentBest();
    const metric = this.mode === 'zen' ? this.snake.length : this.run.score;
    if (best > 0 && metric > best) {
      this.newBestShown = true;
      const hx = this.view.cx(this.snake.head.x);
      const hy = this.view.cy(this.snake.head.y);
      this.particles.popup(hx, hy - this.view.cell, 'NEW BEST!', '#ffd54a', 21);
      if (this.save.settings.flash !== false) this.particles.flash('#ffd54a', 0.1);
      this.sound.star(2);
    }
  }

  setBiome(key) {
    this.biomeKey = key;
    this.biome = BIOMES[key];
    this.regenDecor();
    this.sound.startMusic(this.biome.music);
    this.ui.toast(`🌍 Entering <b>${this.biome.name}</b>`, 'biome');
    if (this.save.settings.flash !== false) this.particles.flash('#ffffff', 0.1);
  }

  activatePower(type) {
    const meta = POWERUP_META[type];
    this.run.powerups++;
    this.save.stats.powerups++;
    buzz(30);
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    this.particles.burst(hx, hy, { count: 20, colors: [meta.color, '#ffffff'], speed: 0.16, size: 2.6, life: 700, type: 'glow' });
    this.particles.popup(hx, hy - this.view.cell * 0.7, meta.label.split(' ')[0], meta.color, 15);
    this.sound.powerup(this._pan);
    if (type === 'prune') {
      const removed = this.snake.shrink(3);
      for (const c of removed) {
        this.particles.burst(this.view.cx(c.x), this.view.cy(c.y), { count: 8, colors: [meta.color, '#ffd9ef'], speed: 0.1, size: 2.2, life: 550 });
      }
      if (removed.length) {
        this.particles.popup(hx, hy + this.view.cell, '-' + removed.length + ' tail', meta.color, 14);
      }
    } else {
      this.effects[type] = meta.dur;
    }
    this.checkBadges();
  }

  die(cause) {
    this.state = 'over';
    this.dissolving = true;
    this.burst = false;
    if (this._lastBurstI) {
      this._lastBurstI = 0;
      this.sound.setIntensity(0);
    }
    this.clearTransientHUD();
    this.sound.death();
    this.sound.duck();
    buzz([60, 40, 90]);
    const causeFx = {
      wall: { shake: 8, flash: '#8ea0b5', burst: ['#9fb4c8', '#dfeaf2'] },
      self: { shake: 7, flash: '#ff8a80', burst: ['#ff8a80', '#ffcdd2'] },
      rock: { shake: 10, flash: '#b0bec5', burst: ['#90a4ae', '#cfd8dc', '#ffffff'] },
      bramble: { shake: 6, flash: '#69f0ae', burst: ['#69f0ae', '#3a6b4a', '#e05252'] },
      spore: { shake: 7, flash: '#b388ff', burst: ['#b388ff', '#7c43bd', '#e1bee7'] },
      time: { shake: 4, flash: '#ffd54a', burst: ['#ffd54a', '#fff59d'] }
    };
    const fx = causeFx[cause] || causeFx.wall;
    if (this.save.settings.shake !== false) this.particles.shake(fx.shake);
    if (this.save.settings.flash !== false) this.particles.flash(fx.flash, cause === 'rock' ? 0.34 : 0.28);
    const dsp2 = this.snake.sampleSpine(this.view, this.tInterp);
    for (const strand of dsp2.all) {
      for (let i = 0; i < strand.length; i += 3) {
        this.particles.burst(strand[i].px, strand[i].py, {
          count: 6, colors: [this.snake.skin.c1, this.snake.skin.c2, ...fx.burst],
          speed: 0.12, size: 2.4, life: 800, grav: 0.0004
        });
      }
    }
    this.finishRun(false, CAUSE_TITLE[cause] || 'Game Over', cause === 'time');
  }

  // The rival crashed on its own — dissolve it with a flourish and keep playing.
  killRival() {
    const r = this.rival;
    if (!r) return;
    this.rival = null;
    if (this.run && this.mode === 'classic') {
      this.run.score += 25;
      buzz([15, 30, 15]);
      this.particles.popup(
        this.view.cx(r.snake.head.x),
        this.view.cy(r.snake.head.y) - this.view.cell * 0.4,
        '+25', '#b388ff', 14
      );
    }
    const rsp = r.snake.sampleSpine(this.view, r.tFrac);
    for (const strand of rsp.all) {
      for (let i = 0; i < strand.length; i += 3) {
        this.particles.burst(strand[i].px, strand[i].py, {
          count: 6, colors: ['#b388ff', '#f8bbd0', '#ffffff'],
          speed: 0.12, size: 2.4, life: 800, grav: 0.0004
        });
      }
    }
    this.particles.popup(
      this.view.cx(r.snake.head.x),
      this.view.cy(r.snake.head.y) - this.view.cell,
      'RIVAL DOWN! +25', '#b388ff', 21
    );
    this.sound.rivalDown(this._pan);
    if (this.save.settings.flash !== false) this.particles.flash('#b388ff', 0.12);
    // Respawn after a short delay so the run keeps its competitor.
    // _rivalRunId is incremented here; the callback checks it to detect stale callbacks
    // that fired after the player restarted or quit.
    const spawnId = (this._rivalRunId = (this._rivalRunId || 0) + 1);
    setTimeout(() => {
      if (this._rivalRunId !== spawnId) return;   // stale: run has moved on
      if (this.save.settings.rival && !this.rival && this.mode === 'classic'
          && this.state === 'playing') {
        this.rival = new Rival();
        this.rival.reset(this.view, this.snake.cells || [], null, 5);
        const nr = this.rival.snake.head;
        this.particles.burst(this.view.cx(nr.x), this.view.cy(nr.y), {
          count: 16, colors: ['#b388ff', '#f8bbd0', '#ffffff'], speed: 0.14, size: 2.2, life: 600, type: 'glow'
        });
        this.particles.popup(this.view.cx(nr.x), this.view.cy(nr.y) - this.view.cell,
          'A new rival slithers in…', '#b388ff', 14);
      }
    }, 2600);
  }

  recordDailyScore() {
    const today = dayKey();
    const d = this.save.daily;
    if (d.key !== today) {
      // First run of a new day: extend streak only if yesterday was played
      const y = new Date();
      y.setDate(y.getDate() - 1);
      d.streak = d.lastPlayed === dayKey(y) ? (d.streak || 0) + 1 : 1;
      d.key = today;
      d.best = 0;
    }
    d.lastPlayed = today;
    const score = this.run ? this.run.score : 0;
    if (score > d.best) d.best = score;
    if (!this._dailyCountedToday) {
      this.save.stats.dailyPlayed = (this.save.stats.dailyPlayed || 0) + 1;
      this._dailyCountedToday = true;
    }
    this.checkBadges();
    this.persist();
  }

  shareResult() {
    if (!this.run) return;
    const mods = this.mode === 'daily' ? '\nModifiers: ' + this.dailyMods.map(m => m.label).join(' + ') : '';
    const text = `🐍 BioSerpent — ${this.getModeName()}\n` +
      `Score: ${this.run.score} · Length: ${this.snake.length} · Apples: ${this.run.apples}` +
      `${this.run.nearMisses ? `\nNear misses: ${this.run.nearMisses}` : ''}${mods}` +
      `\nCan you beat me?`;
    const done = () => this.ui.toast('📋 Result copied to clipboard', 'hint');
    const fail = () => this.ui.toast('⚠ Could not share result', 'warn');
    const copyFallback = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fail);
      } else {
        fail();
      }
    };
    if (navigator.share) {
      navigator.share({ text }).then(() => this.ui.toast('📤 Result shared!', 'hint')).catch(copyFallback);
    } else {
      copyFallback();
    }
  }

  finishRun(completed, title, gentle) {
    const s = this.save;
    s.stats.games++;
    s.stats.maxLength = Math.max(s.stats.maxLength, this.snake.length);
    let newBest = false;
    if (this.mode === 'classic') {
      if (this.run.score > s.best.classic) { s.best.classic = this.run.score; newBest = true; }
    } else if (this.mode === 'timeattack') {
      if (this.run.score > s.best.timeattack) { s.best.timeattack = this.run.score; newBest = true; }
    } else if (this.mode === 'zen') {
      if (this.snake.length > s.best.zen) { s.best.zen = this.snake.length; newBest = true; }
    } else if (this.mode === 'daily') {
      // recordDailyScore() (called below) is the authoritative handler for daily.best and streak.
      // Capture the newBest flag here — before recordDailyScore() can reset daily.best on a new-day boundary —
      // so the game-over NEW BEST banner still fires correctly.
      newBest = this.run.score > (s.daily.best || 0);
    } else if (this.mode === 'level') {
      const prev = s.levelBest[this.levelIdx] || 0;
      if (this.run.score > prev) { s.levelBest[this.levelIdx] = this.run.score; newBest = true; }
    }
    if (this.mode === 'daily') this.recordDailyScore();
    // Track recent scores per mode for the history sparkbars
    if (!this.save.history) this.save.history = {};
    const hkey = this.mode === 'level' ? 'level' + this.levelIdx : this.mode;
    const h = this.save.history[hkey] || (this.save.history[hkey] = []);
    h.push(this.run.score);
    if (h.length > 10) h.shift();
    this.checkBadges();
    this.persist();
    const rows = {
      title,
      mode: this.mode,
      modeName: this.getModeName(),
      score: this.run.score,
      best: this.currentBest(),
      apples: this.run.apples,
      length: this.snake.length,
      time: Math.floor(this.run.time / 1000),
      golden: this.run.golden,
      insects: this.run.insects || 0,
      powerups: this.run.powerups || 0,
      eggs: this.run.eggs || 0,
      history: (this.save.history && this.save.history[hkey]) || [],
      newBest
    };
    if (!gentle) {
      setTimeout(() => {
        if (this.state !== 'over') return;
        this.ui.gameOver(rows);
      }, 1000);
    } else {
      this.dissolving = false;
      this.sound.powerExpire();
      this.ui.gameOver(rows);
    }
  }

  completeLevel() {
    this.state = 'complete';
    this.clearTransientHUD();
    const lv = LEVELS[this.levelIdx];
    const sc = this.run.score;
    const stars = sc >= lv.stars[2] ? 3 : sc >= lv.stars[1] ? 2 : 1;
    buzz([25, 35, 25]);
    this.save.stars[this.levelIdx] = Math.max(this.save.stars[this.levelIdx] || 0, stars);
    this.save.levelBest[this.levelIdx] = Math.max(this.save.levelBest[this.levelIdx] || 0, sc);
    this.save.stats.games++;
    if (this.run.pacifist) this.save.stats.pacifist = true;
    this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
    if (!this.save.history) this.save.history = {};
    const hkey = 'level' + this.levelIdx;
    const h = this.save.history[hkey] || (this.save.history[hkey] = []);
    h.push(sc);
    if (h.length > 10) h.shift();
    this.checkBadges();
    this.persist();
    for (let i = 0; i < stars; i++) {
      setTimeout(() => this.sound.star(i), 350 + i * 280);
    }
    const cx = this.view.w / 2;
    const cy = this.view.h / 2;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.particles.burst(cx + rand(-100, 100), cy + rand(-60, 60), {
          count: 18, colors: ['#ffd54a', '#7ee08a', '#69b7ff', '#ff9ad5'],
          speed: 0.18, size: 2.6, life: 900, grav: 0.0003, type: 'spark'
        });
      }, i * 160);
    }
    const nextStarScore = stars === 1 ? lv.stars[1] : stars === 2 ? lv.stars[2] : null;
    this.ui.levelComplete({ stars, score: sc, nextStarScore, hasNext: this.levelIdx + 1 < LEVELS.length });
  }


  doStep(dt = 16) {
    const env = {
      wrap: this.mode === 'zen'
        || (this.mode === 'classic' && this.save.settings.walls === 'wrap')
        || (this.mode === 'daily' && dailyModActive('wrap')),
      cols: COLS,
      rows: liveRows(),
      ghost: this.effects.ghost > 0,
      // ghostSelf: also skip self-collision in Zen mode and with the daily 'ghosty' modifier.
      // The Ghost Phase power-up sets both flags; ghosty/Zen set only ghostSelf.
      ghostSelf: this.effects.ghost > 0 || this.mode === 'zen' || (this.mode === 'daily' && dailyModActive('ghosty')),
      blocked: (x, y) => this.obstacles.blocked(x, y),
      portalAt: (x, y) => this.obstacles.portalAt(x, y)
    };
    const res = this.snake.step(env);
    if (res.teleported) {
      const h = this.snake.head;
      this.particles.burst(this.view.cx(h.x), this.view.cy(h.y), {
        count: 16, colors: ['#48dbfb', '#ff9f43', '#ffffff'], speed: 0.15, size: 2.4, life: 600, type: 'glow'
      });
      this.sound.portal(this._pan);
      buzz(18);
    }
    if (res.death) {
      this.die(res.death);
      return;
    }
    const h = this.snake.head;
    if (this.effects.magnet > 0) {
      this.food.magnetPull(h, (x, y) => this.isMagnetSafe(x, y));
    }
    const item = this.food.collideCell(h.x, h.y);
    if (item) {
      if (item.type === 'egg') this.consumeEgg();
      else this.consume(item.type === 'apple' ? 'apple' : 'golden');
    }
    const ins = this.food.insectHit(h.x, h.y);
    if (ins) this.consumeInsect(ins.kind);
    this._pan = (this.view.cx(h.x) / this.view.w) * 2 - 1;
    const pw = this.powerups.collide(h.x, h.y);
    if (pw) this.activatePower(pw.type);
    // Player head vs rival body/head — mutual destruction
    if (this.rival && this.rival.snake.isOccupied(h.x, h.y)) {
      this.die('rival');
      return;
    }
    const newLen = this.snake.length;
    if (newLen !== this.lastLen) {
      if (this.milestone && newLen >= this.milestone) {
        const m = this.milestone;
        this.milestone += 10;
        const hx2 = this.view.cx(h.x);
        const hy2 = this.view.cy(h.y);
        this.particles.popup(hx2, hy2 - this.view.cell, m + ' LONG!', '#7ee08a', 17);
        this.sound.star(1);
        if (this.food.trySpawnGolden((x, y) => this.isFreeCell(x, y))) {
          const g = this.food.items.find(i => i.type === 'golden');
          if (g) {
            this.particles.burst(this.view.cx(g.gx), this.view.cy(g.gy), {
              count: 12, colors: ['#ffd54a', '#fff59d', '#ffffff'], speed: 0.09, size: 2, life: 600, type: 'spark'
            });
            this.particles.popup(this.view.cx(g.gx), this.view.cy(g.gy) - this.view.cell * 0.7, '✨ BONUS BERRY', '#ffd54a', 15);
          }
        }
      }
      this.lastLen = newLen;
    }
    // Near-miss: skim past a hazard without touching it for bonus points
    if (this._nearMissCd > 0) this._nearMissCd -= dt;
    if (this._nearMissCd <= 0) {
      const nd = this.obstacles.nearMissDistance(h.x, h.y);
      if (nd !== null && nd <= CONFIG.nearMissDist) {
        this._nearMissCd = CONFIG.nearMissCooldownMs;
        this.run.score += CONFIG.nearMissGain;
        this.run.nearMisses = (this.run.nearMisses || 0) + 1;
        this.save.stats.nearMisses = (this.save.stats.nearMisses || 0) + 1;
        this.sound.nearMiss(this._pan);
        const nx = this.view.cx(h.x);
        const ny = this.view.cy(h.y);
        this.particles.popup(nx, ny - this.view.cell * 0.9, '+' + CONFIG.nearMissGain + ' close!', '#48dbfb', 14);
        this.particles.burst(nx, ny, { count: 6, colors: ['#48dbfb', '#ffffff'], speed: 0.1, size: 1.6, life: 350 });
      }
    }
    if (!this.food.items.some(i => i.type === 'apple' && i.gy < liveRows() && i.gx < COLS && i.gy >= 0 && i.gx >= 0)) {
      this.food.spawnApple((x, y) => this.isFreeCell(x, y));
    }
    this.run.lengthMax = Math.max(this.run.lengthMax, this.snake.length);
    if (this.mode === 'zen') {
      this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
      if (this.snake.length > this.save.best.zen) {
        this.save.best.zen = this.snake.length;
        this.persist();
      }
    }
    if (this.mode === 'classic') {
      this.stepMs = clamp(CONFIG.stepMs.classic - this.run.foodEaten * CONFIG.speedPerApple, CONFIG.minStepMs, CONFIG.stepMs.classic);
      if (this.stepMs <= CONFIG.topSpeedMs && !this.save.stats.topspeed) {
        this.save.stats.topspeed = true;
        this.checkBadges();
      }
    }
    if (this.mode === 'level' && this.run.apples >= LEVELS[this.levelIdx].goalApples) {
      this.completeLevel();
    }
  }

  updateHUDFrame(dt) {
    this.hudTimer += dt;
    if (this.hudTimer < CONFIG.hudThrottleMs) return;
    this.hudTimer = 0;
    let stats;
    if (this.mode === 'timeattack') {
      const t = Math.max(0, this.taTime / 1000).toFixed(1);
      stats = [
        { v: t + 's', l: 'Time', icon: '⏱', cls: 'timer-stat' + (this.taTime <= CONFIG.taUrgentMs ? ' danger' : '') },
        { v: String(this.snake.length), l: 'Length', icon: '📏' }
      ];
    } else if (this.mode === 'level') {
      const goal = LEVELS[this.levelIdx].goalApples;
      stats = [
        { v: `LV ${String(this.levelIdx + 1).padStart(2, '0')}`, l: LEVELS[this.levelIdx].name, cls: 'level-badge' },
        { v: `${this.run.apples}/${goal}`, l: 'Goal', icon: '🍎', cls: 'goal-stat' },
        { v: String(this.snake.length), l: 'Length', icon: '📏' }
      ];
    } else if (this.mode === 'zen') {
      stats = [
        { v: 'Zen Flow', l: '', icon: '🪷', cls: 'biome-stat' },
        { v: String(this.snake.length), l: 'Length', icon: '📏' }
      ];
    } else {
      const speed = (CONFIG.stepMs.classic / this.stepMs).toFixed(1) + '×';
      const nextBiomeIn = 12 - (this.run.foodEaten % 12);
      const biomeIcon = this.biomeKey === 'rainforest' ? '🌿' : this.biomeKey === 'oasis' ? '☀️' : this.biomeKey === 'cavern' ? '💎' : '🌊';
      const biomeName = this.biome.name.split(' ')[0];
      stats = [
        { v: biomeName, l: `${nextBiomeIn} to shift`, icon: biomeIcon, cls: 'biome-stat ' + this.biomeKey, title: `Biome changes in ${nextBiomeIn} nourishment` },
        { v: String(this.snake.length), l: 'Length', icon: '📏' },
        { v: speed, l: 'Speed', icon: '⚡' }
      ];
    }
    let bar = null;
    if (this.mode === 'level') {
      const goal = LEVELS[this.levelIdx].goalApples;
      bar = { frac: this.run.apples / goal, color: 'var(--accent)' };
    } else if (this.mode === 'timeattack') {
      const frac = clamp(this.taTime / CONFIG.taStartMs, 0, 1);
      bar = { frac, color: this.taTime <= CONFIG.taUrgentMs ? '#ff6b6b' : 'var(--gold)' };
    } else if (this.combo >= 1 && this.comboTimer > 0) {
      const frac = clamp(this.comboTimer / CONFIG.comboMs, 0, 1);
      bar = { frac, color: this.combo >= 4 ? '#ff69b4' : 'var(--gold)' };
    }
    this.ui.updateHUD({
      score: this.run.score,
      best: this.currentBest(),
      stats,
      combo: this.combo >= 1 ? `COMBO ×${this.combo}` : null,
      bar
    });
    const chips = [];
    for (const key of ['magnet', 'slow', 'ghost', 'multi']) {
      if (this.effects[key] > 0) {
        const meta = POWERUP_META[key];
        chips.push({ key, label: meta.label.split(' ')[0], glyph: meta.short, color: meta.color, frac: this.effects[key] / meta.dur });
      }
    }
    this.ui.setChips(chips);
  }

  update(dt) {
    this._eatsThisTick = 0;
    this._tickPoints = 0;
    this._tickBurst = null;
    this._tickPopup = null;
    this._inTick = true;
    this.time += dt;
    this.particles.update(dt);
    this.particles.ambient(this.state === 'menu' || this.state === 'playing' || this.state === 'countdown' ? this.biomeKey : null, this.view.w, this.view.h, dt);
    // Rival serpent: think + move on the real frame clock, its own cadence.
    // Pace adapts to the player's speed curve so it stays threatening late-game.
    if (this.rival && this.state === 'playing') {
      const rivalPace = Math.max(CONFIG.minStepMs, Math.round(this.stepMs * 1.15));
      const rivalStep = this.rival.step(dt, {
        wrap: this.mode === 'zen'
          || (this.mode === 'classic' && this.save.settings.walls === 'wrap')
          || (this.mode === 'daily' && dailyModActive('wrap')),
        cols: COLS,
        rows: liveRows(),
        stepMs: rivalPace,
        hazardAt: (x, y) => this.obstacles.blocked(x, y),
        hazardVer: this.obstacles._ver,
        playerCells: this.snake.cells,
        target: this.food.items.find(i => i.type === 'apple') || null
      });
      if (rivalStep && rivalStep.death) this.killRival();
      // Rival eats apples, golden berries, and eggs — denies the player and grows itself
      if (this.rival && rivalStep) {
        const rh = this.rival.snake.head;
        const stolen = this.food.collideCell(rh.x, rh.y);
        if (stolen) {
          if (stolen.type === 'apple') {
            this.rival.snake.grow(1);   // same growth rate as the player
            this.rival.snake.eatPulse();
            if (this.rival.snake.length >= 13) {
              // Size cap: keep the rival a peer, not a board-filling leviathan
              this.rival.snake.growPending = 0;
            }
            this.particles.burst(this.view.cx(rh.x), this.view.cy(rh.y), {
              count: 10, colors: ['#b388ff', '#e53935', '#ff8a80'], speed: 0.1, size: 2, life: 450
            });
            this.particles.popup(this.view.cx(rh.x), this.view.cy(rh.y) - this.view.cell, 'Rival ate it!', '#b388ff', 13);
            this.sound.bite(this._pan);
            buzz(8);
            if (!this.food.items.some(i => i.type === 'apple')) {
              this.food.spawnApple((x, y) => this.isFreeCell(x, y));
            }
          } else if (stolen.type === 'golden') {
            this.rival.snake.grow(2);
            this.rival.snake.eatPulse();
            if (this.rival.snake.length >= 13) {
              this.rival.snake.growPending = 0;
            }
            this.particles.burst(this.view.cx(rh.x), this.view.cy(rh.y), {
              count: 14, colors: ['#ffd54a', '#b388ff', '#ffffff'], speed: 0.12, size: 2.2, life: 550, type: 'spark'
            });
            this.particles.popup(this.view.cx(rh.x), this.view.cy(rh.y) - this.view.cell, 'Rival stole berry! ⚡', '#ffd54a', 14);
            this.sound.bite(this._pan);
            buzz(12);
          } else if (stolen.type === 'egg') {
            this.rival.snake.grow(2);
            this.rival.snake.eatPulse();
            if (this.rival.snake.length >= 13) {
              this.rival.snake.growPending = 0;
            }
            this.particles.burst(this.view.cx(rh.x), this.view.cy(rh.y), {
              count: 14, colors: ['#f8f4e6', '#b388ff', '#d9cba8'], speed: 0.12, size: 2.2, life: 550
            });
            this.particles.popup(this.view.cx(rh.x), this.view.cy(rh.y) - this.view.cell, 'Rival poached egg! 🥚', '#f8f4e6', 14);
            this.sound.bite(this._pan);
            buzz(12);
          }
        }
      }
      if (this.rival) {
        this.rival.tick(dt, this.food.items.find(i => i.type === 'apple') || null);
      }
    }
    if (this.state === 'menu') {
      this.updateDemo(dt);
      return;
    }
    if (this.state === 'countdown') {
      this.countdownTimer -= dt;
      const step = Math.ceil(this.countdownTimer / 450);
      if (step !== this.countdownNum && step >= 0) {
        this.countdownNum = step;
        if (step > 0) {
          this.ui.showCountdown(step);
          this.sound.click();
        } else {
          this.ui.showCountdown('Go!');
          this.sound.star(0);
        }
      }
      if (this.countdownTimer <= 0) {
        this.state = 'playing';
        this.ui.hideCountdown();
      }
      return;
    }
    if (this.state === 'over' && this.dissolving && this.deathFade > 0) {
      this.deathFade = Math.max(0, this.deathFade - dt * 0.0014);
      if (Math.random() < 0.5) {
        const dsp = this.snake.sampleSpine(this.view, this.tInterp);
        const flat = dsp.all[0];
        const dp = flat[Math.floor(Math.random() * flat.length)];
        this.particles.burst(dp.px, dp.py, {
          count: 2, colors: [this.snake.skin.c1, this.snake.skin.c2, '#ff8a80'],
          speed: 0.06, size: 2, life: 600
        });
      }
    }
    if (this.state !== 'playing') return;
    for (const k of ['magnet', 'slow', 'ghost', 'multi']) {
      if (this.effects[k] > 0) {
        this.effects[k] -= dt;
        if (this.effects[k] <= 0) {
          this.effects[k] = 0;
          this.sound.powerExpire();
        }
      }
    }
    const effDt = dt * (this.effects.slow > 0 ? CONFIG.slowMul : 1);
    this.run.time += dt;

    if (this.mode === 'timeattack') {
      this.taTime -= dt;
      const wholeSec = Math.ceil(this.taTime / 1000);
      if (wholeSec !== this._lastTickSec) {
        this._lastTickSec = wholeSec;
        if (wholeSec <= 10 && wholeSec > 0) this.sound.ticktock();
      }
      if (this.taTime <= 0) {
        this.taTime = 0;
        this.state = 'over';
        this.burst = false;
        if (this._lastBurstI) {
          this._lastBurstI = 0;
          this.sound.setIntensity(0);
        }
        this.clearTransientHUD();
        this.finishRun(false, "Time's Up!", true);
        return;
      }
    }

    let easeMul = 1;
    if (this.startEase > 0) {
      this.startEase -= dt;
      easeMul = 1 + CONFIG.easeBoost * Math.max(0, this.startEase / CONFIG.easeMs);
    }
    const sms = this.stepMs * easeMul * (this.burst ? CONFIG.burstMul : 1);
    this.acc += effDt;
    let guard = 0;
    while (this.acc >= sms && guard < CONFIG.maxStepCatchup) {
      this.acc -= sms;
      guard++;
      this.doStep();
      if (this.state !== 'playing') {
        this._flushTickEats();
        this._inTick = false;
        return;
      }
    }
    this._flushTickEats();
    this._inTick = false;
    if (guard >= CONFIG.maxStepCatchup && this.acc > sms) {
      this.acc = 0;
    }
    this.tInterp = clamp(this.acc / sms, 0, 1);
    const near = this.food.getNearestItemPx(
      this.view.cx(this.snake.head.x),
      this.view.cy(this.snake.head.y),
      this.view.cell
    );
    const mouthTarget = near && near.d < this.view.cell * 2.6 ? clamp(1 - near.d / (this.view.cell * 2.6), 0, 1) : 0;
    this.snake.tick(dt, mouthTarget);
    this.food.update(effDt, { isFree: (x, y) => this.isFreeCell(x, y), view: this.view, particles: this.particles, head: this.snake.head });
    if (!this.food.items.some(i => i.type === 'apple' && i.gy < liveRows() && i.gx < COLS && i.gy >= 0 && i.gx >= 0)) {
      this.food.spawnApple((x, y) => this.isFreeCell(x, y));
    }
    this.powerups.update(effDt);
    this.obstacles.update(dt);
    this.insectTimer -= dt;
    if (this.insectTimer <= 0) {
      this.insectTimer = CONFIG.insectRespawnMs;
      for (const kind of Object.keys(this.insectCfg)) {
        const have = this.food.insects.filter(n => n.kind === kind).length;
        if (have < this.insectCfg[kind] && Math.random() < 0.5) {
          this.food.spawnInsect(kind, (x, y) => this.isFreeCell(x, y));
        }
      }
    }
    if (!this.food.items.some(i => i.type === 'golden') && Math.random() < dt * CONFIG.goldenRatePerMs) {
      if (this.food.trySpawnGolden((x, y) => this.isFreeCell(x, y))) {
        const g = this.food.items.find(i => i.type === 'golden');
        if (g) {
          this.particles.burst(this.view.cx(g.gx), this.view.cy(g.gy), {
            count: 10, colors: ['#ffd54a', '#fff59d'], speed: 0.06, size: 1.8, life: 500, type: 'spark'
          });
        }
      }
    }
    // Rare Serpent Egg spawns (not in zen — keep the calm)
    if (this.mode !== 'zen' && !this.food.items.some(i => i.type === 'egg') && Math.random() < dt * CONFIG.eggRatePerMs) {
      this.food.trySpawnEgg((x, y) => this.isFreeCell(x, y), this.particles, this.view);
    }
    if (this.powerups.field.length === 0 && Math.random() < dt * CONFIG.powerupRatePerMs) {
      this.powerups.spawn((x, y) => this.isFreeCell(x, y));
      if (this.powerups.field.length) {
        const p = this.powerups.field[this.powerups.field.length - 1];
        const meta = POWERUP_META[p.type];
        this.particles.burst(this.view.cx(p.gx), this.view.cy(p.gy), {
          count: 8, colors: [meta.color], speed: 0.05, size: 1.8, life: 450
        });
      }
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 0;
        this.combo = 0;
      }
    }
    const skin = this.snake.skin;
    if (skin.trail) {
      this.trailAcc += dt;
      if (this.trailAcc > 95) {
        this.trailAcc = 0;
        const hx = this.view.cx(this.snake.head.x);
        const hy = this.view.cy(this.snake.head.y);
        this.particles.burst(hx, hy, {
          count: 1,
          colors: skin.trail === 'glow' ? ['#6ee7f0', '#9be8f5'] : ['#ffe082', '#fff8e1'],
          speed: 0.02, minSpeed: 0.004, size: 1.8, life: 650, type: 'glow'
        });
      }
    }
    if (this.burst) {
      this.streakAcc += dt;
      if (this.streakAcc > 50) {
        this.streakAcc = 0;
        const d = this.snake.dir;
        const sxh = this.view.cx(this.snake.head.x) - d.x * this.view.cell * 0.55;
        const syh = this.view.cy(this.snake.head.y) - d.y * this.view.cell * 0.55;
        this.particles.burst(sxh, syh, {
          count: 1, colors: ['#ffffff', '#7ee08a'],
          speed: 0.06, minSpeed: 0.03,
          angle: Math.atan2(-d.y, -d.x), spread: 0.6,
          size: 1.4, life: 260
        });
      }
    }
    const burstI = (this.burst || this.combo >= CONFIG.comboMax) ? 1 : 0;
    if (burstI !== this._lastBurstI) {
      this._lastBurstI = burstI;
      this.sound.setIntensity(burstI);
    }
    const urgent = this.mode === 'timeattack' && this.taTime <= CONFIG.taUrgentMs;
    if (urgent !== this._urgent) {
      this._urgent = urgent;
      this.ui.setUrgent(urgent);
    }
    this.updateHUDFrame(dt);
  }

  drawBackground(ctx) {
    const v = this.view;
    const want = this.biomeKey + '|' + v.cell + '|' + v.dpr + '|' + v.rows;
    if (this.bgKey !== want) this.buildBg();
    ctx.drawImage(this.bgCanvas, 0, 0, this.view.w, this.view.h);
    // Solid walls get a subtle glowing rail so the deadly boundary is readable
    const wrapOn = this.mode === 'zen'
      || (this.mode === 'classic' && this.save.settings.walls === 'wrap')
      || (this.mode === 'daily' && dailyModActive('wrap'));
    if (!wrapOn && this.state !== 'menu') {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.002);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 107, 107, ${0.22 + pulse * 0.16})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, v.w - 3, v.h - 3);
      ctx.restore();
    }
  }

  render() {
    const ctx = this.view.ctx;
    const v = this.view;
    ctx.clearRect(0, 0, v.w, v.h);
    ctx.save();
    ctx.translate(this.particles.shakeX, this.particles.shakeY);
    this.drawBackground(ctx);
    this.obstacles.render(ctx, v, this.time);
    this.powerups.render(ctx, v, this.time);
    this.food.render(ctx, v, this.time);
    if (this.state === 'menu') {
      const dt2 = clamp(this.demoAcc / CONFIG.stepMs.demo, 0, 1);
      const dh = this.demoSnake.headPos(v, dt2);
      const dnear = this.demoFood.getNearestItemPx(dh.px, dh.py, v.cell);
      this.demoFood.render(ctx, v, this.time);
      this.demoSnake.render(ctx, v, dt2, this.time, {
        ghost: false,
        lookX: dnear ? dnear.x : null,
        lookY: dnear ? dnear.y : null
      });
    }
    const inGame = this.state === 'playing' || this.state === 'countdown' || this.state === 'paused' || this.state === 'over' || this.state === 'complete';
    if (inGame) {
      let lookX = null;
      let lookY = null;
      const hp = this.snake.headPos(v, this.tInterp);
      const wx = ((hp.px % v.w) + v.w) % v.w;
      const wy = ((hp.py % v.h) + v.h) % v.h;
      const near = this.food.getNearestItemPx(wx, wy, v.cell);
      if (near && near.d < v.cell * 8) {
        lookX = near.x;
        lookY = near.y;
      }
      this.snake.render(ctx, v, this.tInterp, this.time, {
        ghost: this.effects.ghost > 0,
        lookX, lookY,
        alpha: this.dissolving ? this.deathFade : 1,
        magnet: this.effects.magnet > 0,
        combo: this.combo
      });
    }
    if (inGame && this.rival) {
      this.rival.render(ctx, v, this.time,
        this.food.items.find(i => i.type === 'apple') || null);
    }
    this.particles.render(ctx);
    ctx.restore();
    this.particles.renderFlash(ctx, v.w, v.h);
  }
}

// Rotating tips shown on the pause screen
const PAUSE_TIPS = [
  '💡 Near misses pay: skim past rocks and brambles for +5.',
  '🥚 Eggs hatch into golden berries — but catching them first pays more.',
  '🔥 Chain food within 3.8s to stack up to a 5× combo.',
  '✨ Every 10 growth spawns a guaranteed bonus berry.',
  '⚡ Hold Shift (or the ⚡ button) for a burst of speed.',
  '📅 The Daily Challenge changes every day — keep your streak alive!',
  '🧲 Magnet Spores drag nearby fruit straight to your jaws.'
];

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const view = new View(canvas, stage);
const sound = new SoundManager();
Object.assign(BS, { view, sound });

const game = new Game(view, sound, null, null);

const ui = new UIManager({
  onClick() { sound.unlock(); sound.click(); },
  onClassic() { game.startRun('classic'); },
  onLevels() {
    ui.buildLevels(
      LEVELS,
      i => game.isLevelUnlocked(i),
      i => game.save.stars[i] || 0,
      i => game.save.levelBest[i] || 0
    );
    ui.showScreen('levels');
  },
  onContinueGarden() {
    let target = 0;
    for (let i = 0; i < LEVELS.length; i++) {
      if (game.isLevelUnlocked(i)) {
        target = i;
        if ((game.save.stars[i] || 0) < 3) break;
      }
    }
    game.startRun('level', target);
  },
  onOpenBadges() {
    ui.buildBadges(BADGES, id => game.save.badges.includes(id), game.save);
    ui.showScreen('badges');
  },
  onTimeAttack() { game.startRun('timeattack'); },
  onZen() { game.startRun('zen'); },
  onDaily() { game.startRun('daily'); },
  onShareResult() { game.shareResult(); },
  onSkins() {
    ui.buildSkins(id => game.isSkinUnlocked(id), game.save.skin, game.save);
    ui.showScreen('skins');
  },
  onOpenSettings() { game.openSettings(); },
  onCloseSettings() { game.closeSettings(); },
  onBack(target) {
    if (target === 'menu') game.refreshMenuStats();
    ui.showScreen(target);
  },
  onSelectLevel(i) { game.startRun('level', i); },
  onSelectSkin(id) {
    game.save.skin = id;
    game.persist();
    ui.buildSkins(sid => game.isSkinUnlocked(sid), game.save.skin, game.save);
    game.refreshMenuStats();
    ui.toast(`🐍 Skin selected: <b>${SKINS.find(s => s.id === id).name}</b>`, 'hint');
  },
  onPauseButton() { game.togglePause(); },
  onResume() { game.togglePause(); },
  onRestart() {
    if (game.mode === 'zen' && game.run && (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown')) {
      game.save.stats.games++;
      game.save.stats.maxLength = Math.max(game.save.stats.maxLength, game.snake.length);
      if (game.snake.length > game.save.best.zen) {
        game.save.best.zen = game.snake.length;
        game.persist();
      }
      game.checkBadges();
    }
    game.startRun(game.mode, game.levelIdx);
  },
  onQuit() { game.gotoMenu(); },
  onNextLevel() { game.startRun('level', game.levelIdx + 1); },
  onResetProgress() {
    game.save = defaultSave();
    game.persist();
    game.applySettings();
    game.refreshMenuStats();
    ui.toast('🗑 Progress reset', 'warn');
  },
  onSettingsChange(patch) {
    Object.assign(game.save.settings, patch);
    game.applySettings();
  },
  onPreviewSound(type) {
    sound.unlock();
    sound.sliderPreview(type);
  },
  onBurstHint() {
    ui.toast('⚡ Second finger = <b>speed burst</b>', 'hint');
  },
  onExportSave() {
    const data = JSON.stringify(game.save, null, 2);
    ui.openSaveModal(data, true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(data).then(() => ui.toast('💾 Save copied to clipboard', 'hint')).catch(() => {});
    }
  },
  onImportSave() {
    ui.openSaveModal('', false);
  },
  onSaveModalCopy() {
    const val = ui.el.saveJsonArea ? ui.el.saveJsonArea.value : '';
    if (val && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(() => ui.toast('📋 Copied to clipboard', 'hint'));
    } else {
      ui.toast('📋 Select text to copy', 'hint');
    }
  },
  onSaveModalDownload() {
    const val = (ui.el.saveJsonArea && ui.el.saveJsonArea.value) || JSON.stringify(game.save, null, 2);
    const blob = new Blob([val], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bioserpent-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ui.toast('💾 File downloaded', 'hint');
  },
  onSaveModalApplyImport(txt) {
    if (!txt || !txt.trim()) {
      ui.toast('⚠ Please paste JSON first', 'warn');
      return;
    }
    try {
      const obj = JSON.parse(txt);
      if (!obj || typeof obj !== 'object' || !obj.best || !obj.settings) throw new Error('shape');
      const d = defaultSave();
      const skin = obj.skin && SKINS.some(sk => sk.id === obj.skin) ? obj.skin : 'emerald';
      const music = typeof obj.settings?.music === 'number' && Number.isFinite(obj.settings.music) ? clamp(obj.settings.music, 0, 1) : d.settings.music;
      const sfx = typeof obj.settings?.sfx === 'number' && Number.isFinite(obj.settings.sfx) ? clamp(obj.settings.sfx, 0, 1) : d.settings.sfx;
      const settings = Object.assign(d.settings, obj.settings || {}, { music, sfx });
      game.save = {
        best: Object.assign(d.best, obj.best),
        daily: Object.assign(d.daily, obj.daily || {}),
        history: obj.history || {},
        levelBest: obj.levelBest || {},
        stars: obj.stars || {},
        settings,
        skin,
        seenHint: !!obj.seenHint,
        stats: Object.assign(d.stats, obj.stats),
        badges: Array.isArray(obj.badges) ? obj.badges : []
      };
      game.persist();
      game.applySettings();
      ui.syncSettings(game.save.settings);
      game.refreshMenuStats();
      ui.closeSaveModal();
      ui.toast('💾 Save imported successfully', 'hint');
    } catch (_) {
      ui.toast('⚠ Invalid save data', 'warn');
    }
  }
});

game.ui = ui;

const input = new InputManager(stage, {
  onDir(dir) {
    if (game.state === 'playing') game.snake.queueDir(DIRS[dir]);
  },
  onPause() {
    if (game.state === 'playing' || game.state === 'paused') game.togglePause();
  },
  onGuideKey() {
    if (ui.isGuideOpen()) {
      ui.closeGuide();
    } else {
      if (game.state === 'playing') game.togglePause();
      ui.openGuide();
    }
  },
  onEscape() {
    if (ui.isSaveModalOpen()) {
      ui.closeSaveModal();
      return;
    }
    if (ui.isGuideOpen()) {
      ui.closeGuide();
      return;
    }
    if (ui.isSettingsOpen()) {
      game.closeSettings();
      return;
    }
    if (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown') {
      game.togglePause();
      return;
    }
    if (game.state === 'menu' && ui.isScreenOpen()) {
      game.refreshMenuStats();
      ui.showScreen('menu');
    }
  },
  onMute() {
    game.save.settings.muted = !game.save.settings.muted;
    game.applySettings();
    ui.syncSettings(game.save.settings);
    ui.toast(game.save.settings.muted ? '🔇 Muted (M)' : '🔊 Sound on (M)', 'hint');
  },
  onRestartKey() {
    if (game.state === 'over' || game.state === 'paused') {
      if (game.mode === 'zen' && game.run && game.state === 'paused') {
        game.save.stats.games++;
        game.save.stats.maxLength = Math.max(game.save.stats.maxLength, game.snake.length);
        if (game.snake.length > game.save.best.zen) {
          game.save.best.zen = game.snake.length;
          game.persist();
        }
        game.checkBadges();
      }
      ui.toast('↻ Restarted', 'hint');
      game.startRun(game.mode, game.levelIdx);
    }
  },
  onConfirm() {
    if (ui.isSaveModalOpen() || ui.isGuideOpen() || ui.isSettingsOpen()) return;
    if (game.state === 'menu') {
      if (!ui.isScreenOpen()) game.startRun('classic');
    } else if (game.state === 'over') {
      game.startRun(game.mode, game.levelIdx);
    } else if (game.state === 'complete') {
      if (game.levelIdx + 1 < LEVELS.length) game.startRun('level', game.levelIdx + 1);
      else game.gotoMenu();
    } else if (game.state === 'paused') {
      game.togglePause();
    }
  },
  onBurst(active) {
    game.burst = active && game.state === 'playing';
  },
  onGamepad(connected) {
    ui.toast(connected ? '🎮 Gamepad connected' : '🎮 Gamepad disconnected', 'hint');
  }
});

game.input = input;
input.attach();
input.bindDPad(document.getElementById('dpad'));
game.applySettings();
game.refreshMenuStats();

const loop = new GameLoop(dt => {
  input.pollGamepad();
  game.update(dt);
}, () => game.render());
loop.start();

let _rzT = null;
window.addEventListener('resize', () => {
  view.resize();
  clearTimeout(_rzT);
  _rzT = setTimeout(() => game.onResize(), 150);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.mode === 'zen' && game.run && (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown')) {
      game.save.stats.maxLength = Math.max(game.save.stats.maxLength, game.snake.length);
      if (game.snake.length > game.save.best.zen) {
        game.save.best.zen = game.snake.length;
      }
      game.persist();
    }
    if (game.state === 'playing' || game.state === 'countdown') game.togglePause();
    sound.setSuspended(true);
  } else {
    sound.setSuspended(false);
  }
});

window.addEventListener('blur', () => {
  if (game.mode === 'zen' && game.run && (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown')) {
    game.save.stats.maxLength = Math.max(game.save.stats.maxLength, game.snake.length);
    if (game.snake.length > game.save.best.zen) {
      game.save.best.zen = game.snake.length;
    }
    game.persist();
  }
  if (game.state === 'playing' || game.state === 'countdown') game.togglePause();
});

window.addEventListener('beforeunload', () => {
  if (game.mode === 'zen' && game.run && (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown')) {
    game.save.stats.maxLength = Math.max(game.save.stats.maxLength, game.snake.length);
    if (game.snake.length > game.save.best.zen) {
      game.save.best.zen = game.snake.length;
    }
    game.persist();
  }
});

const unlockOnce = () => {
  sound.unlock();
  if (game.state === 'menu') sound.startMusic(BIOMES.rainforest.music);
};
window.addEventListener('pointerdown', unlockOnce, { once: true });
window.addEventListener('keydown', unlockOnce, { once: true });

Object.assign(BS, { game, ui, input, view, sound });
})(window.BS);

