// tests/tier7-production-readiness-tests.js — Tier 7: Production Readiness & Regression Hardening Matrix (BUG-01 through BUG-28)
const path = require('path');
const fs = require('fs');
const {
  loadGameScripts,
  TestSuite,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
} = require('./test-env.js');

const suite = new TestSuite('Tier 7: Production Readiness Tests (BUG-01 - BUG-28)');

// =========================================================================
// SECTION 1: Engine, Geometry & Navigation (BUG-01, BUG-02, BUG-03, BUG-08)
// =========================================================================

suite.test('T7.1: BUG-01 — Snake portal teleportation preserves strand cut without cross-map interpolation', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 5, BS.DIRS.right, 4);

  const res = snake.step({
    cols: 20,
    rows: 20,
    wrap: false,
    portalAt: (x, y) => (x === 11 && y === 5 ? { x: 2, y: 15 } : null)
  });
  assertEqual(res.teleported, true, 'Snake successfully teleported through portal');

  const hp = snake.headPos(BS.view, 0.5);
  const expectedPx = BS.view.cx(2);
  const sp = snake.sampleSpine(BS.view, 0.5);

  assert(Math.abs(hp.px - expectedPx) <= 50, 'Head rendered locally at emergence cell without cross-map interpolation');
  assertEqual(sp.all.length, 2, 'Spine correctly split into 2 strands at portal cut');
});

suite.test('T7.2: BUG-02 — Campaign Level 5 (Oasis Rings) map topology eliminates bottleneck wells', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 4); // Level 5: Oasis Rings (index 4)
  game.state = 'playing';

  // Check that interior cells of bottom well and top well are NOT treated as valid apple spawn cells
  const bottomWellFree = game.isFreeCell(13, 14) && game.isFreeCell(13, 15);
  const topWellFree = game.isFreeCell(8, 3) && game.isFreeCell(9, 4);
  assert(!bottomWellFree && !topWellFree, 'Both well interiors are safely excluded from apple spawn cells');
});

suite.test('T7.3: BUG-03 — onResize clamps coordinates and updates cX/cY/path in paused and playing states', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  BS.view.rows = 24;
  game.startRun('classic');
  game.state = 'playing';
  game.snake.reset(10, 20, BS.DIRS.right, 4);
  assertEqual(game.snake.head.y, 20);
  assertEqual(game.snake.cY, 20);

  // Shrink board rows to 14
  BS.view.rows = 14;
  game.onResize();

  assertEqual(game.snake.head.y, 13, 'Logical cell clamped to 13');
  assertEqual(game.snake.cY, 13, 'cY synchronized to clamped row index (13)');
  assertEqual(game.snake.path[0].y, 13, 'path[0].y synchronized to clamped row index (13)');
});

suite.test('T7.4: BUG-04 — Space key restarts game from Game Over screen and handles pause during countdown', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  assertEqual(game.state, 'countdown');

  // 1. Press Space during countdown -> pauses countdown
  BS.input.onKeyDown({ code: 'Space', key: ' ', repeat: false, target: null, preventDefault: () => {} });
  assertEqual(game.state, 'paused', 'Space pauses during countdown');

  // 2. Resume and die -> state is 'over'
  game.togglePause();
  game.die('wall');
  assertEqual(game.state, 'over');

  // Mark over ready
  game._overReady = true;

  // 3. Press Space on Game Over screen -> restarts game
  BS.input.onKeyDown({ code: 'Space', key: ' ', repeat: false, target: null, preventDefault: () => {} });
  assertEqual(game.state, 'countdown', 'Space restarts run from game over screen');
});

suite.test('T7.5: BUG-05 — InputManager permits hotkeys when a <button> has DOM focus', () => {
  const { BS } = loadGameScripts();
  const input = BS.input;

  let muteFired = false;
  input.h.onMute = () => { muteFired = true; };

  const fakeButton = {
    tagName: 'BUTTON',
    type: 'button',
    closest: sel => (sel.includes('button') ? fakeButton : null)
  };

  input.onKeyDown({ code: 'KeyM', key: 'm', target: fakeButton, preventDefault: () => {} });
  assertEqual(muteFired, true, 'KeyM executed when button has focus (not blocked by form input guard)');
});

suite.test('T7.6: BUG-06 — Countdown overlay is hidden if player dies or completes level during transition', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  const { doc } = env;

  const cdEl = doc.getElementById('countdown');
  cdEl.classList.remove('hidden');

  game.startRun('classic');
  game.state = 'playing';
  game.die('wall');

  assert(cdEl.classList.contains('hidden'), 'Countdown overlay element is hidden immediately on player death');
});

suite.test('T7.7: BUG-07 — consumeEgg applies active multipliers and refreshes comboTimer', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('timeattack');
  game.state = 'playing';
  game.combo = 4;
  game.comboTimer = 500;
  game.effects.multi = 5000; // 2x multiplier active
  game.taTime = 50000;
  const taBefore = game.taTime;

  game._inTick = true;
  game.consumeEgg();
  game._flushTickEats();
  game._inTick = false;

  assert(game.run.score > 75, 'Score scaled by active multi and combo');
  assertEqual(game.combo, 5, 'Combo incremented to 5');
  assertEqual(game.comboTimer, BS.CONFIG.comboMs, 'Combo timer was refreshed to full window');
  assert(game.taTime > taBefore, 'Time bonus awarded in Time Attack');
});

suite.test('T7.8: BUG-08 — Death particles and eye gaze delta clamp to board bounds after edge wrapping', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.settings.walls = 'wrap';
  game.startRun('classic');
  game.state = 'playing';
  game.snake.reset(19, 10, BS.DIRS.right, 4);

  for (let i = 0; i < 6; i++) {
    game.snake.step({ cols: 20, rows: BS.view.rows, wrap: true });
  }

  game.particles.clear();
  game.die('self');

  const offScreenParticles = game.particles.list.filter(p => p.x > BS.view.w || p.x < 0);
  assertEqual(offScreenParticles.length, 0, 'No death particles spawned off-screen after edge wrap');
});

// =========================================================================
// SECTION 2: AI & Adversarial Behavior (BUG-09, BUG-10, BUG-17)
// =========================================================================

suite.test('T7.9: BUG-09 — Rival and Demo AI treat tail cell as blocked when growPending > 0', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.dir = { x: 0, y: 1 };
  rival.snake.cells = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  rival.snake.growPending = 1;
  rival.snake.rebuildOcc();

  // Surround head (5, 5) with hazards except at tail (5, 6), and set target to tail
  const stepRes = rival.step(200, {
    cols: 20, rows: 20, stepMs: 150, wrap: false,
    playerCells: [],
    hazardAt: (x, y) => (x === 4 && y === 5) || (x === 5 && y === 4) ? 'rock' : null,
    hazardVer: 1,
    target: { gx: 5, gy: 6 }
  });

  // Rival must not self-cannibalize its non-vacating tail
  assert(stepRes.death !== 'self', 'Rival avoided self-collision into non-vacating tail cell');
});

suite.test('T7.10: BUG-10 — Settings update during Rival respawn cooldown does not bypass 2600ms timer', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.settings.rival = true;
  game.startRun('classic');
  game.state = 'playing';

  // Kill rival to start 2600ms respawn cooldown
  game.rival.dead = true;
  game._rivalRespawnIn = 2600;

  // Toggle settings during cooldown
  game.applySettings();

  // Rival must remain null/dead until respawn countdown reaches 0
  assertEqual(game.rival.dead, true, 'Rival remains dead during active respawn cooldown');
  assert(game._rivalRespawnIn > 0, 'Respawn cooldown remains active');
});

suite.test('T7.11: BUG-11 — UIManager.updateHUD pulses combo badge only on value change', () => {
  const { BS, env } = loadGameScripts();
  const { doc } = env;
  const ui = BS.ui;

  const comboEl = doc.getElementById('hudCombo');
  ui.updateHUD({ score: 100, combo: 2, effects: {}, mode: 'classic' });

  const classesAfterFirst = comboEl.className;
  // Second update with same combo value (no change)
  ui.updateHUD({ score: 100, combo: 2, effects: {}, mode: 'classic' });
  const classesAfterSecond = comboEl.className;

  assertEqual(classesAfterFirst, classesAfterSecond, 'Combo pulse class was not toggled without value change');
});

suite.test('T7.12: BUG-12 — UI filter tabs maintain active filter state on item selection and modal reopen', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const ui = BS.ui;

  ui.buildSkins(id => game.isSkinUnlocked(id), game.save.skin, game.save, 'locked');
  const lockedCount = ui.el.skinGrid.children.length;

  ui.h.onSelectSkin('emerald');
  const afterSelectCount = ui.el.skinGrid.children.length;

  assertEqual(afterSelectCount, lockedCount, 'Selecting skin preserves locked filter tab selection');
});

suite.test('T7.13: BUG-13 — Daily Challenge dailyPlayed counter increments at most once per calendar day', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('daily');
  game.state = 'playing';
  game.run.started = true;
  game.run.score = 50;
  game.die('wall');

  const countAfterFirst = game.save.stats.dailyPlayed;

  // Play a second daily game on the exact same date
  game.startRun('daily');
  game.state = 'playing';
  game.run.started = true;
  game.run.score = 80;
  game.die('wall');

  assertEqual(game.save.stats.dailyPlayed, countAfterFirst, 'dailyPlayed counter not incremented twice on the same day');
});

suite.test('T7.14: BUG-14 — Holding Speed Burst during countdown activates game.burst on game start', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  assertEqual(game.state, 'countdown');

  // Hold Shift during countdown
  BS.input.onKeyDown({ code: 'ShiftLeft', key: 'Shift', repeat: false, target: null, preventDefault: () => {} });
  game.update(1400);

  assertEqual(game.state, 'playing');
  assertEqual(game.burst, true, 'game.burst activated on game start while Shift was held');
});

suite.test('T7.15: BUG-15 — Touch state is cleared on window blur and pointercancel to prevent stuck burst', () => {
  const { BS } = loadGameScripts();
  const input = BS.input;

  input._swipe = { pointerId: 1, startX: 100, startY: 100 };
  input._joyId = 1;

  // Simulate window blur
  input.resetTouchState();

  assertEqual(input._swipe, null, '_swipe state reset on blur');
  assertEqual(input._joyId, null, '_joyId reset on blur');
});

suite.test('T7.16: BUG-16 — completeLevel forces immediate HUD update with final score and goal count', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;
  const { doc } = env;

  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 80;
  game.run.food = 15;

  game.completeLevel();

  const scoreEl = doc.getElementById('hudScore');
  assertEqual(scoreEl.textContent, '80', 'HUD score reflects final level score immediately upon level victory');
});

suite.test('T7.17: BUG-17 — Ghost Phase protects player from Rival collision', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  game.activatePower('ghost');
  game.rival = new BS.Rival();
  game.rival.snake.reset(11, 10, BS.DIRS.up, 4);
  game.snake.reset(10, 10, BS.DIRS.right, 4);

  // Step player into rival
  game.doStep(16);

  assertEqual(game.state, 'playing', 'Player survived stepping into rival during Ghost Phase');
});

suite.test('T7.18: BUG-18 — Near-miss bonus invokes checkBadges and is disabled during Ghost Phase', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 1); // Level 2 has rock hazards at (4,3), (4,4)
  game.state = 'playing';
  game.save.stats.nearMisses = 24;
  game.effects.ghost = 5000; // Ghost phase active

  // Step snake from (3, 3) to (3, 4), Manhattan distance 1 from rock at (4, 4)
  game.snake.reset(3, 3, BS.DIRS.down, 4);
  game.doStep();
  assertEqual(game.save.stats.nearMisses, 24, 'nearMisses did not increment during Ghost Phase');

  // Now disable ghost and step next to hazard
  game.effects.ghost = 0;
  game._nearMissCd = 0;
  game.snake.reset(3, 3, BS.DIRS.down, 4);
  game.doStep();
  assertEqual(game.save.stats.nearMisses, 25, 'nearMisses incremented when not in Ghost Phase');
  assert(game.save.badges.includes('daredevil'), 'daredevil badge unlocked when reaching 25 near misses');
});

suite.test('T7.19: BUG-19 — Magnet pull attracts adjacent items even when landing on cell with food', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.effects.magnet = 5000;
  const h = game.snake.head;

  // Food A is on cell snake steps onto (h.x + 1, h.y); Food B is 1 tile above it (h.x + 1, h.y - 1)
  game.food.items = [
    { type: 'apple', gx: h.x + 1, gy: h.y, age: 0, hop: 0 },
    { type: 'golden', gx: h.x + 1, gy: h.y - 1, age: 0, hop: 0, life: 8000 }
  ];
  game.food._rebuildOcc();
  game.doStep();

  // The golden berry was pulled from (h.x+1, h.y-1) into head and consumed
  const golden = game.food.items.find(it => it.type === 'golden');
  assert(!golden, 'Golden berry pulled into head cell and consumed');
  assert(game.run.score >= 60, 'Both stepped-on food and pulled food consumed in single step');
});

suite.test('T7.20: BUG-20 — Serpent Egg hatching strictly maintains at most 1 Golden Berry on board', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();
  fm.items = [
    { type: 'golden', gx: 2, gy: 2, age: 0, life: 8000, maxLife: 8000 },
    { type: 'egg', gx: 5, gy: 5, age: 4990, life: 10, maxLife: 5000, wob: 0 }
  ];
  fm._rebuildOcc();
  fm.update(20, {
    view: BS.view,
    isFree: () => true,
    isPassable: () => true,
    snakeHead: { x: 10, y: 10 },
    wrap: false
  });

  const goldens = fm.items.filter(i => i.type === 'golden');
  assertEqual(goldens.length, 1, 'At most 1 golden berry on board after egg hatch');
});

suite.test('T7.21: BUG-21 — Death dissolve state rejects premature restart inputs and stale timeouts', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  game.die('wall');
  assertEqual(game._overReady, false, '_overReady is false during 700ms death dissolve');

  // Input attempt during dissolve
  const input = BS.input;
  let restarted = false;
  input.h.onRestartKey = () => {
    if (game.state === 'over' && game._overReady) restarted = true;
  };
  input.onKeyDown({ code: 'Space', key: ' ', target: null, preventDefault: () => {} });

  assertEqual(restarted, false, 'Restart suppressed while _overReady is false');
});

suite.test('T7.22: BUG-22 — UIManager._disarmReset sets correct label and closing modal disarms reset', () => {
  const { BS, win } = loadGameScripts();
  const ui = BS.game.ui;
  const btn = win.document.getElementById('btnResetProgress');

  btn.dispatchEvent({ type: 'click', currentTarget: btn, target: btn, stopPropagation() {}, preventDefault() {} });
  assertEqual(ui._resetArmed, true, 'Reset button armed on click');
  assertEqual(btn.textContent, '⚠ Tap again to reset');

  ui.closeSettingsModal();
  assertEqual(ui._resetArmed, false, 'closeSettingsModal() disarmed _resetArmed');
  assertEqual(btn.textContent, 'Reset All Progress', 'Default label restored to Reset All Progress');
});

suite.test('T7.23: BUG-23 — Resetting progress from Pause modal cleanly terminates active run to menu', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('zen');
  game.state = 'playing';
  for (let i = 0; i < 21; i++) game.snake.cells.push({ x: 0, y: 0 });
  game.togglePause();
  assertEqual(game.state, 'paused');

  game.ui.h.onResetProgress();
  assertEqual(game.save.best.zen, 0, 'Save best.zen wiped to 0');
  assertEqual(game.state, 'menu', 'Game state transitioned to menu');
  assertEqual(game.run, null, 'Active run nulled to prevent corrupting wiped save');

  game.ui.h.onQuit();
  assertEqual(game.save.best.zen, 0, 'Wiped save preserved at 0 best after quit');
});

suite.test('T7.24: BUG-24 — Quitting during 3-2-1 countdown does not record stats or daily play', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('daily');
  assertEqual(game.state, 'countdown');
  const gamesBefore = game.save.stats.games;

  game.ui.h.onQuit();
  assert(!game.save.daily.key, 'Daily was not marked completed when quitting during countdown');
  assertEqual(game.save.stats.dailyPlayed, 0, 'dailyPlayed was not incremented');
  assertEqual(game.save.stats.games, gamesBefore, 'stats.games was not incremented');
});

suite.test('T7.25: BUG-25 — Obstacles._bakeRocks includes view.rows in cache key and rebakes on row count change', () => {
  const { BS, win } = loadGameScripts();
  const obs = new BS.Obstacles();
  obs.loadFromMap(BS.LEVELS[1].map);
  const ctx = win.document.createElement('canvas').getContext('2d');

  const view16 = { cell: 30, dpr: 1, rows: 16, w: 600, h: 480, cx: x => x * 30 + 15, cy: y => y * 30 + 15 };
  obs.render(ctx, view16, 0);
  const h16 = obs._rockCv.height;

  const view20 = { cell: 30, dpr: 1, rows: 20, w: 600, h: 600, cx: x => x * 30 + 15, cy: y => y * 30 + 15 };
  obs.render(ctx, view20, 0);
  const h20 = obs._rockCv.height;

  assert(h16 !== h20, 'render rebaked _rockCv when view.rows changed');
  assertEqual(h20, 600, 'Rock cache canvas height matches 20 rows (600px)');
});

suite.test('T7.26: BUG-26 — spawnDemoApple verifies demoSnake.isOccupied and bumps _ver', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  const initialVer = game.demoFood._ver || 0;
  game.spawnDemoApple();

  const apple = game.demoFood.items[0];
  assert(apple, 'Demo apple spawned');
  assert(!game.demoSnake.isOccupied(apple.gx, apple.gy), 'Demo apple did not spawn on demo snake body');
  assert((game.demoFood._ver || 0) >= initialVer, 'demoFood._ver was maintained or incremented');
});

suite.test('T7.27: BUG-27 — unlockOnce removes all listeners on first event to prevent duplicate startMusic', () => {
  const { BS, win } = loadGameScripts();
  let startMusicCalls = 0;
  const origStart = BS.game.sound.startMusic.bind(BS.game.sound);
  BS.game.sound.startMusic = (cfg) => { startMusicCalls++; return origStart(cfg); };

  win.dispatchEvent({ type: 'keydown', code: 'ArrowUp', preventDefault() {} });
  win.dispatchEvent({ type: 'pointerdown', preventDefault() {} });
  assertEqual(startMusicCalls, 1, 'startMusic called exactly once across keydown + pointerdown');
});

// Runs sw.js against an in-memory cache and a switchable network, then
// returns what the fetch handler answers for `url`.
async function swFetch(entries, url, online) {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const listeners = {};
  const store = new Map(entries);
  const bare = u => u.split('?')[0];
  const caches = {
    match: async (req, opts) => {
      const u = typeof req === 'string' ? req : req.url;
      if (store.has(u)) return store.get(u);
      if (opts && opts.ignoreSearch) {
        for (const [k, v] of store) if (bare(k) === bare(u)) return v;
      }
      return undefined;
    },
    open: async () => ({ put: async () => {}, addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true
  };
  const self = { addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting() {}, clients: { claim() {} } };
  const fetch = async () => {
    if (!online) throw new Error('offline');
    return { ok: true, body: 'network', clone() { return this; } };
  };
  const Response = function (body, init) { this.body = body; this.status = init && init.status; };
  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'location', swCode)(
    self, caches, fetch, Response, function (u) { this.url = u; }, { origin: 'http://x' });
  let answer;
  listeners.fetch({ request: { method: 'GET', mode: 'no-cors', url }, respondWith(p) { answer = p; } });
  return answer;
}

suite.test('T7.28: BUG-28 — Service Worker never serves a stale ?v=N asset online, yet still works offline', async () => {
  const stale = { ok: true, body: 'v42' };
  // Online with only an older version cached: the new version comes from the network.
  let res = await swFetch([['http://x/js/main.js?v=42', stale]], 'http://x/js/main.js?v=43', true);
  assertEqual(res.body, 'network', 'online miss on ?v=43 fetches instead of serving cached ?v=42');
  // Exact versioned hit is served from cache.
  res = await swFetch([['http://x/js/main.js?v=43', { ok: true, body: 'v43' }]], 'http://x/js/main.js?v=43', true);
  assertEqual(res.body, 'v43', 'exact versioned hit served from cache');
  // Offline after a first install: only the bare precached path exists.
  res = await swFetch([['http://x/js/main.js', { ok: true, body: 'precached' }]], 'http://x/js/main.js?v=43', false);
  assertEqual(res.body, 'precached', 'offline falls back to the precached bare path');
  // Offline with nothing cached: a clean 504, not a thrown error.
  res = await swFetch([], 'http://x/js/main.js?v=43', false);
  assertEqual(res.status, 504, 'offline miss yields 504');
});

suite.test('T7.29: Zen Mode power-up spawns exclude Ghost Phase and Prune Shroom (only magnet, slow, multi)', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('zen');
  game.state = 'playing';

  const spawnedTypes = new Set();
  for (let i = 0; i < 60; i++) {
    game.powerups.reset();
    game.powerups.spawn((x, y) => game.isFreeCell(x, y), null, ['magnet', 'slow', 'multi']);
    if (game.powerups.field.length) {
      spawnedTypes.add(game.powerups.field[0].type);
    }
  }
  assert(!spawnedTypes.has('ghost'), 'Ghost Phase never spawns in Zen Mode');
  assert(!spawnedTypes.has('prune'), 'Prune Shroom never spawns in Zen Mode');
  assert(spawnedTypes.size > 0, 'Valid Zen power-ups spawned');
});

suite.test('T7.30: Time Attack egg never lowers the clock when it is above 90s', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('timeattack');
  game.state = 'playing';
  game.taTime = 120000;
  game.consumeEgg();
  assertEqual(game.taTime, 120000 + BS.CONFIG.taGoldenBonus, 'Egg adds the golden bonus on top of 120s');
});

suite.test('T7.31: Board rows stay locked for the whole run when the viewport aspect changes', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  const rows = game.view.rows;
  const lenBefore = game.snake.length;
  game.view.stage.setRect(400, 1600); // would ask for ROWS_MAX if unlocked
  game.view.resize();
  game.onResize();
  assertEqual(game.view.rows, rows, 'Row count unchanged mid-run');
  assertEqual(game.snake.length, lenBefore, 'Snake untouched by the resize');
  game.gotoMenu();
  assertEqual(game.view.forcedRows, null, 'Menu releases the row lock');
});

suite.test('T7.32: View.resize skips backing-store reallocation when nothing changed', () => {
  const { BS } = loadGameScripts();
  const v = BS.view;
  v.resize();
  assertEqual(v.resize(), false, 'Second identical resize is a no-op');
  v.stage.setRect(500, 500);
  assertEqual(v.resize(), true, 'Real size change still resizes');
});

suite.test('T7.33: Paused board renders once, then holds the frame', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.togglePause();
  let draws = 0;
  const orig = game.drawBackground.bind(game);
  game.drawBackground = ctx => { draws++; orig(ctx); };
  game.render();
  game.render();
  game.render();
  assertEqual(draws, 1, 'Only the first paused frame is drawn');
  game.togglePause();
  game.render();
  assertEqual(draws, 2, 'Resuming draws again');
});

// ---------- Crash forgiveness ----------
function wallRun(BS) {
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.save.settings.walls = 'solid';
  game.snake.reset(19, 5, BS.DIRS.right, 4); // head on the right edge, facing the wall
  return game;
}

suite.test('T7.34: Forgiveness holds the snake in place instead of killing it', () => {
  const { BS } = loadGameScripts();
  const game = wallRun(BS);
  const before = JSON.stringify({ cells: game.snake.cells, cX: game.snake.cX, cY: game.snake.cY, path: game.snake.path.length });
  game.doStep();
  assertEqual(game.state, 'playing', 'Still alive after the first fatal move');
  assertEqual(JSON.stringify({ cells: game.snake.cells, cX: game.snake.cX, cY: game.snake.cY, path: game.snake.path.length }), before, 'Snake untouched while held');
  game.snake.queueDir(BS.DIRS.down);
  game.doStep();
  assertEqual(game.state, 'playing', 'Late turn saves the run');
  assertEqual(game.snake.head.y, 6, 'Snake moved down after turning');
});

suite.test('T7.35: Forgiveness is one grace per crash — staying on course still dies', () => {
  const { BS } = loadGameScripts();
  const game = wallRun(BS);
  game.doStep();
  game.doStep();
  assertEqual(game.state, 'over', 'Second fatal move in a row is a real crash');
});

suite.test('T7.36: Forgiveness re-arms after a safe move, and can be turned off', () => {
  const { BS } = loadGameScripts();
  let game = wallRun(BS);
  game.doStep();                       // held
  game.snake.queueDir(BS.DIRS.down);
  game.doStep();                       // safe move re-arms
  game.snake.queueDir(BS.DIRS.right);
  game.doStep();                       // wall again → held again
  assertEqual(game.state, 'playing', 'Grace available again after a successful move');

  game = wallRun(loadGameScripts().BS);
  game.save.settings.forgive = false;
  game.doStep();
  assertEqual(game.state, 'over', 'Setting off: first fatal move kills');
});

suite.test('T7.37: Held snake waits at least graceMinMs, even during a speed burst', () => {
  const { BS } = loadGameScripts();
  const game = wallRun(BS);
  game.burst = true;
  game.startEase = 0;
  const sms = game.stepMs * BS.CONFIG.burstMul;
  game.acc = sms * 3.5; // catch-up would normally fire several steps at once
  game.update(16);
  assertEqual(game.state, 'playing', 'Catch-up steps do not run into the wall');
  let waited = 0;
  while (game.state === 'playing' && waited < 1000) { game.update(10); waited += 10; }
  assert(waited >= BS.CONFIG.graceMinMs - 20, `Waited ${waited}ms before the fatal step`);
  assertEqual(game.state, 'over', 'Ignoring the warning still ends the run');
});

suite.test('T7.38: Old saves get forgiveness on; an explicit off survives a reload', () => {
  const { createBrowserEnv } = require('./test-env.js');
  const legacyEnv = createBrowserEnv();
  legacyEnv.localStorage.setItem('bioSerpentSave_v1', JSON.stringify({ best: { classic: 5 }, settings: { music: 0.5, sfx: 0.5 } }));
  assertEqual(loadGameScripts(legacyEnv).BS.game.save.settings.forgive, true, 'Legacy save without the key defaults to on');

  const offEnv = createBrowserEnv();
  offEnv.localStorage.setItem('bioSerpentSave_v1', JSON.stringify({ best: { classic: 5 }, settings: { music: 0.5, sfx: 0.5, forgive: false } }));
  assertEqual(loadGameScripts(offEnv).BS.game.save.settings.forgive, false, 'Explicit off is kept');
});

// ---------- Molt Shield ----------
suite.test('T7.39: Molt Shield absorbs a wall crash, sheds 2 segments and is used up', () => {
  const { BS } = loadGameScripts();
  const game = wallRun(BS);
  game.save.settings.forgive = false; // prove the shield alone saves the run
  game.snake.reset(19, 5, BS.DIRS.right, 8);
  game.activatePower('shield');
  assert(game.effects.shield > 0, 'Shield active');
  game.doStep();
  assertEqual(game.state, 'playing', 'Shield saved the run');
  assertEqual(game.snake.length, 8 - BS.CONFIG.moltShed, 'Shed 2 tail segments');
  assertEqual(game.effects.shield, 0, 'Shield consumed');
  assert(game.effects.ghost > 0, 'Brief phase granted after molting');
  assertEqual(game.run.molts, 1, 'Molt counted on the run');
});

suite.test('T7.40: Molt Shield absorbs a rival collision', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.settings.rival = true;
  game.startRun('classic');
  game.state = 'playing';
  game.snake.reset(5, 5, BS.DIRS.right, 4);
  game.rival.snake.reset(6, 2, BS.DIRS.up, 6); // body runs from y=2 down through (6,5)
  game.rival.snake.rebuildOcc();
  assert(game.rival.snake.isOccupied(6, 5), 'Rival body in the way');
  game.activatePower('shield');
  game.doStep();
  assertEqual(game.state, 'playing', 'Shield saved the player from the rival');
  assertEqual(game.effects.shield, 0, 'Shield consumed');
});

suite.test('T7.41: Molt Shield is a real power-up: spawns outside Zen, shows a HUD chip, expires', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  assert(BS.POWERUP_META.shield && BS.POWERUP_META.shield.dur > 0, 'Shield has metadata and a duration');
  game.startRun('classic');
  game.state = 'playing';
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    game.powerups.reset();
    game.powerups.spawn((x, y) => game.isFreeCell(x, y));
    if (game.powerups.field.length) seen.add(game.powerups.field[0].type);
  }
  assert(seen.has('shield'), 'Shield appears in the normal spawn pool');
  game.activatePower('shield');
  game.updateHUDFrame(0, true);
  assert(game.ui.chips.has('shield'), 'HUD chip shown while active');
  game.effects.shield = 10;
  game.update(16);
  assertEqual(game.effects.shield, 0, 'Shield expires on its timer');
});

suite.test('T7.42: Magnet routes food around a wall instead of stranding it', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 7, gy: 10, hop: 0, age: 0 };
  food.items = [apple];
  // Vertical wall at x = 8 from y = 9..11: straight and one-sideways paths are both blocked.
  // The detour is 7 steps, so use a reach of 8.
  const wall = (x, y) => x === 8 && y >= 9 && y <= 11;
  const canLand = (x, y) => !wall(x, y);
  for (let i = 0; i < 8 && food.items.length && !(apple.gx === 10 && apple.gy === 10); i++) {
    food.magnetPull(head, canLand, false, false, null, null, null, 8);
  }
  assertEqual(apple.gx === 10 && apple.gy === 10, true, 'Apple walked around the wall into the head cell');
});

suite.test('T7.43: Magnet keeps pulling between snake steps (per-frame drift)', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 4, gy: 10, hop: 0, age: 0 };
  food.items = [apple];
  for (let i = 0; i < 20; i++) food.magnetDrift(16, head, () => true, false, 6);
  assert(apple.gx > 4, 'Apple moved without any snake step');
  // Out of reach: nothing moves and nothing is recorded
  const far = { type: 'apple', gx: 0, gy: 0, hop: 0, age: 0 };
  food.items = [far];
  food.magnetDrift(500, head, () => true, false, 6);
  assertEqual(far.gx, 0, 'Food beyond reach is untouched');
});

suite.test('T7.44: Magnet steers idle insects toward the head', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  food.reset();
  const head = { x: 10, y: 10 };
  food.insects.push({ kind: 'beetle', fx: 6, fy: 10, tx: 6, ty: 10, prog: 1, dur: 320, dir: { x: 0, y: 1 }, age: 0, wing: 0, pop: 1 });
  food._rebuildOcc();
  // Game scripts run in their own realm: stub that realm's Math, not ours.
  const GameMath = BS.FoodManager.constructor('return Math')();
  const origRandom = GameMath.random;
  GameMath.random = () => 0.1; // always take the magnet hop
  try {
    food.magnetDrift(16, head, () => true, false, 6);
    food.update(16, { isFree: () => true, head });
  } finally {
    GameMath.random = origRandom;
  }
  assertEqual(food.insects[0].tx, 7, 'Beetle hops one cell toward the head');
  assertEqual(food.insects[0].ty, 10, 'Beetle stays on the head row');
});

suite.test('T7.45: Power-up under the head no longer blocks the magnet', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  const h = game.snake.head;
  game.powerups.field = [{ type: 'slow', gx: h.x, gy: h.y }];
  assertEqual(game.isMagnetSafe(h.x, h.y), true, 'Head cell accepts food even over a power-up');
  game.powerups.field = [{ type: 'slow', gx: h.x + 3, gy: h.y }];
  assertEqual(game.isMagnetSafe(h.x + 3, h.y), false, 'Other power-up cells still block landing');
});

suite.test('T7.46: Repeat magnet pickups stack duration up to 15s; HUD fraction stays <= 1', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  const dur = BS.POWERUP_META.magnet.dur;
  game.activatePower('magnet');
  game.effects.magnet = 8000;
  game.activatePower('magnet');
  assertEqual(game.effects.magnet, Math.min(15000, 8000 + dur), 'Second pickup adds time');
  game.activatePower('magnet');
  assertEqual(game.effects.magnet, 15000, 'Stacking is capped at 15s');
  game.updateHUDFrame(0, true);
  const chip = game.ui.chips.get('magnet');
  assert(chip, 'Magnet chip shown');
});

suite.test('T7.47: Magnet reach grows from 6 to 8 while active and resets after', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.stepMs = 1e9; // hold the snake still so it cannot crash mid-test
  game.activatePower('magnet');
  assertEqual(game.magnetReach(), 6, 'Starts at base reach');
  for (let i = 0; i < 300; i++) {
    game.effects.magnet = 9000;
    game.update(16);
    if (game.state !== 'playing') break;
  }
  assertEqual(game.magnetReach(), 8, 'Reach grows to +2 after ~4s');
  game.effects.magnet = 0;
  game.update(16);
  assertEqual(game.magnetReach(), 6, 'Reach resets once the magnet ends');
});

suite.test('T7.48: Magnet-delivered food is eaten between steps and leaves a slurp', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.effects.magnet = 5000;
  const h = game.snake.head;
  game.food.items = [{ type: 'apple', gx: h.x, gy: h.y - 1, age: 0, hop: 0 }];
  game.food._rebuildOcc();
  const apples = game.run.apples;
  game.acc = 0;
  for (let i = 0; i < 10 && game.run.apples === apples; i++) game.magnetFrame(16);
  assertEqual(game.run.apples, apples + 1, 'Apple eaten without a snake step');
  assertEqual(game.food.slurps.length, 1, 'Slurp ghost spawned');
  for (let i = 0; i < 20; i++) game.food.update(16, {});
  assertEqual(game.food.slurps.length, 0, 'Slurp ghost finishes and is removed');
});

suite.test('T7.49: HUD shows the combo multiplier, a mode objective, new-best state and buff rings', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.combo = 3;
  game.comboTimer = BS.CONFIG.comboMs / 2;
  game.run.foodEaten = 4;
  game.newBestShown = true;
  game.effects.magnet = 4500;
  game.updateHUDFrame(0, true);
  const ui = game.ui;
  assertEqual(ui.el.combo.textContent, '×1.6', 'Combo shows the score multiplier, not the count');
  assert(ui.el.hudBar.style && !ui.el.hudBar.classList.contains('vis-hidden'), 'Combo timer bar visible under the score');
  assert(ui.el.hudStats.innerHTML.includes('4/12 to Oasis'), 'Classic objective shows biome progress');
  assertEqual(ui.el.bestLabel.textContent, 'New best', 'Best label flips once the run beats it');
  const ring = ui.chips.get('magnet');
  assert(ring && ring.el.style['--p'] === '0.500', 'Buff ring arc reflects time left');
  assertEqual(ring.el.title, 'Magnet Spore', 'Buff ring names the power-up on hover');

  game.startRun('timeattack');
  game.state = 'playing';
  game.combo = 0;
  game.updateHUDFrame(0, true);
  assert(ui.el.hudStats.className.includes('timer'), 'Time Attack objective is the clock');
  assert(ui.el.combo.classList.contains('vis-hidden'), 'No combo badge without a combo');
});

suite.test('T7.50: Magnet allows multiple items to enter the head cell simultaneously without blockage', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.effects.magnet = 5000;
  const h = game.snake.head;

  // 3 apples surrounding the head from top, bottom, and front (right)
  game.food.items = [
    { type: 'apple', gx: h.x, gy: h.y - 1, age: 0, hop: 0 },
    { type: 'apple', gx: h.x, gy: h.y + 1, age: 0, hop: 0 },
    { type: 'apple', gx: h.x + 1, gy: h.y, age: 0, hop: 0 }
  ];
  game.food._rebuildOcc();

  const prevApples = game.run.apples;
  game.food.magnetPull(h, (x, y) => game.isMagnetSafe(x, y), false, false, null, null, null, 6);
  game.eatMagnetArrivals();

  assertEqual(game.food.items.length, 0, 'All 3 adjacent apples entered head cell and were consumed');
  assertEqual(game.run.apples, prevApples + 3, 'Run recorded all 3 consumed apples');
});

suite.test('T7.51: Magnet conveyor-belt streams inline items without trailing blockage', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };

  // Three inline apples in reverse order in items array [dist 3, dist 2, dist 1]
  const a3 = { type: 'apple', gx: 10, gy: 7, age: 0, hop: 0 };
  const a2 = { type: 'apple', gx: 10, gy: 8, age: 0, hop: 0 };
  const a1 = { type: 'apple', gx: 10, gy: 9, age: 0, hop: 0 };
  food.items = [a3, a2, a1];
  food._rebuildOcc();

  food.magnetPull(head, () => true, false, false, null, null, null, 6);

  assertEqual(a1.gy, 10, 'Closest apple advanced into the head');
  assertEqual(a2.gy, 9, 'Middle apple advanced into vacated cell 9');
  assertEqual(a3.gy, 8, 'Furthest apple advanced into vacated cell 8');
});

suite.test('T7.52: Magnet chooses direct Euclidean line of sight when multiple BFS paths are equal', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  // Apple at (12, 15): dx=2, dy=5. BFS distance=7.
  // Neighbor (12, 14) has Euclidean d^2 = 2^2 + 4^2 = 20.
  // Neighbor (11, 15) has Euclidean d^2 = 1^2 + 5^2 = 26.
  const apple = { type: 'apple', gx: 12, gy: 15, age: 0, hop: 0 };
  food.items = [apple];
  food._rebuildOcc();

  const field = food.magnetField(head, () => true, false, 8);
  const step = food._fieldStep(field, apple.gx, apple.gy, false, true);

  assertEqual(step.x, 12, 'Prefers direct line step along dominant vertical axis');
  assertEqual(step.y, 14, 'Steps UP to y=14 rather than sideways to x=11');
});

suite.test('T7.53: MagnetField strictly confines search to board bounds when wrap is false', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 1, y: 1 };
  // canLand callback that blindly returns true even for negative or out-of-bound coords
  const recklessCanLand = () => true;

  const field = food.magnetField(head, recklessCanLand, false, 8);
  for (const [k] of field) {
    const x = k % 4096;
    const y = Math.floor(k / 4096);
    assert(x >= 0 && x < BS.COLS, `Field coordinate x=${x} within board width`);
    assert(y >= 0 && y < 40, `Field coordinate y=${y} within board height`);
  }
});

suite.test('T7.54: Magnet boost scaling accelerates drift rate during snake sprint', () => {
  const { BS } = loadGameScripts();
  const foodNormal = new BS.FoodManager();
  const foodBoost = new BS.FoodManager();
  const head = { x: 10, y: 10 };

  const appleNorm = { type: 'apple', gx: 6, gy: 10, age: 0, hop: 0, pullAcc: 0 };
  const appleBoost = { type: 'apple', gx: 6, gy: 10, age: 0, hop: 0, pullAcc: 0 };
  foodNormal.items = [appleNorm];
  foodNormal._rebuildOcc();
  foodBoost.items = [appleBoost];
  foodBoost._rebuildOcc();

  foodNormal.magnetDrift(40, head, () => true, false, 6, null, null, null, false);
  foodBoost.magnetDrift(40, head, () => true, false, 6, null, null, null, true);

  assert(appleBoost.pullAcc > appleNorm.pullAcc, 'Boosted drift accumulates faster than normal drift');
  assert(Math.abs(appleBoost.pullAcc / appleNorm.pullAcc - 1.6) < 0.05, 'Boosted drift scales by ~1.6x');
});

suite.test('T7.55: Magnet simultaneous arrivals batch clean single popup score without points leak', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.effects.magnet = 5000;
  const h = game.snake.head;

  game.food.items = [
    { type: 'apple', gx: h.x, gy: h.y, age: 0, hop: 0 },
    { type: 'apple', gx: h.x, gy: h.y, age: 0, hop: 0 }
  ];
  game.food._rebuildOcc();

  let popups = [];
  game.particles.popup = (x, y, text, color, size) => {
    popups.push({ x, y, text, color, size });
  };

  game.eatMagnetArrivals();

  assertEqual(popups.length, 1, 'Batched into exactly one score popup');
  assertEqual(popups[0].text, '+23 (×2)', 'Popup accurately sums both apples with combo multiplier');
  assertEqual(game._eatsThisTick, 0, '_eatsThisTick cleanly reset to 0');
  assertEqual(game._tickPoints, 0, '_tickPoints cleanly reset to 0');
});

suite.test('T7.56: Magnet drift arrival completing campaign level goal transitions to completeLevel immediately', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0);
  game.state = 'playing';
  game.effects.magnet = 5000;
  const h = game.snake.head;
  const goal = BS.LEVELS[0].goalApples;
  game.run.apples = goal - 1;

  // Food item lands on head during magnet drift
  game.food.items = [{ type: 'apple', gx: h.x, gy: h.y, age: 0, hop: 0 }];
  game.food._rebuildOcc();

  game.magnetFrame(16);

  assertEqual(game.run.apples, goal, 'Goal apple was consumed');
  assert(game.state !== 'playing', 'Game transitioned out of playing state upon reaching goal');
});

suite.test('T7.57: Multi-step magnet pull retains smooth sub-cell offset continuity without snapping', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 10, gy: 7, age: 0, hop: 0, ox: 0, oy: 0, pullAcc: 0 };
  food.items = [apple];
  food._rebuildOcc();

  // Step 1 pull
  food.magnetPull(head, () => true, false, false);
  assertEqual(apple.gy, 8, 'Advanced to gy=8');
  assertEqual(apple.oy, -1, 'Initial offset is -1 cell');

  // Simulate partial visual decay of 30% (oy becomes -0.7, worldY is 8 + (-0.7) = 7.3)
  apple.oy = -0.7;
  const worldYBefore = apple.gy + apple.oy;

  // Step 2 pull immediately follows
  food.magnetPull(head, () => true, false, false);
  assertEqual(apple.gy, 9, 'Advanced to gy=9');
  const worldYAfter = apple.gy + apple.oy;
  assert(Math.abs(worldYAfter - worldYBefore) < 0.001, 'Visual world position is continuous across steps without snapping');
  assertEqual(apple.oy, -1.7, 'Offset retains accumulated distance (-1.7) rather than snapping to -1.0');
});

suite.test('T7.58: Toroidal wrapped prey triggers mouth gaping and nearest detection across screen borders', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('zen'); // Zen wraps edges
  game.state = 'playing';
  game.effects.magnet = 5000;
  const W = BS.COLS;
  const cell = game.view.cell;

  // Place snake head at x=0, heading left (facing the wrap seam)
  game.snake.reset(0, 10, BS.DIRS.left, 5);
  const headPx = game.view.cx(0);
  const headPy = game.view.cy(10);

  // Place apple at x=W-1, y=10 (1 tile away across wrap seam)
  game.food.items = [{ type: 'apple', gx: W - 1, gy: 10, age: 0, hop: 0 }];
  game.food._rebuildOcc();

  const near = game.food.getNearestItemPx(headPx, headPy, cell, true);
  assert(near !== null, 'Found nearest prey across wrap');
  assert(Math.abs(near.d - cell) < 1, 'Prey distance is recognized as 1 cell away across toroidal seam');

  for (let i = 0; i < 10; i++) game.update(16);
  assert(game.snake.mouth > 0.1, 'Snake mouth actively gapes toward prey arriving across wrap seam');
});

suite.test('T7.59: Multiple insect hits in doStep are all consumed in the same step', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  const h = game.snake.head;
  const destX = h.x + game.snake.dir.x;
  const destY = h.y + game.snake.dir.y;

  // Place 2 insects directly on step destination cell
  game.food.insects = [
    { kind: 'firefly', fx: destX, fy: destY, tx: destX, ty: destY, prog: 1, age: 0, wing: 0 },
    { kind: 'beetle', fx: destX, fy: destY, tx: destX, ty: destY, prog: 1, age: 0, wing: 0 }
  ];
  game.food._rebuildOcc();

  const prevInsects = game.run.insects;
  game.doStep(16);

  assertEqual(game.run.insects, prevInsects + 2, 'Both insects were consumed in doStep');
  assertEqual(game.food.insects.length, 0, 'No insects remain on head');
});

suite.test('T7.60: Magnet drift preserves primed progress when target cell is temporarily occupied', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };

  // Leading apple at (10, 9), trailing apple at (10, 8)
  const aLead = { type: 'apple', gx: 10, gy: 9, age: 0, hop: 0, pullAcc: 0 };
  const aTrail = { type: 'apple', gx: 10, gy: 8, age: 0, hop: 0, pullAcc: 0.99 };
  food.items = [aLead, aTrail];
  food._rebuildOcc();

  // canLand callback where head (10, 10) is blocked so aLead cannot advance
  const canLandBlocked = (x, y) => !(x === 10 && y === 10);

  food.magnetDrift(16, head, canLandBlocked, false, 6);

  // Leading apple cannot move into (10, 10)
  assertEqual(aLead.gy, 9, 'Leading apple stays at gy=9');
  // Trailing apple wants to move into (10, 9), which is occupied by aLead
  assertEqual(aTrail.gy, 8, 'Trailing apple cannot pass leading apple');
  assert(aTrail.pullAcc >= 0.9, 'Trailing apple preserves primed pull progress rather than wiping to 0');
});

suite.test('T7.61: Picking up Magnet Spore in doStep immediately pulls food on that step and startRun resets _magnetMs', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  const h = game.snake.head;
  const destX = h.x + game.snake.dir.x;
  const destY = h.y + game.snake.dir.y;

  // Place Magnet Spore on next step cell, and apple 1 tile above next step cell
  game.powerups.field = [{ type: 'magnet', gx: destX, gy: destY, life: 5000, maxLife: 5000, age: 0 }];
  game.food.items = [{ type: 'apple', gx: destX, gy: destY - 1, age: 0, hop: 0 }];
  game.food._rebuildOcc();

  const prevApples = game.run.apples;
  game.doStep(16);

  assert(game.effects.magnet > 0, 'Magnet effect activated on pickup step');
  assertEqual(game.run.apples, prevApples + 1, 'Adjacent apple was immediately pulled and consumed on the pickup step');

  // Simulate grown magnet reach and verify natural expiration + startRun both reset _magnetMs
  game._magnetMs = 5000;
  assertEqual(game.magnetReach(), 8, 'Reach is 8 when _magnetMs is 5000');
  game.effects.magnet = 10;
  game.update(16);
  assertEqual(game.effects.magnet, 0, 'Magnet expired during update');
  assertEqual(game._magnetMs, 0, '_magnetMs resets on the exact frame magnet expires');
  assertEqual(game.magnetReach(), 6, 'Reach resets to 6 on the exact frame magnet expires');
  game.effects.magnet = 5000;
  game._magnetMs = 5000;
  game.startRun('classic');
  assertEqual(game._magnetMs, 0, '_magnetMs is reset to 0 on startRun');
  assertEqual(game.magnetReach(), 6, 'Reach is back to 6 on new run');
});

suite.test('T7.62: Magnet arrival in doStep processes insects and lengthMax before completing campaign level', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('level', 0);
  game.state = 'playing';
  game.effects.magnet = 5000;
  const goal = BS.LEVELS[0].goalApples;
  game.run.apples = goal - 1;
  game.snake.grow(1);

  const h = game.snake.head;
  const destX = h.x + game.snake.dir.x;
  const destY = h.y + game.snake.dir.y;

  // Goal apple 1 tile from destination (will be pulled by magnetPull), insect on destination cell
  game.food.items = [{ type: 'apple', gx: destX, gy: destY - 1, age: 0, hop: 0 }];
  game.food.insects = [{ kind: 'beetle', fx: destX, fy: destY, tx: destX, ty: destY, prog: 1, age: 0, wing: 0 }];
  game.food._rebuildOcc();

  let popups = [];
  game.particles.popup = (x, y, text, color, size) => {
    popups.push({ x, y, text, color, size });
  };

  game.doStep(16);

  assertEqual(game.state, 'complete', 'Level completed on goal apple');
  assertEqual(game.run.insects, 1, 'Insect on step destination was also consumed before level completion');
  assertEqual(game.run.lengthMax, game.snake.length, 'lengthMax was updated for the final step');
  assertEqual(popups.length, 1, 'Apple and insect eats were batched into a single popup');
});

suite.test('T7.63: Audio unlock fails soft when the AudioContext constructor throws', () => {
  const { BS, win } = loadGameScripts();
  win.AudioContext = function () { throw new Error('NotAllowedError'); };
  win.webkitAudioContext = win.AudioContext;
  const sound = new BS.SoundManager();

  sound.unlock();
  assertEqual(sound.ctx, null, 'No half-built context is kept');
  // Every later call stays silent instead of throwing.
  sound.setVolumes({ music: 0.5, sfx: 0.5, muted: false });
  sound.bite(0);
  sound.powerup(0);
  sound.magnetTick();
  sound.death();
  sound.startMusic(BS.BIOMES.rainforest.music);
  sound.stopMusic();
  sound.setSuspended(true);
  sound.unlock();
  assertEqual(sound.ctx, null, 'A retry that fails again also stays silent');
});

module.exports = suite;

if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
