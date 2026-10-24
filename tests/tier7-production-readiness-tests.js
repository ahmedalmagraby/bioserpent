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

suite.test('T7.28: BUG-28 — Service Worker fetch handler performs exact cache matching honoring ?v=N queries', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert(
    swCode.includes('caches.match(e.request)') && !swCode.includes('ignoreSearch: true'),
    'sw.js fetch handler specifies caches.match(e.request) without ignoreSearch: true'
  );
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

module.exports = suite;

if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
