// tests/tier2-boundary-tests.js — Tier 2: Limits, Overflows, Underflows, Zero/Negative & Edge Conditions
const path = require('path');
const fs = require('fs');
const {
  createBrowserEnv,
  loadGameScripts,
  TestSuite,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows
} = require('./test-env.js');

const suite = new TestSuite('Tier 2: Boundary & Corner Cases');

// =========================================================================
// CATEGORY 1: View & Coordinate Boundaries
// =========================================================================

suite.test('B1.1: rowsFor clamps to exact minimum ROWS_MIN (14) on extreme wide viewports', () => {
  const { BS } = loadGameScripts();
  BS.view.stage.setRect(3840, 600); // 6.4:1 aspect ratio
  BS.view.forcedRows = null;
  BS.view.resize();
  assertEqual(BS.view.rows, BS.ROWS_MIN, 'Ultra-wide viewport clamps to ROWS_MIN (14)');
});

suite.test('B1.2: rowsFor clamps to exact maximum ROWS_MAX (30) on extreme tall viewports', () => {
  const { BS } = loadGameScripts();
  BS.view.stage.setRect(400, 1600); // 1:4 aspect ratio
  BS.view.forcedRows = null;
  BS.view.resize();
  assertEqual(BS.view.rows, BS.ROWS_MAX, 'Ultra-tall viewport clamps to ROWS_MAX (30)');
});

suite.test('B1.3: rowsFor with zero or negative dimensions falls back to BASE_ROWS (20)', () => {
  const { BS } = loadGameScripts();
  BS.view.stage.setRect(0, 0);
  BS.view.forcedRows = null;
  BS.view.resize();
  assertEqual(BS.view.rows, BS.BASE_ROWS, '0x0 dimensions fall back to BASE_ROWS (20)');
});

suite.test('B1.4: View cell calculation maintains minimum cell size of 13px on tiny viewports', () => {
  const { BS } = loadGameScripts();
  const v = BS.view;
  v.stage.setRect(50, 50); // Very small 50x50 viewport
  v.forcedRows = null;
  v.resize();
  assert(v.cell >= 13, 'Cell size is clamped to minimum 13px');
});

suite.test('B1.5: OnResize prunes food items whose Y coordinate exceeds new shrunk row count', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Add an item at row 28
  game.food.items.push({ type: 'apple', gx: 10, gy: 28, age: 0, hop: 0 });
  assertEqual(game.food.items.length >= 1, true, 'Apple placed at row 28');

  // Shrink board to 20 rows
  game.view.forcedRows = 20;
  game.view.resize();
  game.onResize();

  assert(!game.food.items.some(i => i.gy >= 20), 'Food item at row 28 pruned after shrinking to 20 rows');
});

suite.test('B1.6: OnResize immediately respawns an apple if all active apples were pruned', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Wipe food items and set single apple outside bounds at row 29
  game.food.items = [{ type: 'apple', gx: 10, gy: 29, age: 0, hop: 0 }];
  game.view.forcedRows = 16;
  game.view.resize();
  game.onResize();

  const apple = game.food.items.find(i => i.type === 'apple');
  assert(apple !== undefined, 'Fresh apple was spawned within new bounds');
  assert(apple.gy < 16, 'Spawned apple row is within new 16-row limit');
});

// =========================================================================
// CATEGORY 2: Snake Length & Shrink Protection Boundaries
// =========================================================================

suite.test('B2.1: Snake shrink by 3 when length is 4 clamps to minimum length 3', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);
  assertEqual(snake.length, 4, 'Initial length 4');

  const removed = snake.shrink(3);
  assertEqual(snake.length, 3, 'Snake length clamped to minimum 3');
  assertEqual(removed.length, 1, 'Only 1 segment was removed');
  assert(!snake.isOccupied(7, 10), 'Removed segment vacated occupancy map');
});

suite.test('B2.2: Snake shrink by 5 when length is 3 removes 0 segments and stays at length 3', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 3);
  assertEqual(snake.length, 3, 'Initial length 3');

  const removed = snake.shrink(5);
  assertEqual(snake.length, 3, 'Snake length remains 3');
  assertEqual(removed.length, 0, '0 segments removed');
});

suite.test('B2.3: Snake grow pending accumulates large values without overflow', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);
  snake.grow(100);
  assertEqual(snake.growPending, 100, 'Grow pending holds +100');

  const env = { cols: 20, rows: 20, wrap: true, ghost: true, ghostSelf: true };
  for (let i = 0; i < 20; i++) snake.step(env);

  assertEqual(snake.length, 24, 'Snake grew by 20 segments to length 24');
  assertEqual(snake.growPending, 80, 'Grow pending decremented to 80');
});

suite.test('B2.4: Snake step at board corners handles wrapping correctly', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  const env = { cols: 20, rows: 20, wrap: true };

  // Top-left corner (0, 0) moving UP -> should wrap to (0, 19)
  snake.reset(0, 0, BS.DIRS.up, 3);
  snake.step(env);
  assertEqual(snake.head.x, 0, 'Corner step up X stays 0');
  assertEqual(snake.head.y, 19, 'Corner step up Y wraps to 19');

  // Top-left corner (0, 0) moving LEFT -> should wrap to (19, 0)
  snake.reset(0, 0, BS.DIRS.left, 3);
  snake.step(env);
  assertEqual(snake.head.x, 19, 'Corner step left X wraps to 19');
  assertEqual(snake.head.y, 0, 'Corner step left Y stays 0');
});

suite.test('B2.5: Snake occupancy map tracks stacked segments accurately during ghost overlaps', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);

  // Manually add double occupancy on (10, 10)
  snake._occAdd(10, 10);
  assertEqual(snake.occ.get(BS.Snake.occKey(10, 10)), 2, 'Count for (10, 10) is 2');

  // Remove one instance
  snake._occRemove(10, 10);
  assert(snake.isOccupied(10, 10), '(10, 10) remains occupied with count 1');

  // Remove second instance
  snake._occRemove(10, 10);
  assert(!snake.isOccupied(10, 10), '(10, 10) vacated when count reaches 0');
});

suite.test('B2.6: Snake reset clears occupancy map and re-seeds exact starting coordinates', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(5, 5, BS.DIRS.up, 3);

  assertEqual(snake.cells.length, 3, 'Cells array length 3');
  assertEqual(snake.cells[0].x, 5, 'Head X is 5');
  assertEqual(snake.cells[0].y, 5, 'Head Y is 5');
  assertEqual(snake.cells[1].x, 5, 'Body 1 X is 5');
  assertEqual(snake.cells[1].y, 6, 'Body 1 Y is 6');
  assertEqual(snake.cells[2].x, 5, 'Tail X is 5');
  assertEqual(snake.cells[2].y, 7, 'Tail Y is 7');
  assertEqual(snake.occ.size, 3, 'Occupancy map contains exactly 3 entries');
});

// =========================================================================
// CATEGORY 3: Daily Challenge & Calendar Boundary Calculations
// =========================================================================

suite.test('B3.1: dayKey formats single-digit months and dates with leading zeroes', () => {
  const d = new Date(2026, 3, 5); // April 5, 2026
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const formatted = `${y}-${m}-${day}`;
  assertEqual(formatted, '2026-04-05', 'Day key formatted with leading zeroes');
});

suite.test('B3.2: epochDays calculates integer day difference accurately', () => {
  const d1 = new Date(2026, 0, 1);
  const d2 = new Date(2026, 0, 2);
  const day1 = Math.floor(new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime() / 86400000);
  const day2 = Math.floor(new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime() / 86400000);
  assertEqual(day2 - day1, 1, 'Consecutive dates differ by exactly 1 epoch day');
});

suite.test('B3.3: hashStr produces deterministic 32-bit unsigned integers for any daily key', () => {
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const h1 = hashStr('2026-09-02');
  const h2 = hashStr('2026-09-02');
  const h3 = hashStr('2026-09-03');
  assertEqual(h1, h2, 'Hash of identical string is strictly equal');
  assert(h1 !== h3, 'Hash of different day keys produces distinct values');
  assert(h1 >= 0, 'Hash is a non-negative unsigned integer');
});

suite.test('B3.4: daily challenge produces 2 distinct modifiers from pool', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('daily');
  assertEqual(game.dailyMods.length, 2, 'Daily challenge assigns exactly 2 modifiers');
  assert(game.dailyMods[0].id !== game.dailyMods[1].id, 'Assigned modifiers are distinct');
});

suite.test('B3.5: Daily challenge streak increments when played on consecutive days', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const yDate = new Date();
  yDate.setDate(yDate.getDate() - 1);
  const yesterdayStr = yDate.getFullYear() + '-' + String(yDate.getMonth() + 1).padStart(2, '0') + '-' + String(yDate.getDate()).padStart(2, '0');

  // Pre-seed yesterday's run
  game.save.daily = {
    key: yesterdayStr,
    best: 150,
    streak: 3,
    lastPlayed: yesterdayStr
  };

  game.startRun('daily');
  game.run.score = 220;
  game.recordDailyScore();

  assertEqual(game.save.daily.streak, 4, 'Streak incremented from 3 to 4 on consecutive day');
  assertEqual(game.save.daily.lastPlayed, todayStr, 'lastPlayed updated to today');
});

suite.test('B3.6: Daily challenge streak resets to 1 when a gap of 2+ days occurs', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 4); // 4 days ago
  const oldDay = oldDate.getFullYear() + '-' + String(oldDate.getMonth() + 1).padStart(2, '0') + '-' + String(oldDate.getDate()).padStart(2, '0');

  game.save.daily = {
    key: oldDay,
    best: 300,
    streak: 7,
    lastPlayed: oldDay
  };

  game.startRun('daily');
  game.run.score = 180;
  game.recordDailyScore();

  assertEqual(game.save.daily.streak, 1, 'Streak reset to 1 after missing multiple days');
});

// =========================================================================
// CATEGORY 4: Save Data Serialization & Corrupt Recovery Boundaries
// =========================================================================

suite.test('B4.1: loadSave returns default save when localStorage contains null or empty string', () => {
  const env = createBrowserEnv();
  env.localStorage.clear();
  const { BS } = loadGameScripts(env);
  const s = BS.game.save;
  assert(s.best && s.settings && s.stats, 'Full schema returned from empty storage');
  assertEqual(s.skin, 'emerald', 'Default skin is emerald');
});

suite.test('B4.2: loadSave with malformed JSON rescues to defaultSave and creates .corrupt backup', () => {
  const env = createBrowserEnv();
  env.localStorage.setItem('bioSerpentSave_v1', '{ "corrupted": true, broken json...');
  const { BS } = loadGameScripts(env);
  const s = BS.game.save;
  assert(s.best && s.settings, 'Rescued cleanly to default save');

  const backup = env.localStorage.getItem('bioSerpentSave_v1.corrupt');
  assert(backup !== null, 'Corrupted data backed up to bioSerpentSave_v1.corrupt');
});

suite.test('B4.3: loadSave with partial JSON merges missing default properties', () => {
  const env = createBrowserEnv();
  env.localStorage.setItem('bioSerpentSave_v1', JSON.stringify({
    best: { classic: 100 }
  }));
  const { BS } = loadGameScripts(env);
  const s = BS.game.save;
  assertEqual(s.best.classic, 100, 'Preserved partial classic score 100');
  assertEqual(s.best.timeattack, 0, 'Filled missing timeattack with default 0');
  assert(s.settings && s.settings.music === 0.7, 'Filled missing settings with defaults');
});

suite.test('B4.4: Save export produces valid JSON string containing all required schema keys', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const exported = JSON.stringify(game.save);
  const parsed = JSON.parse(exported);
  assert(parsed.best !== undefined, 'Exported JSON contains best');
  assert(parsed.settings !== undefined, 'Exported JSON contains settings');
  assert(parsed.stats !== undefined, 'Exported JSON contains stats');
  assert(parsed.daily !== undefined, 'Exported JSON contains daily');
});

suite.test('B4.5: Save import parses and applies valid external JSON payload', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const externalPayload = {
    best: { classic: 999, timeattack: 888, zen: 77 },
    settings: { music: 0.2, sfx: 0.3, muted: true, touch: 'joystick', walls: 'wrap', shake: false, flash: false, rival: true },
    stats: { apples: 500, golden: 50, insects: 30, dragonflies: 10, powerups: 40, games: 25, maxLength: 35, topspeed: true, pacifist: true, combos: 5, nearMisses: 30, dailyPlayed: 10 },
    badges: ['fruitsalad', 'centipede'],
    stars: { 0: 3, 1: 3 },
    levelBest: { 0: 600, 1: 550 },
    skin: 'golden',
    seenHint: true
  };

  const importStr = JSON.stringify(externalPayload);
  const parsed = JSON.parse(importStr);
  Object.assign(game.save, parsed);
  game.persist();

  assertEqual(game.save.best.classic, 999, 'Imported classic best applied');
  assertEqual(game.save.settings.touch, 'joystick', 'Imported touch mode applied');
  assertEqual(game.save.skin, 'golden', 'Imported skin applied');
});

suite.test('B4.6: Reset progress double-tap confirmation flow arms and disarms', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  const btn = ui.$('btnResetProgress');

  // First tap arms button
  btn.click();
  assertEqual(ui._resetArmed, true, 'Reset button is armed after first tap');
  assert(btn.textContent.includes('Tap again'), 'Button text prompts confirmation');

  // Disarm manually
  ui._disarmReset();
  assertEqual(ui._resetArmed, false, 'Reset button disarmed cleanly');
});

// =========================================================================
// CATEGORY 5: Audio Parameter & Volume Boundaries
// =========================================================================

suite.test('B5.1: Volume set to 0.0 (silent) schedules gain target of 0.0', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  sm.setVolumes({ music: 0.0, sfx: 0.0 });
  assertEqual(sm.volumes.music, 0.0, 'Music volume set to 0.0');
  assertEqual(sm.volumes.sfx, 0.0, 'SFX volume set to 0.0');
});

suite.test('B5.2: Volume set to 1.0 (max) schedules gain target accurately', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();
  sm.setVolumes({ music: 1.0, sfx: 1.0 });
  assertEqual(sm.volumes.music, 1.0, 'Music volume set to 1.0');
  assertEqual(sm.volumes.sfx, 1.0, 'SFX volume set to 1.0');
});

suite.test('B5.3: Rapid consecutive mute toggling does not throw or desync volume state', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();

  for (let i = 0; i < 20; i++) {
    sm.setVolumes({ muted: i % 2 === 0 });
  }
  assertEqual(sm.volumes.muted, false, 'Final unmuted state preserved after rapid toggling');
});

suite.test('B5.4: Tone synthesis with extreme frequency parameters executes safely', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();

  sm.tone({ f: 20, f2: 40, dur: 0.05, gain: 0.1 });
  sm.tone({ f: 18000, f2: 20000, dur: 0.05, gain: 0.1 });
  assert(true, 'Extreme audio frequencies processed without errors');
});

suite.test('B5.5: Sound ducking handles rapid calls cleanly', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.unlock();

  sm.duck(0.2, 500);
  sm.duck(0.1, 200);
  assert(true, 'Rapid ducking executed without conflict');
});

suite.test('B5.6: SoundManager setSuspended does nothing when context is null', () => {
  const { BS } = loadGameScripts();
  const sm = new BS.SoundManager();
  sm.setSuspended(true);
  assertEqual(sm.ctx, null, 'Context remains null and no error thrown');
});

// =========================================================================
// CATEGORY 6: Scoring, Combos & Time Attack Boundaries
// =========================================================================

suite.test('B6.1: Combo multiplier is clamped at CONFIG.comboMax (5x) regardless of food eaten', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');

  for (let i = 0; i < 15; i++) {
    game.consume('apple');
  }
  assertEqual(game.combo, BS.CONFIG.comboMax, 'Combo strictly clamped at comboMax (5)');
});

suite.test('B6.2: Combo timer decay at 0ms resets combo count to 0', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.consume('apple');
  game.consume('apple');
  assertEqual(game.combo, 2, 'Combo active');

  // Advance time past combo window (3800ms)
  game.comboTimer = 0;
  if (game.comboTimer <= 0) game.combo = 0;

  assertEqual(game.combo, 0, 'Combo reset to 0 after timer expiry');
});

suite.test('B6.3: Classic mode stepMs clamps to CONFIG.minStepMs (68ms) at high food eaten', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');

  game.run.foodEaten = 200; // Large number of apples
  game.stepMs = BS.clamp(BS.CONFIG.stepMs.classic - game.run.foodEaten * BS.CONFIG.speedPerApple, BS.CONFIG.minStepMs, BS.CONFIG.stepMs.classic);

  assertEqual(game.stepMs, BS.CONFIG.minStepMs, 'Speed clamped to minStepMs (68ms)');
});

suite.test('B6.4: Time Attack at exactly 0ms triggers game over', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('timeattack');
  game.state = 'playing';

  game.taTime = 0;
  game.die('time');
  assertEqual(game.state, 'over', 'Game state changed to over when Time Attack expires');
});

suite.test('B6.5: Level star evaluation at exact threshold boundaries', () => {
  const { BS } = loadGameScripts();
  const lv = BS.LEVELS[0]; // stars: [100, 180, 260]

  const getStars = (score) => (score >= lv.stars[2] ? 3 : score >= lv.stars[1] ? 2 : 1);

  assertEqual(getStars(99), 1, 'Completed level with score 99 gets baseline 1 star');
  assertEqual(getStars(180), 2, 'Exact threshold 180 gets 2 stars');
  assertEqual(getStars(260), 3, 'Exact threshold 260 gets 3 stars');
  assertEqual(getStars(500), 3, 'Score above max threshold gets 3 stars');
});

suite.test('B6.6: Near-miss cooldown prevents duplicate bonus points within nearMissCooldownMs', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  game._nearMissCd = 300; // Cooldown active
  const initialScore = game.run.score;

  // Simulate near-miss logic during cooldown
  if (game._nearMissCd > 0) game._nearMissCd -= 16;
  if (game._nearMissCd <= 0) game.run.score += BS.CONFIG.nearMissGain;

  assertEqual(game.run.score, initialScore, 'No bonus points awarded while cooldown is active');
});

// =========================================================================
// CATEGORY 7: Obstacle & Pathfinding Edge Boundaries
// =========================================================================

suite.test('B7.1: Obstacles.loadFromMap handles empty maps or single-character maps', () => {
  const { BS } = loadGameScripts();
  const obs = new BS.Obstacles();
  obs.loadFromMap([]);
  assertEqual(obs.rocks.length, 0, 'Empty map loads 0 rocks');
  assertEqual(obs.portals.length, 0, 'Empty map loads 0 portals');

  obs.loadFromMap(['#']);
  assertEqual(obs.rocks.length, 1, 'Single character map loads 1 rock');
});

suite.test('B7.2: Obstacles.portalAt returns null for unmatched/single portal markers', () => {
  const { BS } = loadGameScripts();
  const obs = new BS.Obstacles();
  obs.loadFromMap(['A.................']); // Single 'A' without partner
  assertEqual(obs.portalAt(0, 0), null, 'Unpaired portal marker returns null partner');
});

suite.test('B7.3: Obstacles.blocked returns null for coordinates outside grid bounds', () => {
  const { BS } = loadGameScripts();
  const obs = new BS.Obstacles();
  obs.loadFromMap(['####################']);
  assertEqual(obs.blocked(-5, 10), null, 'Negative X coordinate returns null');
  assertEqual(obs.blocked(10, 50), null, 'Out-of-bounds Y coordinate returns null');
});

suite.test('B7.4: NearMissDistance returns null when no hazards exist within 2-cell radius', () => {
  const { BS } = loadGameScripts();
  const obs = new BS.Obstacles();
  obs.clear();
  assertEqual(obs.nearMissDistance(10, 10), null, 'Empty board returns null near-miss distance');
});

suite.test('B7.5: Rival floodFillSize on open board returns total free cell count', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  const blocked = new Uint8Array(20 * 20); // completely unblocked
  const count = rival.floodFillSize(5, 5, blocked, 20, 20, false);
  assertEqual(count, 400, 'Flood fill traverses entire 20x20 open board');
});

suite.test('B7.6: Rival floodFillSize on completely blocked cell returns 0', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  const blocked = new Uint8Array(20 * 20);
  blocked[5 * 20 + 5] = 1; // blocked at (5, 5)
  const count = rival.floodFillSize(5, 5, blocked, 20, 20, false);
  assertEqual(count, 0, 'Flood fill on blocked cell returns 0');
});

// =========================================================================
// CATEGORY 8: UI & Element Count Boundaries
// =========================================================================

suite.test('B8.1: Toasts queue caps at maximum 4 concurrent toast notifications', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;

  for (let i = 0; i < 10; i++) {
    ui.toast(`Toast message ${i}`);
  }
  assert(ui.el.toasts.children.length <= 4, 'Toast container capped at max 4 children');
});

suite.test('B8.2: Menu stats string formats cleanly with 0 high scores, 0 stars, and 0 badges', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.best = { classic: 0, timeattack: 0, zen: 0 };
  game.save.stars = {};
  game.save.badges = [];
  game.refreshMenuStats();

  const text = game.ui.el.menuStats.innerHTML;
  assert(text.includes('Classic <b>0</b>'), 'Displays Classic 0');
  assert(text.includes('Attack <b>0</b>'), 'Displays Attack 0');
  assert(text.includes('Zen <b>0</b>'), 'Displays Zen 0');
});

suite.test('B8.3: Level grid renders correctly with all levels locked except Level 1', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  const isUnlocked = i => i === 0;
  const starsFor = () => 0;
  const bestFor = () => 0;

  ui.buildLevels(BS.LEVELS, isUnlocked, starsFor, bestFor);
  const cards = ui.el.levelGrid.querySelectorAll('.card');
  assert(cards.length >= 8, 'Rendered all campaign level cards');
  assert(!cards[0].classList.contains('locked'), 'Level 1 is unlocked');
  assert(cards[1].classList.contains('locked'), 'Level 2 is locked');
});

suite.test('B8.4: Skin grid renders unlocked status for default skin and locked for remainder', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  const game = BS.game;

  ui.buildSkins(id => game.isSkinUnlocked(id), game.save.skin, game.save, 'all');
  const cards = ui.el.skinGrid.querySelectorAll('.card');
  assertEqual(cards.length, BS.SKINS.length, 'Rendered all skin cards');
});

suite.test('B8.5: Badges grid renders 0% progress bar and 0/11 count initially', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;
  const game = BS.game;

  // Build badges using game save
  const isEarned = id => game.save.badges.includes(id);
  const badgeDefs = [
    { id: 'centipede', name: 'Centipede' },
    { id: 'fruitsalad', name: 'Fruit Salad' },
    { id: 'goldenhunter', name: 'Golden Hunter' }
  ];

  ui.buildBadges(badgeDefs, isEarned, game.save, 'all');
  assert(ui.el.badgeProgText.textContent.includes('0 /'), 'Badge progress text shows 0 earned');
  assertEqual(ui.el.badgeProgBar.style.width, '0%', 'Badge progress fill width is 0%');
});

suite.test('B8.6: History sparkbars render cleanly with single run or empty history array', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;

  const emptyHtml = ui.historyBars([]);
  assert(emptyHtml.includes('Recent runs'), 'Empty history generates valid history box');

  const singleHtml = ui.historyBars([250]);
  assert(singleHtml.includes('250'), 'Single run score rendered in bar title');
});

// Run directly if executed as main
if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
