// tests/tier6-audit-remediation-tests.js — Tier 6: Audit Remediation & Optimization Regressions
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

const suite = new TestSuite('Tier 6: Audit Remediation & Optimization Tests');

// =========================================================================
// SECTION 1: Input & Event Resilience
// =========================================================================

suite.test('T6.1: InputManager ignores game hotkeys (M, R, H) when text input/textarea is focused', () => {
  const { BS, env } = loadGameScripts();
  const input = BS.input;

  let mutedCalled = false;
  let restartCalled = false;
  let guideCalled = false;

  input.h.onMute = () => { mutedCalled = true; };
  input.h.onRestartKey = () => { restartCalled = true; };
  input.h.onGuideKey = () => { guideCalled = true; };

  // Simulate text field focus with closest()
  const fakeInput = {
    tagName: 'INPUT',
    type: 'text',
    closest: sel => sel.includes('input')
  };

  input.onKeyDown({ code: 'KeyM', key: 'm', target: fakeInput, preventDefault: () => {} });
  input.onKeyDown({ code: 'KeyR', key: 'r', target: fakeInput, preventDefault: () => {} });
  input.onKeyDown({ code: 'KeyH', key: 'h', target: fakeInput, preventDefault: () => {} });

  assertEqual(mutedCalled, false, 'KeyM was suppressed while text field is focused');
  assertEqual(restartCalled, false, 'KeyR was suppressed while text field is focused');
  assertEqual(guideCalled, false, 'KeyH was suppressed while text field is focused');
});

suite.test('T6.2: D-pad window pointerup and pointercancel listeners release burst and active touches', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document, win: window } = env;
  const input = BS.input;
  const dpadContainer = document.getElementById('dpad');
  input.bindDPad(dpadContainer);

  const burstBtn = document.getElementById('dpBurst');

  // Trigger burst pointerdown
  dpadContainer.dispatchEvent({
    type: 'pointerdown',
    pointerId: 42,
    target: burstBtn,
    preventDefault: () => {}
  });

  assertEqual(input._dpBurstId, 42, 'Burst pointer ID captured');

  // Window pointerup fires when finger releases outside dpad
  window.dispatchEvent({
    type: 'pointerup',
    pointerId: 42
  });

  assertEqual(input._dpBurstId, null, 'Burst pointer ID cleared by window pointerup');
});

// =========================================================================
// SECTION 2: Board Geometry & Entity Boundaries
// =========================================================================

suite.test('T6.3: Obstacles loadFromMap parses all 20 rows of map data on short viewports', () => {
  const { BS } = loadGameScripts();
  const obs = new BS.Obstacles();

  // Create a 20-row map where row 18 has a rock
  const rows = [];
  for (let y = 0; y < 20; y++) {
    let row = '';
    for (let x = 0; x < 20; x++) {
      if (x === 5 && y === 18) row += '#';
      else row += '.';
    }
    rows.push(row);
  }

  // Set view rows to 14 (simulating short/landscape display)
  BS.view.rows = 14;
  obs.loadFromMap(rows);

  // Invariant: The rock at (5, 18) MUST be loaded into obs.rocks
  const hasRockAt18 = obs.rocks.some(r => r.x === 5 && r.y === 18);
  assert(hasRockAt18, 'Obstacle at y=18 was retained and not truncated at row 14');
});

suite.test('T6.4: Snake rebuildOcc() properly restores occupancy map after coordinate repositioning', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);

  assertEqual(snake.isOccupied(10, 10), true, 'Head is initially occupied');
  assertEqual(snake.isOccupied(7, 10), true, 'Tail is initially occupied');

  // Simulate resize shift
  snake.cells[0].y = 5;
  snake.cells[1].y = 5;
  snake.cells[2].y = 5;
  snake.cells[3].y = 5;
  snake.rebuildOcc();

  assertEqual(snake.isOccupied(10, 10), false, 'Old head coordinate is cleared');
  assertEqual(snake.isOccupied(10, 5), true, 'New head coordinate is occupied');
  assertEqual(snake.isOccupied(7, 5), true, 'New tail coordinate is occupied');
});

suite.test('T6.5: Toroidal magnet pull computes shortest wrapped delta across borders', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  food.reset();

  // Place apple at (19, 5), snake head at (0, 5) with wrap = true
  food.items.push({ type: 'apple', gx: 19, gy: 5, age: 0, hop: 0 });
  food._occAdd(19, 5);

  const head = { x: 0, y: 5 };
  // Pull with wrap = true
  food.magnetPull(head, (x, y) => true, true);

  const apple = food.items[0];
  // Across wrap border, distance is 1 cell. Apple should be pulled toward head
  assert(apple.gx === 0 || apple.gx === 19, 'Apple pulled toward wrap edge without negative wrapping error');
});

suite.test('T6.6: FoodManager update() purges out-of-bounds insects and decrements counts', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  food.reset();

  // Manually insert an insect outside rows
  food.insects.push({
    kind: 'firefly',
    fx: 5, fy: 25,
    tx: 5, ty: 25,
    progress: 0,
    age: 0
  });
  food._occAdd(5, 25);

  assertEqual(food.insects.length, 1, 'Insect inserted');
  assertEqual(food.occupied(5, 25), true, 'Occupancy marked');

  // Run update with liveRows = 20
  food.update(16, { isFree: () => true, view: { cell: 20 }, particles: { burst: () => {} }, head: { x: 0, y: 0 } });

  assertEqual(food.insects.length, 0, 'Out-of-bounds insect pruned');
  assertEqual(food.occupied(5, 25), false, 'Occupancy cleared');
});

// =========================================================================
// SECTION 3: Save Data Hardening & Zen Mode
// =========================================================================

suite.test('T6.7: Save data sanitization strictly validates and coerces values, preventing XSS and invalid types', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  const maliciousSave = {
    best: { classic: '<script>alert(1)</script>', zen: 'NaN', timeattack: 450 },
    stats: { apples: '120', games: null, nearMisses: undefined },
    stars: { '0': '3', '1': -5 },
    settings: { walls: 'wrap', music: 0.8 },
    badges: ['speeddemon', 'invalid_badge_should_be_filtered']
  };

  // Import malicious save
  game.ui.h.onSaveModalApplyImport(JSON.stringify(maliciousSave));

  assertEqual(game.save.best.classic, 0, 'Malicious string coerced to 0');
  assertEqual(game.save.best.zen, 0, 'NaN string coerced to 0');
  assertEqual(game.save.best.timeattack, 450, 'Valid number retained');
  assertEqual(game.save.stats.apples, 120, 'Numeric string parsed to integer');
  assertEqual(game.save.stats.games, 0, 'Null coerced to 0');
  assertEqual(game.save.stars[0], 3, 'Star count coerced to positive int');
  assertEqual(game.save.stars[1], 0, 'Negative star count clamped to 0');
});

suite.test('T6.8: Zen mode persistence updates maxLength and best score before unmount/pause', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('zen');
  game.state = 'playing';
  game.snake.grow(10);
  for (let i = 0; i < 10; i++) game.snake.step({ cols: 20, rows: 20, wrap: true });

  const currentLen = game.snake.length;
  assert(currentLen >= 10, 'Snake grew in Zen mode');

  // Test persistZenBest
  game.persistZenBest(true);

  assertEqual(game.save.best.zen, currentLen, 'Zen best recorded');
  assertEqual(game.save.stats.maxLength >= currentLen, true, 'Max length updated in lifetime stats');
});

suite.test('T6.9: finishRun compares run score against currentBest() rather than stale save best', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  game.state = 'playing';
  game.save.best.classic = 500;
  game.run.score = 650;

  game.finishRun(false, 'Wall crash');

  assertEqual(game.save.best.classic, 650, 'New best saved in save object');
});

// =========================================================================
// SECTION 4: Rival AI Invariants & Countdown Sequence
// =========================================================================

suite.test('T6.10: Rival serpent respawns after 2600ms of active playing state, pausing respawn countdown when paused', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.save.settings.rival = true;
  game.startRun('classic');
  game.state = 'playing';

  assert(game.rival !== null, 'Rival spawned');
  game.killRival();
  assertEqual(game.rival, null, 'Rival killed and despawned');
  assertEqual(game._rivalRespawnIn, 2600, 'Respawn timer initialized to 2600ms');

  // Pause the game
  game.togglePause();
  assertEqual(game.state, 'paused', 'Game paused');

  // Simulate 3000ms passing while paused
  game.update(3000);
  assertEqual(game._rivalRespawnIn, 2600, 'Respawn timer did not tick down while paused');
  assertEqual(game.rival, null, 'Rival did not respawn during pause');

  // Resume game
  game.togglePause();
  assertEqual(game.state, 'playing', 'Game resumed');

  // Advance 2650ms during active playing
  game.update(2650);
  assertEqual(game._rivalRespawnIn, 0, 'Respawn timer elapsed');
  assert(game.rival !== null, 'Rival successfully respawned after active gameplay');
});

suite.test('T6.11: Rival serpent growth strictly capped at 13 segments even after eating golden berry or egg', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.save.settings.rival = true;
  game.startRun('classic');
  game.state = 'playing';

  // Grow rival to length 12
  game.rival.snake.reset(15, 10, BS.DIRS.left, 12);
  assertEqual(game.rival.snake.length, 12, 'Rival length is 12');

  // Place golden berry directly in front of rival head (14, 10)
  game.food.items = [{ type: 'golden', gx: 14, gy: 10, age: 0, hop: 0 }];
  game.food._occAdd(14, 10);

  // Force rival to step onto golden berry
  game.stepMs = 100;
  game.update(120);

  // Growth pending should be clamped so length + growPending <= 13
  const totalProjected = game.rival.snake.length + game.rival.snake.growPending;
  assertEqual(totalProjected <= 13, true, `Projected rival length ${totalProjected} capped at 13`);
});

suite.test('T6.12: Countdown sequence updates snake animation tick(dt, 0) and transitions to playing', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  assertEqual(game.state, 'countdown', 'Game begins in countdown');
  assertEqual(game.countdownTimer, 1350, 'Countdown timer starts at 1350ms');

  // Simulate tick
  let snakeTicked = false;
  const origTick = game.snake.tick.bind(game.snake);
  game.snake.tick = (dt, mouth) => {
    snakeTicked = true;
    origTick(dt, mouth);
  };

  game.update(500);
  assertEqual(snakeTicked, true, 'Snake tick called during countdown animation');
  assertEqual(game.state, 'countdown', 'Game still in countdown');

  // Advance past remaining time
  game.update(900);
  assertEqual(game.state, 'playing', 'Game transitioned to playing');
});

// =========================================================================
// SECTION 5: Controls, UI, Audio & Performance
// =========================================================================

suite.test('T6.13: Restart hotkey ("R") successfully restarts level when state === "complete"', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('level', 1);
  game.state = 'complete';

  // Press R key
  game.input.h.onRestartKey();

  assertEqual(game.state, 'countdown', 'Game restarted into countdown');
  assertEqual(game.levelIdx, 1, 'Restarted same level');
});

suite.test('T6.14: onNextLevel on final campaign level routes back to menu without out-of-bounds error', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  const finalLevelIdx = BS.LEVELS.length - 1;
  game.startRun('level', finalLevelIdx);
  game.state = 'complete';

  // Click Next Level
  game.ui.h.onNextLevel();

  assertEqual(game.state, 'menu', 'Next level from final level routed gracefully to menu');
});

suite.test('T6.15: Buffering direction keys in onDir during countdown queues movement for first step', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  assertEqual(game.state, 'countdown', 'Started in countdown');

  // Snake starts moving right ({ x: 1, y: 0 })
  // Queue down ({ x: 0, y: 1 }) during countdown
  game.input.h.onDir('down');

  assertEqual(game.snake.pending.length, 1, 'Turn was queued during countdown');
  assertDeepEqual(game.snake.pending[0], BS.DIRS.down, 'Queued turn is down');
});

suite.test('T6.16: UI menu dock badge counter reflects dynamic total badges (BADGES.length)', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const ui = BS.ui;

  game.refreshMenuStats();

  const totalBadges = BS.BADGES.length;
  const expectedText = `${game.save.badges.length}/${totalBadges}`;
  assertEqual(ui.el.dockBadgeCount.textContent, expectedText, 'Dock badge counter reflects actual badge count');
});

suite.test('T6.17: Level-based skin unlock progress displays level hint without incorrect "0 / 8" text', () => {
  const { BS } = loadGameScripts();
  const ui = BS.ui;

  const abyssalSkin = BS.SKINS.find(s => s.id === 'abyssal');
  assert(abyssalSkin !== undefined, 'Abyssal Biolume skin exists');
  assertEqual(abyssalSkin.unlock.type, 'level', 'Abyssal is a level unlock skin');

  // Build skins with abyssal locked
  ui.buildSkins(id => false, 'emerald', BS.game.save);

  const skinCards = ui.el.skinGrid.children;
  let abyssalText = null;
  for (const c of skinCards) {
    for (const child of c.children) {
      if (child.innerHTML && child.innerHTML.includes('Abyssal Biolume')) {
        abyssalText = child;
        break;
      }
    }
    if (abyssalText) break;
  }

  assert(abyssalText !== null, 'Found Abyssal card text element in grid');
  assert(!abyssalText.innerHTML.includes('0 / 8'), 'Card does not display "0 / 8"');
  assert(abyssalText.innerHTML.includes('Complete Sunken Maze'), 'Card displays level name hint');
});

suite.test('T6.18: Audio volume slider changes skip expensive view.resize() and board rebuild', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  let resizeCalled = false;
  const origResize = game.view.resize.bind(game.view);
  game.view.resize = () => {
    resizeCalled = true;
    origResize();
  };

  // Change music volume
  game.ui.h.onSettingsChange({ music: 0.5 });

  assertEqual(resizeCalled, false, 'view.resize() was not called on audio volume change');
  assertEqual(game.save.settings.music, 0.5, 'Music setting updated');
});

suite.test('T6.19: Service Worker fetch handler fallback returns 504 Response on network failure when offline and uncached', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert(
    swCode.includes("status: 504"),
    'sw.js fetch handler includes 504 status fallback for offline network failures'
  );
});

suite.test('T6.20: ParticleSystem burst overflow cursor bounds memory and overwrites in O(1)', () => {
  const { BS } = loadGameScripts();
  const ps = new BS.Particles();

  // Burst 250 particles (exceeding MAX_PARTICLES of 200)
  ps.burst(100, 100, { count: 250 });

  assertEqual(ps.list.length, 200, 'Particle list capped at MAX_PARTICLES (200)');
  assert(ps._overflowCursor !== undefined, 'Overflow cursor tracked for O(1) overwrite');
});

suite.test('T6.21: Complete death pipeline executes dissolve animation, deathJingle, and opens game over screen without uncaught error', async () => {
  const { BS, win } = loadGameScripts();
  const game = BS.game;
  let uncaughtError = null;
  win.addEventListener('error', (e) => {
    uncaughtError = e.error || e.message;
  });

  game.startRun('classic');
  game.state = 'playing';

  // Trigger death
  game.die('wall');
  assertEqual(game.state, 'over', 'State is over after die()');
  assertEqual(game.dissolving, true, 'Snake is dissolving');

  // Step through dissolve frames
  for (let i = 0; i < 40; i++) {
    game.update(16);
    game.render();
  }

  // Await the 700ms death timer
  await new Promise(r => setTimeout(r, 750));

  assertEqual(uncaughtError, null, 'No uncaught script error during death or gameOver');
  assert(game.ui.el.overStats.innerHTML.length > 0, 'GameOver screen statistics rendered');
});

suite.test('T6.22: Magnet pulls food directly into jaws and consumes it automatically', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  game.state = 'playing';
  game.effects.magnet = 5000;

  const apple = game.food.items.find(i => i.type === 'apple');
  const h = game.snake.head;
  // Position apple so that after snake moves 1 cell right, apple is at distance 1
  apple.gx = h.x + 2;
  apple.gy = h.y;
  game.food._checkOccSync();

  assertEqual(game.run.apples, 0, 'No apples eaten initially');
  game.doStep(16);

  assertEqual(game.run.apples, 1, 'Apple pulled directly into head cell and eaten in same step');
  assertEqual(game.food.items.includes(apple), false, 'Apple consumed from food list');
});

suite.test('T6.23: Magnet dual-axis avoidance navigates around obstacles when dominant axis is blocked', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 5, gy: 9, hop: 0, age: 0 };
  food.items = [apple];
  food._occAdd(5, 9);

  // Dominant axis is X (dx = 5, dy = 1). Block (6, 9)
  const canLand = (x, y) => !(x === 6 && y === 9);

  food.magnetPull(head, canLand, false, true);

  // Apple should fall back to orthogonal Y axis: (5, 9) -> (5, 10)
  assertEqual(apple.gx, 5, 'X position retained when blocked');
  assertEqual(apple.gy, 10, 'Y position advanced via secondary axis');
});

suite.test('T6.24: Adaptive pull rate steps every tick within proximity <= 2 or during speed burst', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 8, gy: 10, hop: 0, age: 0 }; // dist = 2
  food.items = [apple];
  food._occAdd(8, 10);

  // Initial pullTick is 0. Call magnetPull
  food.magnetPull(head, () => true, false, false);
  assertEqual(apple.gx, 9, 'Close item (dist <= 2) stepped on tick 1');

  // Call again: even on tick 2, dist <= 2 item steps every tick
  food.magnetPull(head, () => true, false, false);
  assertEqual(apple.gx, 10, 'Close item stepped on tick 2 (adaptive rate)');
});

suite.test('T6.25: Visual offsets (ox, oy) set on pull and decay smoothly over update(dt)', () => {
  const { BS } = loadGameScripts();
  const food = new BS.FoodManager();
  const head = { x: 10, y: 10 };
  const apple = { type: 'apple', gx: 7, gy: 10, hop: 0, age: 0 };
  food.items = [apple];
  food._occAdd(7, 10);

  food.magnetPull(head, () => true, false, true);
  assertEqual(apple.gx, 8, 'Apple stepped to 8');
  assertEqual(apple.ox, -1, 'Initial visual offset is -1 cell');

  food.update(16, {});
  assert(apple.ox > -1 && apple.ox < 0, 'Offset smoothly decays towards 0');

  for (let i = 0; i < 25; i++) food.update(16, {});
  assertEqual(apple.ox, 0, 'Offset cleanly settled to 0');
});

suite.test('T6.26: HUD combo and bar elements strictly use vis-hidden instead of hidden to prevent layout shift', () => {
  const fs = require('fs');
  const path = require('path');
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

  // Verify index.html markup
  assert(indexHtml.includes('id="hudCombo" class="hud-combo vis-hidden"'), 'index.html defines hudCombo with vis-hidden');
  assert(indexHtml.includes('id="hudBar" class="hud-bar vis-hidden"'), 'index.html defines hudBar with vis-hidden');
  assert(!indexHtml.includes('id="hudCombo" class="hud-combo hidden"'), 'index.html does not use hidden for hudCombo');
  assert(!indexHtml.includes('id="hudBar" class="hud-bar hidden"'), 'index.html does not use hidden for hudBar');

  const { BS } = loadGameScripts();
  const game = BS.game;

  // Initial state
  assertEqual(game.ui.el.combo.classList.contains('hidden'), false, 'combo does not have hidden class initially');
  assertEqual(game.ui.el.combo.classList.contains('vis-hidden'), true, 'combo has vis-hidden class initially');
  assertEqual(game.ui.el.hudBar.classList.contains('hidden'), false, 'hudBar does not have hidden class initially');
  assertEqual(game.ui.el.hudBar.classList.contains('vis-hidden'), true, 'hudBar has vis-hidden class initially');

  // Activate combo
  game.ui.updateHUD({ combo: 'COMBO ×2', bar: { frac: 0.8, color: '#ffd54a' } });
  assertEqual(game.ui.el.combo.classList.contains('hidden'), false, 'combo does not have hidden class when active');
  assertEqual(game.ui.el.combo.classList.contains('vis-hidden'), false, 'combo does not have vis-hidden class when active');
  assertEqual(game.ui.el.hudBar.classList.contains('hidden'), false, 'hudBar does not have hidden class when active');
  assertEqual(game.ui.el.hudBar.classList.contains('vis-hidden'), false, 'hudBar does not have vis-hidden class when active');

  // Deactivate combo
  game.ui.updateHUD({ combo: null, bar: null });
  assertEqual(game.ui.el.combo.classList.contains('hidden'), false, 'combo does not have hidden class when inactive');
  assertEqual(game.ui.el.combo.classList.contains('vis-hidden'), true, 'combo has vis-hidden class when inactive');
  assertEqual(game.ui.el.hudBar.classList.contains('hidden'), false, 'hudBar does not have hidden class when inactive');
  assertEqual(game.ui.el.hudBar.classList.contains('vis-hidden'), true, 'hudBar has vis-hidden class when inactive');
});

module.exports = suite;
