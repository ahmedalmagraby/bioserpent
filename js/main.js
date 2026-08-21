window.BS = window.BS || {};
(function (BS) {
"use strict";
const { View, COLS, ROWS, clamp, rand, randi, TAU, mulberry32, GameLoop, InputManager, DIRS, Particles, SoundManager, Snake, SKINS, FoodManager, PowerUpManager, POWERUP_META, Obstacles, LEVELS, BIOMES, UIManager } = BS;

"use strict";

const SAVE_KEY = 'bioSerpentSave_v1';

function defaultSave() {
  return {
    best: { classic: 0, timeattack: 0, zen: 0 },
    levelBest: {},
    stars: {},
    settings: { music: 0.7, sfx: 0.9, muted: false, touch: 'auto', walls: 'solid' },
    skin: 'emerald',
    seenHint: false,
    stats: { apples: 0, golden: 0, insects: 0, powerups: 0, games: 0, maxLength: 0, topspeed: false, pacifist: false },
    badges: []
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    const d = defaultSave();
    return {
      best: Object.assign(d.best, s.best),
      levelBest: s.levelBest || {},
      stars: s.stars || {},
      settings: Object.assign(d.settings, s.settings),
      skin: s.skin || 'emerald',
      seenHint: !!s.seenHint,
      stats: Object.assign(d.stats, s.stats),
      badges: s.badges || []
    };
  } catch (_) {
    return defaultSave();
  }
}

const BADGES = [
  { id: 'centipede', name: 'Centipede', desc: 'Reach length 30', test: s => s.stats.maxLength >= 30 },
  { id: 'fruitsalad', name: 'Fruit Salad', desc: 'Eat 100 apples total', test: s => s.stats.apples >= 100 },
  { id: 'goldenhunter', name: 'Golden Hunter', desc: 'Catch 15 golden berries', test: s => s.stats.golden >= 15 },
  { id: 'shroomlord', name: 'Shroom Lord', desc: 'Use 25 power-ups', test: s => s.stats.powerups >= 25 },
  { id: 'speeddemon', name: 'Speed Demon', desc: 'Hit top speed in Classic', test: s => !!s.stats.topspeed },
  { id: 'pacifist', name: 'Pacifist', desc: 'Finish a level eating no prey', test: s => !!s.stats.pacifist }
];

const CAUSE_TITLE = {
  wall: 'Splat! Wall strike',
  self: 'You bit yourself!',
  rock: 'Crushed on a rock',
  bramble: 'Pricked by brambles',
  spore: 'Poisoned by spores'
};

const BIOME_ORDER = ['rainforest', 'oasis', 'cavern', 'reef'];

function buzz(pattern) {
  const s = game.save.settings;
  if (!s || s.muted || s.sfx === 0) return;
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
    this.stepMs = 145;
    this.burst = false;
    this.effects = { magnet: 0, slow: 0, ghost: 0, multi: 0 };
    this.taTime = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.insectTimer = 2500;
    this.hudTimer = 0;
    this.trailAcc = 0;
    this.decor = [];
    this.vignette = null;
    this.bgGrad = null;
    this.demoSnake = new Snake();
    this.demoFood = new FoodManager();
    this.demoAcc = 0;
    this.deathFade = 1;
    this.dissolving = false;
    this.biomeStage = 0;
    this.newBestShown = false;
    this.streakAcc = 0;
    this._lastTickSec = 91;
    this._urgent = false;
    this._lastBurstI = 0;
    this.bgCanvas = null;
    this.regenDecor();
    this.resetDemo();
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
    for (let i = 0; i < 100; i++) {
      const x = randi(0, COLS - 1);
      const y = randi(0, ROWS - 1);
      if (!this.demoFood.occupied(x, y) && Math.abs(this.demoSnake.head.x - x) + Math.abs(this.demoSnake.head.y - y) >= 4) {
        this.demoFood.items.push({ type: 'apple', gx: x, gy: y, age: 0, hop: 0 });
        return;
      }
    }
  }

  updateDemo(dt) {
    this.demoAcc += dt;
    while (this.demoAcc >= 135) {
      this.demoAcc -= 135;
      const s = this.demoSnake;
      const apple = this.demoFood.items[0];
      const turns = [
        { x: s.dir.x, y: s.dir.y },
        { x: s.dir.y, y: -s.dir.x },
        { x: -s.dir.y, y: s.dir.x }
      ];
      let bestDir = null;
      let bestScore = Infinity;
      for (const d of turns) {
        const nx = (s.head.x + d.x + COLS) % COLS;
        const ny = (s.head.y + d.y + ROWS) % ROWS;
        if (s.cells.some((c, i) => i < s.cells.length - 1 && c.x === nx && c.y === ny)) continue;
        const dist = apple ? Math.abs(apple.gx - nx) + Math.abs(apple.gy - ny) : 0;
        const score = dist + (d === turns[0] ? -0.4 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestDir = d;
        }
      }
      if (bestDir) s.dir = bestDir;
      const res = s.step({ wrap: true, cols: COLS, rows: ROWS, ghost: false });
      if (res.death || !res) {
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
    for (const b of BADGES) {
      if (!this.save.badges.includes(b.id) && b.test(this.save)) {
        this.save.badges.push(b.id);
        this.persist();
        this.ui.toast(`🏅 Badge <b>${b.name}</b> unlocked!<br><small>${b.desc}</small>`);
        this.sound.achieve();
      }
    }
  }

  isFreeCell(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    if (this.obstacles.blocked(x, y)) return false;
    if (this.obstacles.portalAt(x, y)) return false;
    if (this.snake.cells.some(c => c.x === x && c.y === y)) return false;
    const h = this.snake.head;
    if (Math.abs(h.x - x) + Math.abs(h.y - y) < 3) return false;
    return true;
  }

  regenDecor() {
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
    this.buildBg();
  }

  buildBg() {
    const v = this.view;
    if (!this.bgCanvas) this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = Math.round(v.w * v.dpr);
    this.bgCanvas.height = Math.round(v.h * v.dpr);
    const c = this.bgCanvas.getContext('2d');
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, v.h);
    g.addColorStop(0, this.biome.sky[0]);
    g.addColorStop(0.55, this.biome.sky[1]);
    g.addColorStop(1, this.biome.sky[2]);
    c.fillStyle = g;
    c.fillRect(0, 0, v.w, v.h);
    c.fillStyle = 'rgba(255,255,255,0.02)';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) c.fillRect(x * v.cell, y * v.cell, v.cell, v.cell);
      }
    }
    for (const d of this.decor) {
      this.drawDecor(c, d, 0.55);
    }
    const vg = c.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.42, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = vg;
    c.fillRect(0, 0, v.w, v.h);
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
  }

  currentBest() {
    if (this.mode === 'classic') return this.save.best.classic;
    if (this.mode === 'timeattack') return this.save.best.timeattack;
    if (this.mode === 'zen') return this.save.best.zen;
    return this.save.levelBest[this.levelIdx] || 0;
  }

  startRun(mode, levelIdx = -1) {
    this.sound.unlock();
    this.mode = mode;
    this.levelIdx = levelIdx;
    const lv = mode === 'level' ? LEVELS[levelIdx] : null;
    this.biomeKey = mode === 'level' ? lv.biome : mode === 'timeattack' ? 'oasis' : mode === 'zen' ? 'reef' : 'rainforest';
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
    this.stepMs = mode === 'level' ? lv.stepMs : mode === 'timeattack' ? 125 : mode === 'zen' ? 165 : 145;
    this.acc = 0;
    this.tInterp = 0;
    this.burst = false;
    this.run = { score: 0, apples: 0, golden: 0, insects: 0, powerups: 0, lengthMax: this.snake.length, pacifist: true, time: 0 };
    this.combo = 0;
    this.comboTimer = 0;
    this.taTime = mode === 'timeattack' ? 90000 : 0;
    this.insectTimer = 2500;
    this.trailAcc = 0;
    this.startEase = mode === 'zen' ? 0 : 700;
    this.milestone = (Math.floor(this.snake.length / 10) + 2) * 10;
    this.lastLen = this.snake.length;
    this._lastBurstI = 0;
    const biomeName = this.biome.name;
    setTimeout(() => {
      if (this.state === 'playing') this.ui.toast(`${{ rainforest: '🌿', oasis: '🏜️', cavern: '💎', reef: '🌊' }[this.biomeKey] || '🌿'} <b>${biomeName}</b>`);
    }, 650);
    this.insectCfg = mode === 'level' ? lv.insects : mode === 'timeattack' ? { firefly: 1, beetle: 2 } : mode === 'zen' ? { firefly: 1 } : { firefly: 1, beetle: 1 };
    for (const kind of Object.keys(this.insectCfg)) {
      for (let i = 0; i < this.insectCfg[kind]; i++) this.food.spawnInsect(kind, (x, y) => this.isFreeCell(x, y));
    }
    this.food.spawnApple((x, y) => this.isFreeCell(x, y));
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
      setTimeout(() => this.ui.toast(`🎮 ${tip}`), 300);
    }
    this.state = 'playing';
    this.ui.setHUD(true);
    this.ui.showScreen(null);
    this.ui.setDpadVisible(this.input.mode === 'dpad');
    this.sound.startMusic(this.biome.music);
    this.hudTimer = 999;
    this.updateHUDFrame(0);
  }

  gotoMenu() {
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
    this.ui.setMenuStats(
      `🐍 Classic <b>${this.save.best.classic}</b><span>·</span>⏱ Attack <b>${this.save.best.timeattack}</b>` +
      `<span>·</span>🪷 Zen <b>${this.save.best.zen}</b><span>·</span>🍎 <b>${s.apples}</b>` +
      `<span>·</span>⭐ <b>${this.sumStars()}/${LEVELS.length * 3}</b><span>·</span>🏅 <b>${this.save.badges.length}/${BADGES.length}</b>`
    );
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.burst = false;
      this.ui.showPauseStats({
        score: this.run.score,
        length: this.snake.length,
        apples: this.run.apples,
        time: Math.floor(this.run.time / 1000)
      });
      this.ui.showScreen('pause');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.showScreen(null);
    }
  }

  openSettings() {
    this.ui.syncSettings(this.save.settings);
    document.getElementById('modal-settings').classList.remove('hidden');
  }

  closeSettings() {
    document.getElementById('modal-settings').classList.add('hidden');
  }

  applySettings() {
    this.sound.setVolumes(this.save.settings);
    this.input.setPref(this.save.settings.touch);
    if (this.state === 'playing') this.ui.setDpadVisible(this.input.mode === 'dpad');
    this.persist();
  }

  consume(kind) {
    const mult = (this.effects.multi > 0 ? 2 : 1) * (this.mode === 'timeattack' ? Math.max(1, this.combo) : 1);
    const base = kind === 'apple' ? 10 : 50;
    const gain = base * Math.max(1, mult);
    this.run.score += gain;
    this.snake.grow(kind === 'apple' ? 1 : 2);
    this.snake.eatPulse();
    this.run.apples++;
    if (kind === 'golden') this.run.golden++;
    if (kind === 'apple') this.save.stats.apples++; else this.save.stats.golden++;
    if (this.mode === 'classic') {
      const stage = Math.floor(this.run.apples / 12) % BIOME_ORDER.length;
      if (stage !== this.biomeStage) {
        this.biomeStage = stage;
        this.setBiome(BIOME_ORDER[stage]);
      }
    }
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    if (kind === 'apple') {
      this.particles.burst(hx, hy, { count: 14, colors: ['#e53935', '#ff8a80', '#ffcdd2'], speed: 0.14, size: 2.4, life: 550, grav: 0.0004 });
      this.sound.bite(this._pan);
      buzz(12);
    } else {
      this.particles.burst(hx, hy, { count: 22, colors: ['#ffd54a', '#fff59d', '#ffffff'], speed: 0.17, size: 2.6, life: 750, type: 'spark' });
      this.particles.flash('#ffd54a', 0.08);
      this.sound.golden(this._pan);
      buzz([16, 24, 16]);
    }
    this.particles.popup(hx, hy - this.view.cell * 0.6, '+' + gain, mult > 1 ? '#ffd54a' : '#eaf5ec', mult > 1 ? 19 : 15);
    if (this.mode === 'timeattack') {
      this.taTime += kind === 'apple' ? 3000 : 6000;
      this.combo = Math.min(5, this.combo + 1);
      this.comboTimer = 4000;
    }
    this.checkBadges();
    this.maybeNewBest(gain);
  }

  consumeInsect(kind) {
    const mult = (this.effects.multi > 0 ? 2 : 1) * (this.mode === 'timeattack' ? Math.max(1, this.combo) : 1);
    const gain = (kind === 'firefly' ? 30 : 40) * Math.max(1, mult);
    this.run.score += gain;
    this.run.insects++;
    this.run.pacifist = false;
    this.save.stats.insects++;
    this.snake.grow(1);
    this.snake.eatPulse();
    const hx = this.view.cx(this.snake.head.x);
    const hy = this.view.cy(this.snake.head.y);
    this.particles.burst(hx, hy, {
      count: 12,
      colors: kind === 'firefly' ? ['#d4ff78', '#f0ffc4'] : ['#8d6e63', '#d7ccc8'],
      speed: 0.13, size: 2, life: 600, type: 'glow'
    });
    this.particles.popup(hx, hy - this.view.cell * 0.6, '+' + gain, '#d4ff78', 16);
    this.sound.insect(this._pan);
    buzz(10);
    if (this.mode === 'timeattack') {
      this.taTime += 5000;
      this.combo = Math.min(5, this.combo + 1);
      this.comboTimer = 4000;
    }
  }

  maybeNewBest() {
    if (this.newBestShown || !this.run) return;
    const best = this.mode === 'classic' ? this.save.best.classic
      : this.mode === 'timeattack' ? this.save.best.timeattack : 0;
    if (best > 0 && this.run.score > best) {
      this.newBestShown = true;
      const hx = this.view.cx(this.snake.head.x);
      const hy = this.view.cy(this.snake.head.y);
      this.particles.popup(hx, hy - this.view.cell, 'NEW BEST!', '#ffd54a', 21);
      this.particles.flash('#ffd54a', 0.1);
      this.sound.star(2);
    }
  }

  setBiome(key) {
    this.biomeKey = key;
    this.biome = BIOMES[key];
    this.regenDecor();
    this.bgGrad = null;
    this.sound.startMusic(this.biome.music);
    this.ui.toast(`🌍 Entering <b>${this.biome.name}</b>`);
    this.particles.flash('#ffffff', 0.1);
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
      this.particles.popup(hx, hy + this.view.cell, '-' + removed.length + ' tail', meta.color, 14);
    } else {
      this.effects[type] = meta.dur;
    }
    this.checkBadges();
  }

  die(cause) {
    this.state = 'over';
    this.dissolving = true;
    this.sound.death();
    this.sound.duck();
    buzz([60, 40, 90]);
    this.particles.shake(7);
    this.particles.flash('#ff5252', 0.3);
    const dsp2 = this.snake.sampleSpine(this.view, this.tInterp);
    for (const strand of dsp2.all) {
      for (let i = 0; i < strand.length; i += 3) {
        this.particles.burst(strand[i].px, strand[i].py, {
          count: 6, colors: [this.snake.skin.c1, this.snake.skin.c2, '#ff8a80'],
          speed: 0.12, size: 2.4, life: 800, grav: 0.0004
        });
      }
    }
    this.finishRun(false, CAUSE_TITLE[cause] || 'Game Over', cause === 'time');
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
    } else if (this.mode === 'level') {
      const prev = s.levelBest[this.levelIdx] || 0;
      if (this.run.score > prev) { s.levelBest[this.levelIdx] = this.run.score; newBest = true; }
    }
    this.persist();
    const rows = {
      title,
      score: this.run.score,
      best: this.currentBest(),
      apples: this.run.apples,
      length: this.snake.length,
      time: Math.floor(this.run.time / 1000),
      golden: this.run.golden,
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
    const lv = LEVELS[this.levelIdx];
    const sc = this.run.score;
    const stars = sc >= lv.stars[2] ? 3 : sc >= lv.stars[1] ? 2 : 1;
    buzz([25, 35, 25]);
    this.save.stars[this.levelIdx] = Math.max(this.save.stars[this.levelIdx] || 0, stars);
    if (this.run.pacifist) this.save.stats.pacifist = true;
    this.save.stats.maxLength = Math.max(this.save.stats.maxLength, this.snake.length);
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
    this.ui.levelComplete({ stars, score: sc, hasNext: this.levelIdx + 1 < LEVELS.length });
  }

  doStep() {
    const env = {
      wrap: this.mode === 'zen' || (this.mode === 'classic' && this.save.settings.walls === 'wrap'),
      cols: COLS,
      rows: ROWS,
      ghost: this.effects.ghost > 0 || this.mode === 'zen',
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
    if (this.effects.magnet > 0) this.food.magnetPull(h, (x, y) => this.isFreeCell(x, y));
    const item = this.food.collideCell(h.x, h.y);
    if (item) this.consume(item.type === 'apple' ? 'apple' : 'golden');
    const ins = this.food.insectHit(this.view.cx(h.x), this.view.cy(h.y), this.view.cell);
    if (ins) this.consumeInsect(ins.kind);
    this._pan = (this.view.cx(h.x) / this.view.w) * 2 - 1;
    const pw = this.powerups.collide(h.x, h.y);
    if (pw) this.activatePower(pw.type);
    const newLen = this.snake.length;
    if (newLen !== this.lastLen) {
      if (this.milestone && newLen >= this.milestone) {
        const m = this.milestone;
        this.milestone += 10;
        const hx2 = this.view.cx(h.x);
        const hy2 = this.view.cy(h.y);
        this.particles.popup(hx2, hy2 - this.view.cell, m + ' LONG!', '#7ee08a', 17);
        this.sound.star(1);
      }
      this.lastLen = newLen;
    }
    if (!this.food.items.some(i => i.type === 'apple')) {
      this.food.spawnApple((x, y) => this.isFreeCell(x, y));
    }
    this.run.lengthMax = Math.max(this.run.lengthMax, this.snake.length);
    if (this.mode === 'classic') {
      this.stepMs = clamp(145 - this.run.apples * 2.1, 68, 145);
      if (this.stepMs <= 80 && !this.save.stats.topspeed) {
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
    if (this.hudTimer < 110) return;
    this.hudTimer = 0;
    let stats;
    if (this.mode === 'timeattack') {
      const t = Math.max(0, this.taTime / 1000).toFixed(1);
      stats = [{ v: t, l: 'Time', cls: this.taTime <= 10000 ? 'danger' : '' }];
    } else if (this.mode === 'level') {
      const goal = LEVELS[this.levelIdx].goalApples;
      stats = [
        { v: this.run.apples + '/' + goal, l: 'Goal' },
        { v: String(this.snake.length), l: 'Length' }
      ];
    } else if (this.mode === 'zen') {
      stats = [{ v: String(this.snake.length), l: 'Length' }];
    } else {
      const speed = (145 / this.stepMs).toFixed(1) + '×';
      stats = [
        { v: String(this.snake.length), l: 'Length' },
        { v: String(this.run.apples), l: 'Apples' },
        { v: speed, l: 'Speed' }
      ];
    }
    let bar = null;
    if (this.mode === 'level') {
      const goal = LEVELS[this.levelIdx].goalApples;
      bar = { frac: this.run.apples / goal, color: 'var(--accent)' };
    } else if (this.mode === 'timeattack') {
      const frac = clamp(this.taTime / 90000, 0, 1);
      bar = { frac, color: this.taTime <= 10000 ? '#ff6b6b' : 'var(--gold)' };
    }
    this.ui.updateHUD({
      score: this.run.score,
      best: this.currentBest(),
      stats,
      combo: this.mode === 'timeattack' && this.combo > 1 ? `COMBO ×${this.combo}` : null,
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
    this.time += dt;
    this.particles.update(dt);
    this.particles.ambient(this.state === 'menu' || this.state === 'playing' ? this.biomeKey : null, this.view.w, this.view.h, dt);
    if (this.state === 'menu') {
      this.updateDemo(dt);
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
    const effDt = dt * (this.effects.slow > 0 ? 0.5 : 1);
    this.run.time += dt;
    let easeMul = 1;
    if (this.startEase > 0) {
      this.startEase -= dt;
      easeMul = 1 + 0.7 * Math.max(0, this.startEase / 700);
    }
    const sms = this.stepMs * easeMul * (this.burst ? 0.55 : 1);
    this.acc += effDt;
    let guard = 0;
    while (this.acc >= sms && guard < 4) {
      this.acc -= sms;
      guard++;
      this.doStep();
      if (this.state !== 'playing') return;
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
    this.powerups.update(effDt);
    this.obstacles.update(dt);
    this.insectTimer -= dt;
    if (this.insectTimer <= 0) {
      this.insectTimer = 2600;
      for (const kind of Object.keys(this.insectCfg)) {
        const have = this.food.insects.filter(n => n.kind === kind).length;
        if (have < this.insectCfg[kind] && Math.random() < 0.5) {
          this.food.spawnInsect(kind, (x, y) => this.isFreeCell(x, y));
        }
      }
    }
    if (!this.food.items.some(i => i.type === 'golden') && Math.random() < dt * 0.00009) {
      if (this.food.trySpawnGolden((x, y) => this.isFreeCell(x, y))) {
        const g = this.food.items.find(i => i.type === 'golden');
        if (g) {
          this.particles.burst(this.view.cx(g.gx), this.view.cy(g.gy), {
            count: 10, colors: ['#ffd54a', '#fff59d'], speed: 0.06, size: 1.8, life: 500, type: 'spark'
          });
        }
      }
    }
    if (this.powerups.field.length === 0 && Math.random() < dt * 0.00007) {
      this.powerups.spawn((x, y) => this.isFreeCell(x, y));
      if (this.powerups.field.length) {
        const p = this.powerups.field[this.powerups.field.length - 1];
        const meta = POWERUP_META[p.type];
        this.particles.burst(this.view.cx(p.gx), this.view.cy(p.gy), {
          count: 8, colors: [meta.color], speed: 0.05, size: 1.8, life: 450
        });
      }
    }
    if (this.mode === 'timeattack') {
      this.taTime -= dt;
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
      const wholeSec = Math.ceil(this.taTime / 1000);
      if (wholeSec !== this._lastTickSec) {
        this._lastTickSec = wholeSec;
        if (wholeSec <= 10 && wholeSec > 0) this.sound.ticktock();
      }
      if (this.taTime <= 0) {
        this.taTime = 0;
        this.state = 'over';
        this.finishRun(false, "Time's Up!", true);
        return;
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
    const burstI = this.burst ? 1 : 0;
    if (burstI !== this._lastBurstI) {
      this._lastBurstI = burstI;
      this.sound.setIntensity(burstI);
    }
    const urgent = this.mode === 'timeattack' && this.taTime <= 10000;
    if (urgent !== this._urgent) {
      this._urgent = urgent;
      this.ui.setUrgent(urgent);
    }
    this.updateHUDFrame(dt);
  }

  drawBackground(ctx) {
    if (!this.bgCanvas) this.buildBg();
    ctx.drawImage(this.bgCanvas, 0, 0, this.view.w, this.view.h);
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
      const dh = this.demoSnake.headPos(v, clamp(this.demoAcc / 135, 0, 1));
      const dnear = this.demoFood.getNearestItemPx(dh.px, dh.py, v.cell);
      this.demoFood.render(ctx, v, this.time);
      this.demoSnake.render(ctx, v, clamp(this.demoAcc / 135, 0, 1), this.time, {
        ghost: false,
        lookX: dnear ? dnear.x : null,
        lookY: dnear ? dnear.y : null
      });
    }
    const inGame = this.state === 'playing' || this.state === 'paused' || this.state === 'over' || this.state === 'complete';
    if (inGame) {
      let lookX = null;
      let lookY = null;
      const hp = this.snake.headPos(v, this.tInterp);
      const near = this.food.getNearestItemPx(hp.px, hp.py, v.cell);
      if (near && near.d < v.cell * 8) {
        lookX = near.x;
        lookY = near.y;
      }
      this.snake.render(ctx, v, this.tInterp, this.time, {
        ghost: this.effects.ghost > 0,
        lookX, lookY,
        alpha: this.dissolving ? this.deathFade : 1,
        magnet: this.effects.magnet > 0
      });
    }
    this.particles.render(ctx);
    ctx.restore();
    this.particles.renderFlash(ctx, v.w, v.h);
  }
}

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const view = new View(canvas, stage);
const sound = new SoundManager();

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
  onOpenBadges() {
    ui.buildBadges(BADGES, id => game.save.badges.includes(id));
    ui.showScreen('badges');
  },
  onTimeAttack() { game.startRun('timeattack'); },
  onZen() { game.startRun('zen'); },
  onSkins() {
    ui.buildSkins(id => game.isSkinUnlocked(id), game.save.skin);
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
    ui.buildSkins(sid => game.isSkinUnlocked(sid), game.save.skin);
    ui.toast(`🐍 Skin selected: <b>${SKINS.find(s => s.id === id).name}</b>`);
  },
  onPauseButton() { game.togglePause(); },
  onResume() { game.togglePause(); },
  onRestart() { game.startRun(game.mode, game.levelIdx); },
  onQuit() { game.gotoMenu(); },
  onNextLevel() { game.startRun('level', game.levelIdx + 1); },
  onResetProgress() {
    game.save = defaultSave();
    game.applySettings();
    game.refreshMenuStats();
    ui.toast('🗑 Progress reset');
  },
  onSettingsChange(patch) {
    Object.assign(game.save.settings, patch);
    game.applySettings();
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
  onEscape() {
    const modal = document.getElementById('modal-settings');
    if (!modal.classList.contains('hidden')) {
      game.closeSettings();
      return;
    }
    if (game.state === 'playing' || game.state === 'paused') {
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
    ui.toast(game.save.settings.muted ? '🔇 Muted (M)' : '🔊 Sound on (M)');
  },
  onRestartKey() {
    if (game.state === 'over' || game.state === 'paused') {
      ui.toast('↻ Restarted');
      game.startRun(game.mode, game.levelIdx);
    }
  },
  onConfirm() {
    const modal = document.getElementById('modal-settings');
    if (!modal.classList.contains('hidden')) return;
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
  }
});

game.input = input;
input.attach();
input.bindDPad(document.getElementById('dpad'));
game.applySettings();
game.refreshMenuStats();

const loop = new GameLoop(dt => game.update(dt), () => game.render());
loop.start();

window.addEventListener('resize', () => {
  view.resize();
  game.onResize();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.togglePause();
});

window.addEventListener('blur', () => {
  if (game.state === 'playing') game.togglePause();
});

const unlockOnce = () => {
  sound.unlock();
  if (game.state === 'menu') sound.startMusic(BIOMES.rainforest.music);
};
window.addEventListener('pointerdown', unlockOnce, { once: true });
window.addEventListener('keydown', unlockOnce, { once: true });

Object.assign(BS, { game, ui, input, view, sound });
})(window.BS);
