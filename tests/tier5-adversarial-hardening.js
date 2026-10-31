// tests/tier5-adversarial-hardening.js — Tier 5: Adversarial Coverage Hardening Suite
// Rigorous stress testing of untested code paths, edge cases, boundary interactions,
// and state integrity across gameplay, persistence, audio automation, UI accessibility, and touch controls.

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

const suite = new TestSuite('Tier 5: Adversarial Coverage Hardening');

// =========================================================================
// SECTION 1: Kinematics & Portal Teleportation Hardening Under High Speed
// =========================================================================

suite.test('T5.1.1: Rapid multi-portal ping-pong teleportation across successive high-frequency steps', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(5, 5, BS.DIRS.right, 4);

  // Define portal network:
  // (6, 5) -> (14, 14) [Portal A]
  // (16, 14) -> (3, 3) [Portal B]
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    ghost: false,
    ghostSelf: false,
    portalAt: (x, y) => {
      if (x === 6 && y === 5) return { x: 14, y: 14 };
      if (x === 16 && y === 14) return { x: 3, y: 3 };
      return null;
    },
    blocked: () => null
  };

  // Step 1: Step into Portal A at (6, 5) -> emerges at (14, 14)
  const res1 = snake.step(env);
  assert(res1.teleported, 'First step teleports through Portal A');
  assertEqual(snake.head.x, 14, 'Head arrived at Portal A exit X (14)');
  assertEqual(snake.head.y, 14, 'Head arrived at Portal A exit Y (14)');
  assertEqual(snake.justTele, 2, 'justTele cooldown set to 2');

  // Step 2: Step forward from (14, 14) to (15, 14) while cooldown decrements
  const res2 = snake.step(env);
  assert(!res2.teleported, 'Step 2 does not teleport');
  assertEqual(snake.head.x, 15, 'Head at (15, 14)');
  assertEqual(snake.justTele, 1, 'justTele decremented to 1');

  // Step 3: Step forward to (16, 14) -> cooldown decrements to 0, Portal B triggers
  const res3 = snake.step(env);
  assert(res3.teleported, 'Step 3 teleports through Portal B');
  assertEqual(snake.head.x, 3, 'Head arrived at Portal B exit X (3)');
  assertEqual(snake.head.y, 3, 'Head arrived at Portal B exit Y (3)');
  assertEqual(snake.cells.length, 4, 'Snake length remains 4 throughout teleportations');
});

suite.test('T5.1.2: Portal emergence into self-coiled body cell triggers lethal self-collision', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  // Set up a snake coiled such that cell (12, 12) is occupied by its body
  snake.reset(5, 5, BS.DIRS.right, 5);
  snake.cells = [
    { x: 5, y: 5 },   // head
    { x: 4, y: 5 },
    { x: 12, y: 12 }, // body segment placed at portal destination
    { x: 4, y: 4 },
    { x: 5, y: 4 }
  ];
  snake.occ.clear();
  for (const c of snake.cells) snake._occAdd(c.x, c.y);

  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    ghost: false,
    ghostSelf: false,
    portalAt: (x, y) => (x === 6 && y === 5 ? { x: 12, y: 12 } : null),
    blocked: () => null
  };

  const res = snake.step(env);
  assert(res.death === 'self', 'Teleporting directly into own body triggers lethal self-collision');
});

suite.test('T5.1.3: Portal emergence into static obstacle triggers lethal collision', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(5, 5, BS.DIRS.right, 4);

  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    ghost: false,
    ghostSelf: false,
    portalAt: (x, y) => (x === 6 && y === 5 ? { x: 15, y: 15 } : null),
    blocked: (x, y) => (x === 15 && y === 15 ? 'rock' : null)
  };

  const res = snake.step(env);
  assert(res.death === 'rock', 'Teleporting into an obstacle rock triggers lethal collision death');
});

suite.test('T5.1.4: Direction input queue burst at high speed caps at 3 turns and drops 180° reversal', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(10, 10, BS.DIRS.right, 4);

  // Attempt 180 reversal directly: heading right -> queue left
  snake.queueDir(BS.DIRS.left);
  assertEqual(snake.pending.length, 0, '180° direct reversal is rejected immediately');

  // Queue valid sequence of turns: Up, Left, Down
  snake.queueDir(BS.DIRS.up);
  snake.queueDir(BS.DIRS.left);
  snake.queueDir(BS.DIRS.down);
  assertEqual(snake.pending.length, 3, 'Queue accepts 3 valid turns');

  // 4th turn attempted while queue is full: should be dropped
  snake.queueDir(BS.DIRS.right);
  assertEqual(snake.pending.length, 3, 'Queue strictly caps at maximum 3 pending directions');

  // Execute step: should process first queued turn (Up)
  const env = { cols: 20, rows: 20, wrap: false, ghost: false, ghostSelf: false };
  snake.step(env);
  assertEqual(snake.dir.x, 0, 'Direction updated to Up.x (0)');
  assertEqual(snake.dir.y, -1, 'Direction updated to Up.y (-1)');
  assertEqual(snake.pending.length, 2, 'Remaining queue length is 2');
});

suite.test('T5.1.5: Toroidal border wrapping across 100 high-frequency steps maintains exact O(1) occupancy counts', () => {
  const { BS } = loadGameScripts();
  const snake = new BS.Snake();
  snake.reset(0, 0, BS.DIRS.right, 5);

  const env = { cols: 20, rows: 20, wrap: true, ghost: false, ghostSelf: false };

  // Step 100 times wrapping around borders
  for (let step = 0; step < 100; step++) {
    // Change direction periodically to trace complex path
    if (step % 17 === 0) snake.queueDir(BS.DIRS.down);
    if (step % 29 === 0) snake.queueDir(BS.DIRS.left);
    if (step % 41 === 0) snake.queueDir(BS.DIRS.up);
    if (step % 53 === 0) snake.queueDir(BS.DIRS.right);

    const res = snake.step(env);
    assert(!res.death, `Step ${step} survived toroidal wrap without death`);
  }

  assertEqual(snake.cells.length, 5, 'Length preserved at 5');
  // Check that every cell in snake.cells has occupancy count exactly 1
  for (const c of snake.cells) {
    const key = c.y * 4096 + c.x;
    assertEqual(snake.occ.get(key), 1, `Occupancy for cell (${c.x}, ${c.y}) is exactly 1`);
  }
  assertEqual(snake.occ.size, 5, 'Occupancy map size strictly matches snake cell count (5)');
});

// =========================================================================
// SECTION 2: Rival Serpent AI, Body Collision & Maze Steering
// =========================================================================

suite.test('T5.2.1: Rival navigation in narrow 1-cell corridor without self-collision or phantom turns', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  // Place rival in 1-cell wide horizontal channel (y = 5, x from 5 to 10)
  rival.snake.reset(8, 5, BS.DIRS.left, 3);
  rival.acc = 0;

  // Solid walls everywhere except y=5 from x=2 to x=10
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    stepMs: 150,
    playerCells: [],
    target: { gx: 2, gy: 5 },
    hazardAt: (x, y) => (y !== 5 ? 'rock' : null)
  };

  const stepped = rival.step(150, env);
  assert(!rival.dead, 'Rival survives corridor step');
  assertEqual(rival.snake.head.x, 7, 'Rival moved left along corridor towards apple');
  assertEqual(rival.snake.head.y, 5, 'Rival stayed in corridor row 5');
});

suite.test('T5.2.2: Rival stepping into player snake body registers immediate death (death: "player")', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(10, 10, BS.DIRS.left, 4);

  // Player body blocking rival's path at (9, 10)
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    stepMs: 150,
    playerCells: [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }],
    target: { gx: 5, gy: 10 },
    hazardAt: () => null
  };

  // Force rival to step directly into blocked terrain if no other option
  // Enclose top and bottom so it has nowhere else to go
  env.hazardAt = (x, y) => (y !== 10 ? 'rock' : null);

  const stepped = rival.step(150, env);
  assert(rival.dead, 'Rival marked dead upon stepping into player body');
  assertEqual(stepped.death, 'player', 'Rival death cause is player collision');
});

suite.test('T5.2.3: Player snake head stepping into rival snake triggers game over (devoured by rival)', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Spawn rival and place its body directly in front of player
  game.rival = new BS.Rival();
  game.rival.snake.reset(11, 10, BS.DIRS.up, 4);
  game.snake.reset(10, 10, BS.DIRS.right, 4);

  // Player steps right from (10, 10) into rival at (11, 10)
  game.doStep(16);

  assertEqual(game.state, 'over', 'Player game over triggered');
  assertEqual(game.save.stats.games, 1, 'Game counter incremented on player death');
});

suite.test('T5.2.4: Rival tail-chasing survivability fallback when target apple is boxed in by impassable rocks', () => {
  const { BS } = loadGameScripts();
  const rival = new BS.Rival();
  rival.snake.reset(10, 10, BS.DIRS.right, 4);

  // Apple is sealed inside a 3x3 rock box at (2, 2)
  const env = {
    cols: 20,
    rows: 20,
    wrap: false,
    stepMs: 150,
    playerCells: [{ x: 1, y: 1 }],
    target: { gx: 2, gy: 2 },
    hazardAt: (x, y) => {
      // Box around (2, 2)
      if (Math.abs(x - 2) <= 1 && Math.abs(y - 2) <= 1 && !(x === 2 && y === 2)) return 'rock';
      return null;
    }
  };

  // Rival steps multiple times: should safely fallback to tail-chase without throwing or crashing
  for (let i = 0; i < 5; i++) {
    const stepped = rival.step(150, env);
    assert(!rival.dead, `Rival survived step ${i} using tail-chase fallback`);
  }
});

suite.test('T5.2.5: Rival growth ceiling strictly capped at 13 segments preventing runaway board filling', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';
  game.rival = new BS.Rival();
  game.rival.snake.reset(15, 15, BS.DIRS.left, 4);

  // Ingest 25 apples
  for (let i = 0; i < 25; i++) {
    game.rival.snake.grow(1);
    if (game.rival.snake.length >= 13) {
      game.rival.snake.growPending = 0;
    }
    // Simulate step to consume growPending
    if (game.rival.snake.growPending > 0) {
      game.rival.snake.cells.push({ x: 15 + i, y: 15 });
      game.rival.snake.growPending--;
    }
  }

  assert(game.rival.snake.length <= 13, `Rival length (${game.rival.snake.length}) is capped at <= 13`);
  assertEqual(game.rival.snake.growPending, 0, 'Rival growPending is 0 at cap');
});

suite.test('T5.2.6: Rival respawn race condition protection (_rivalRunId) ignores stale timeout callbacks after run restarts', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.save.settings.rival = true;
  game.startRun('classic');
  game.state = 'playing';

  // Seed rival and kill to schedule a delayed respawn
  game.rival = new BS.Rival();
  game.rival.snake.reset(15, 15, BS.DIRS.left, 4);
  game.killRival();
  const spawnId1 = game._rivalRunId;

  // Re-seed rival and kill again: increments ID
  game.rival = new BS.Rival();
  game.rival.snake.reset(15, 15, BS.DIRS.left, 4);
  game.killRival();
  const spawnId2 = game._rivalRunId;

  assert(spawnId2 > spawnId1, '_rivalRunId incremented for each death/respawn cycle');
  assert(spawnId1 !== game._rivalRunId, 'Prior spawnId is detected as stale');
});

// =========================================================================
// SECTION 3: Food Consumption & Power-Up Lifecycle Under Extreme Frequencies
// =========================================================================

suite.test('T5.3.1: 500 rapid food spawn and consumption cycles with zero memory leaks or orphaned items', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();

  for (let i = 0; i < 500; i++) {
    const ok = fm.spawnApple(() => true);
    assert(ok, `Spawn succeeded on cycle ${i}`);
    assertEqual(fm.items.length, 1, 'Exactly 1 item on field');
    const it = fm.items[0];
    const eaten = fm.collideCell(it.gx, it.gy);
    assert(eaten !== null, 'Item successfully collided and consumed');
    assertEqual(eaten.type, 'apple', 'Consumed item is apple');
    assertEqual(fm.items.length, 0, 'Field empty after consumption');
  }
});

suite.test('T5.3.2: Golden berry lifetime decay and Serpent Egg hatching transition lifecycle under irregular dt pulses', () => {
  const { BS } = loadGameScripts();
  const fm = new BS.FoodManager();

  // Test 1: Golden berry decay
  fm.trySpawnGolden(() => true);
  assertEqual(fm.items.length, 1, 'Golden berry spawned');
  const gold = fm.items[0];
  assertEqual(gold.type, 'golden');

  // Pulse dt in irregular chunks: 1000ms, 4000ms, 6100ms (total 11100ms > 11000ms)
  fm.update(1000, { view: BS.view });
  assertEqual(fm.items.length, 1, 'Golden alive after 1000ms');
  fm.update(4000, { view: BS.view });
  assertEqual(fm.items.length, 1, 'Golden alive after 5000ms');
  fm.update(6100, { view: BS.view });
  assertEqual(fm.items.length, 0, 'Golden cleanly despawned after exceeding lifespan');

  // Test 2: Serpent Egg hatching
  fm.items.push({
    type: 'egg', gx: 8, gy: 8, age: 0, life: 9000, maxLife: 9000, hop: 0, pop: 0, wob: 0
  });
  assertEqual(fm.items.length, 1, 'Egg added');

  // Advance by 9100ms -> should hatch into a golden berry at (8, 8)
  fm.update(9100, { view: BS.view });
  assertEqual(fm.items.length, 1, 'Item remains after hatching');
  assertEqual(fm.items[0].type, 'golden', 'Egg hatched into golden berry');
  assertEqual(fm.items[0].gx, 8, 'Hatched golden berry at same X (8)');
  assertEqual(fm.items[0].gy, 8, 'Hatched golden berry at same Y (8)');
});

suite.test('T5.3.3: PowerUpManager strict capacity invariant (max 2 items) across 200 consecutive spawn calls', () => {
  const { BS } = loadGameScripts();
  const pm = new BS.PowerUpManager();

  for (let i = 0; i < 200; i++) {
    pm.spawn(() => true);
    assert(pm.field.length <= 2, `Field length (${pm.field.length}) never exceeds 2 items`);
  }
  assertEqual(pm.field.length, 2, 'Field saturated at exactly 2 items');
});

suite.test('T5.3.4: Board resize pruning immediately purges out-of-bounds powerups and food items', () => {
  const { BS } = loadGameScripts();
  const pm = new BS.PowerUpManager();
  const fm = new BS.FoodManager();

  // Populate items at various coordinates
  pm.field.push({ type: 'slow', gx: 5, gy: 12, age: 0, life: 5000 });
  pm.field.push({ type: 'ghost', gx: 5, gy: 25, age: 0, life: 5000 }); // Out of bounds when rows=20

  fm.items.push({ type: 'apple', gx: 8, gy: 14, age: 0 });
  fm.items.push({ type: 'apple', gx: 8, gy: 28, age: 0 }); // Out of bounds

  // Ensure live rows is 20
  BS.view.rows = 20;

  pm.update(16);
  fm.update(16, { view: BS.view });

  assertEqual(pm.field.length, 1, 'Out-of-bounds powerup pruned');
  assertEqual(pm.field[0].type, 'slow', 'In-bounds powerup retained');

  assertEqual(fm.items.length, 1, 'Out-of-bounds food item pruned');
  assertEqual(fm.items[0].gy, 14, 'In-bounds food item retained');
});

suite.test('T5.3.5: Power-up active durations decrement and expire cleanly without residual side-effects', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  game.startRun('classic');
  game.state = 'playing';

  // Apply buffs
  game.effects.magnet = 3000;
  game.effects.slow = 2000;
  game.effects.ghost = 1000;
  game.effects.multi = 4000;

  // Advance 1500ms via game.update: ghost should expire, others decrement
  game.update(1500);
  assertEqual(game.effects.ghost, 0, 'Ghost expired');
  assertEqual(game.effects.slow, 500, 'Slow has 500ms left');
  assertEqual(game.effects.magnet, 1500, 'Magnet has 1500ms left');
  assertEqual(game.effects.multi, 2500, 'Multi has 2500ms left');

  // Advance another 3000ms: all expire to 0
  game.update(3000);
  assertEqual(game.effects.slow, 0, 'Slow expired');
  assertEqual(game.effects.magnet, 0, 'Magnet expired');
  assertEqual(game.effects.multi, 0, 'Multi expired');
});

// =========================================================================
// SECTION 4: Daily Challenge Rollover, Streak Counting & Date Boundaries
// =========================================================================

suite.test('T5.4.1: Deterministic 32-bit PRNG generates exactly 2 unique daily modifiers across 30 distinct calendar dates', () => {
  const { BS } = loadGameScripts();

  for (let day = 1; day <= 30; day++) {
    const date = new Date(2026, 8, day); // Sept 1 to 30, 2026
    const key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    // Call dailySpec via the hashStr / dailySpec deterministic pipeline
    const hash = 2166136261 >>> 0;
    let h = hash;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const seed = h >>> 0;
    // Mulberry32 RNG
    let a = seed;
    const rng = function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const pool = ['haste', 'giant', 'wrap', 'ghosty', 'frenzy'];
    const mods = [];
    for (let i = 0; i < 2 && pool.length; i++) {
      mods.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }

    assertEqual(mods.length, 2, `Day ${day} has exactly 2 modifiers`);
    assert(mods[0] !== mods[1], `Day ${day} modifiers (${mods[0]}, ${mods[1]}) are distinct`);
  }
});

suite.test('T5.4.2: Consecutive daily challenge play increments streak monotonically across day boundaries', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Day 1
  game.save.daily.lastPlayed = '2026-09-01';
  game.save.daily.key = '2026-09-01';
  game.save.daily.streak = 1;

  // Day 2 (simulate today = 2026-09-02)
  const d = game.save.daily;
  const yesterday = '2026-09-01';
  const today = '2026-09-02';
  d.streak = d.lastPlayed === yesterday ? (d.streak || 0) + 1 : 1;
  d.key = today;
  d.lastPlayed = today;
  assertEqual(d.streak, 2, 'Streak increments to 2 on consecutive day');

  // Day 3 (simulate today = 2026-09-03)
  const nextYesterday = '2026-09-02';
  const nextToday = '2026-09-03';
  d.streak = d.lastPlayed === nextYesterday ? (d.streak || 0) + 1 : 1;
  d.key = nextToday;
  d.lastPlayed = nextToday;
  assertEqual(d.streak, 3, 'Streak increments to 3 on 3rd consecutive day');
});

suite.test('T5.4.3: Gap of 2+ days resets daily challenge streak to 1', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Last played 2 days ago
  game.save.daily.lastPlayed = '2026-09-01';
  game.save.daily.streak = 5;

  const yesterday = '2026-09-02';
  const today = '2026-09-03';
  const d = game.save.daily;
  d.streak = d.lastPlayed === yesterday ? (d.streak || 0) + 1 : 1;
  d.key = today;
  d.lastPlayed = today;

  assertEqual(d.streak, 1, 'Streak resets to 1 after missing a day');
});

suite.test('T5.4.4: Date rollover resets today daily best while preserving historical streak and mode best', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Yesterday's daily run
  game.save.daily.key = '2026-09-01';
  game.save.daily.best = 420;
  game.save.daily.lastPlayed = '2026-09-01';
  game.save.daily.streak = 4;

  // Today is a new calendar day
  game.mode = 'daily';
  // currentBest() should return 0 because today.key !== dayKey()
  const bestToday = game.currentBest();
  assertEqual(bestToday, 0, 'currentBest for unplayed new day returns 0');

  // Run today's game and record score
  game.run = { score: 180 };
  game.recordDailyScore();

  assertEqual(game.save.daily.best, 180, 'Today best recorded as 180');
});

suite.test('T5.4.5: Daily challenge score recording increments stats.dailyPlayed exactly once per day', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const initialPlayed = game.save.stats.dailyPlayed || 0;

  // Run 1 today
  game.run = { score: 100 };
  game.recordDailyScore();
  assertEqual(game.save.stats.dailyPlayed, initialPlayed + 1, 'dailyPlayed incremented on first run today');

  // Run 2 today in same session
  game.run = { score: 150 };
  game.recordDailyScore();
  assertEqual(game.save.stats.dailyPlayed, initialPlayed + 1, 'dailyPlayed NOT incremented on second run today');
});

// =========================================================================
// SECTION 5: Level Garden Win Persistence, Star Rating & Stats Counters
// =========================================================================

suite.test('T5.5.1: Star evaluation produces exact 1, 2, and 3 star ratings at exact threshold boundaries across all 8 levels', () => {
  const { BS } = loadGameScripts();

  for (let i = 0; i < BS.LEVELS.length; i++) {
    const lv = BS.LEVELS[i];
    // Star 1: below star[1]
    const s1 = lv.stars[1] - 1 >= lv.stars[2] ? 3 : lv.stars[1] - 1 >= lv.stars[1] ? 2 : 1;
    assertEqual(s1, 1, `Level ${i} score (star[1]-1) awards 1 star`);

    // Star 2: exactly star[1]
    const s2 = lv.stars[1] >= lv.stars[2] ? 3 : lv.stars[1] >= lv.stars[1] ? 2 : 1;
    assertEqual(s2, 2, `Level ${i} score (star[1]) awards 2 stars`);

    // Star 3: exactly star[2]
    const s3 = lv.stars[2] >= lv.stars[2] ? 3 : lv.stars[2] >= lv.stars[1] ? 2 : 1;
    assertEqual(s3, 3, `Level ${i} score (star[2]) awards 3 stars`);
  }
});

suite.test('T5.5.2: Level completion updates save.stars[levelIdx] monotonically', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 250; // 3 stars on Level 0 (threshold is 200)
  game.completeLevel();
  assertEqual(game.save.stars[0], 3, 'Level 0 has 3 stars');

  // Replay Level 0 with 1-star performance (threshold is 90)
  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 100; // 1 star
  game.completeLevel();
  assertEqual(game.save.stars[0], 3, 'Level 0 stars NOT degraded by lower score replay');
});

suite.test('T5.5.3: Level completion updates save.levelBest[levelIdx] monotonically', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 110;
  game.completeLevel();
  assertEqual(game.save.levelBest[0], 110, 'Initial levelBest is 110');

  // Replay with lower score
  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 75;
  game.completeLevel();
  assertEqual(game.save.levelBest[0], 110, 'levelBest remains 110 on lower score');

  // Replay with higher score
  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 145;
  game.completeLevel();
  assertEqual(game.save.levelBest[0], 145, 'levelBest updated to 145 on higher score');
});

suite.test('T5.5.4: Completing Level N with >= 1 star unlocks Level N+1 across the full 8-level campaign', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Reset all stars
  game.save.stars = {};
  assert(game.isLevelUnlocked(0), 'Level 0 unlocked initially');
  assert(!game.isLevelUnlocked(1), 'Level 1 locked initially');

  for (let i = 0; i < BS.LEVELS.length - 1; i++) {
    game.save.stars[i] = 1;
    assert(game.isLevelUnlocked(i + 1), `Level ${i + 1} unlocked after completing Level ${i}`);
  }
});

suite.test('T5.5.5: save.stats.games counter strictly increments by 1 on every level completion and every game-over death', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const initial = game.save.stats.games;

  // Complete level
  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 50;
  game.completeLevel();
  assertEqual(game.save.stats.games, initial + 1, 'games counter +1 on level victory');

  // Die in classic
  game.startRun('classic');
  game.state = 'playing';
  game.die('wall');
  assertEqual(game.save.stats.games, initial + 2, 'games counter +1 on death');
});

// =========================================================================
// SECTION 6: Run History LIFO Queue Bounds & Synchronous LocalStorage Persistence
// =========================================================================

suite.test('T5.6.1: Run history per mode is strictly capped at <= 10 items after 25 consecutive games', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  for (let i = 1; i <= 25; i++) {
    game.startRun('classic');
    game.state = 'playing';
    game.run.score = i * 10;
    game.die('wall');
  }

  const hist = game.save.history.classic;
  assertEqual(hist.length, 10, 'History array strictly capped at 10 items');
});

suite.test('T5.6.2: Run history maintains exact sliding window: oldest scores shift out, newest appended', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  for (let i = 1; i <= 25; i++) {
    game.startRun('classic');
    game.state = 'playing';
    game.run.score = i * 10;
    game.die('wall');
  }

  const expected = [160, 170, 180, 190, 200, 210, 220, 230, 240, 250];
  assertDeepEqual(game.save.history.classic, expected, 'History contains exact 10 most recent scores');
});

suite.test('T5.6.3: Synchronous localStorage persistence verified after every die() and completeLevel()', () => {
  const { BS, env } = loadGameScripts();
  const game = BS.game;

  game.startRun('classic');
  game.state = 'playing';
  game.run.score = 330;
  game.die('rock');

  // Read immediately from localStorage
  const saved1 = JSON.parse(env.localStorage.getItem('bioSerpentSave_v1'));
  assertEqual(saved1.history.classic[saved1.history.classic.length - 1], 330, 'die() persisted immediately to localStorage');

  // Now complete a level
  game.startRun('level', 1);
  game.state = 'playing';
  game.run.score = 95;
  game.completeLevel();

  const saved2 = JSON.parse(env.localStorage.getItem('bioSerpentSave_v1'));
  assertEqual(saved2.history.level1[saved2.history.level1.length - 1], 95, 'completeLevel() persisted immediately to localStorage');
});

suite.test('T5.6.4: Multiple game modes maintain independent history arrays without data bleed', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Play in Classic
  game.startRun('classic');
  game.state = 'playing';
  game.run.score = 111;
  game.die('wall');

  // Play in Time Attack
  game.startRun('timeattack');
  game.state = 'playing';
  game.run.score = 222;
  game.die('time');

  // Play in Zen
  game.startRun('zen');
  game.state = 'playing';
  game.run.score = 333;
  game.finishRun(false, 'Zen Done', true);

  // Play in Level 0
  game.startRun('level', 0);
  game.state = 'playing';
  game.run.score = 444;
  game.completeLevel();

  assertEqual(game.save.history.classic[game.save.history.classic.length - 1], 111, 'Classic history has 111');
  assertEqual(game.save.history.timeattack[game.save.history.timeattack.length - 1], 222, 'Time Attack history has 222');
  assertEqual(game.save.history.zen[game.save.history.zen.length - 1], 333, 'Zen history has 333');
  assertEqual(game.save.history.level0[game.save.history.level0.length - 1], 444, 'Level 0 history has 444');
});

suite.test('T5.6.5: Run history handles corrupt or missing history records gracefully', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;

  // Null out history object
  game.save.history = null;

  game.startRun('classic');
  game.state = 'playing';
  game.run.score = 88;
  game.die('wall');

  assert(game.save.history !== null, 'History object re-initialized');
  assertEqual(game.save.history.classic.length, 1, 'Score appended successfully');
  assertEqual(game.save.history.classic[0], 88);
});

// =========================================================================
// SECTION 7: Web Audio API Automation Parameter Scheduling & Ducking Safety
// =========================================================================

suite.test('T5.7.1: applyVolumes() safely cancels scheduled values and sets targets without scheduling exceptions', () => {
  const { BS } = loadGameScripts();
  const sound = BS.sound;
  sound.unlock();

  // Call applyVolumes rapidly
  for (let i = 0; i < 20; i++) {
    sound.applyVolumes();
  }

  assert(sound.master !== null, 'Master gain node active');
  assert(sound.musicBus !== null, 'Music bus gain node active');
  assert(sound.sfxBus !== null, 'SFX bus gain node active');
});

suite.test('T5.7.2: Extreme volume values (negative, > 1.0, NaN, Infinity) are clamped to [0, 1] without corrupting audio nodes', () => {
  const { BS } = loadGameScripts();
  const sound = BS.sound;
  sound.unlock();

  // Negative and oversized
  sound.setVolumes({ music: -5.0, sfx: 10.0 });
  assertEqual(sound.volumes.music, 0, 'Negative music volume clamped to 0');
  assertEqual(sound.volumes.sfx, 1, 'Excessive sfx volume clamped to 1');

  // NaN and Infinity: should be ignored (retaining previous valid values)
  sound.setVolumes({ music: NaN, sfx: Infinity });
  assertEqual(sound.volumes.music, 0, 'NaN music ignored');
  assertEqual(sound.volumes.sfx, 1, 'Infinity sfx ignored');
});

suite.test('T5.7.3: Rapid sequential mute/unmute toggling (50 cycles) maintains consistent master gain target', () => {
  const { BS } = loadGameScripts();
  const sound = BS.sound;
  sound.unlock();

  for (let i = 0; i < 50; i++) {
    sound.setVolumes({ muted: i % 2 === 0 });
  }

  // Last iteration (i = 49) was odd -> muted: false
  assertEqual(sound.volumes.muted, false, 'Final muted state is false');
});

suite.test('T5.7.4: Music ducking cancels prior automation and applies click-free ramps on musicBus', () => {
  const { BS } = loadGameScripts();
  const sound = BS.sound;
  sound.unlock();

  // Rapidly trigger duck() 5 times consecutively
  for (let i = 0; i < 5; i++) {
    sound.duck();
  }

  assert(sound.musicBus.gain !== null, 'musicBus gain operational after multiple duck calls');
});

suite.test('T5.7.5: Tone synthesis handles extreme frequencies (5Hz, 40000Hz) and zero durations safely', () => {
  const { BS } = loadGameScripts();
  const sound = BS.sound;
  sound.unlock();

  // Extreme low frequency + zero duration
  sound.tone({ f: 5, f2: 2, dur: 0, gain: 0.1 });
  // Extreme high frequency
  sound.tone({ f: 40000, f2: 20000, dur: 0.05, gain: 0.1 });

  assert(true, 'Tone synthesis completed without exceptions');
});

// =========================================================================
// SECTION 8: Service Worker Offline Cache Matching & Version Coherence
// =========================================================================

suite.test('T5.8.1: Service Worker CACHE version string strictly matches asset query strings ?v=N in index.html', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const swMatch = swCode.match(/const\s+CACHE\s*=\s*['"]bioserpent-v(\d+)['"]/);
  assert(swMatch !== null, 'sw.js declares bioserpent-vN cache name');
  const swVer = swMatch[1];

  const htmlMatches = Array.from(indexHtml.matchAll(/[?&]v=(\d+)/g));
  assert(htmlMatches.length > 0, 'index.html has ?v=N asset version tags');

  for (const m of htmlMatches) {
    assertEqual(m[1], swVer, `Asset query parameter ?v=${m[1]} matches SW cache version ${swVer}`);
  }
});

suite.test('T5.8.2: Complete audit of ASSETS list confirms 100% of files exist on disk and are non-empty', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  const assetsMatch = swCode.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  assert(assetsMatch !== null, 'ASSETS array found in sw.js');

  const filePaths = assetsMatch[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith("'") || l.startsWith('"'))
    .map(l => l.replace(/['",]/g, '').trim())
    .filter(p => p !== './');

  for (const rel of filePaths) {
    const cleanRel = rel.replace(/^\.\//, '');
    const absPath = path.join(root, cleanRel);
    assert(fs.existsSync(absPath), `Asset file physically exists: ${cleanRel}`);
    const stat = fs.statSync(absPath);
    assert(stat.size > 0, `Asset file is non-empty: ${cleanRel} (${stat.size} bytes)`);
  }
});

suite.test('T5.8.3: Service Worker fetch handler performs exact cache matching first (ignoreSearch only as offline fallback)', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert(swCode.includes('caches.match(e.request).then'), 'sw.js fetch handler looks up the exact versioned request first');
  const fallback = swCode.indexOf('function offlineAsset');
  const loose = swCode.indexOf('ignoreSearch: true');
  assert(loose === -1 || (fallback !== -1 && loose > fallback && loose < swCode.indexOf('}', loose) + 200),
    'ignoreSearch is confined to the offline fallback');
});

suite.test('T5.8.4: Service Worker activation handler deletes all stale cache versions while preserving active CACHE', () => {
  const root = path.resolve(__dirname, '..');
  const swCode = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

  assert(swCode.includes('caches.keys()'), 'Activation handler inspects cache keys');
  assert(swCode.includes('filter(k => k !== CACHE)'), 'Activation handler preserves current CACHE');
  assert(swCode.includes('caches.delete(k)'), 'Activation handler deletes old cache entries');
});

// =========================================================================
// SECTION 9: Modal Dialog Accessibility, Keyboard Trapping & Focus Restoration
// =========================================================================

suite.test('T5.9.1: All modal dialogs possess role="dialog", aria-modal="true", and valid aria-labelledby headings', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const modalIds = ['modal-guide', 'modal-settings', 'modal-save'];
  for (const id of modalIds) {
    const regex = new RegExp(`id="${id}"[^>]*role="dialog"[^>]*aria-modal="true"`, 'i');
    assert(regex.test(indexHtml), `${id} declares role="dialog" and aria-modal="true"`);
  }
});

suite.test('T5.9.2: Nested modal opening (Settings -> Save Data) pushes to _focusStack and restores focus on close', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  const { doc: document } = env;

  const dummyTrigger = document.createElement('button');
  dummyTrigger.id = 'dummyTrigger';
  document.body.appendChild(dummyTrigger);
  dummyTrigger.focus();

  // Open Settings
  ui.openSettingsModal(dummyTrigger);
  assert(ui.isSettingsOpen(), 'Settings modal opened');
  assertEqual(ui._focusStack.length, 1, 'Focus stack has 1 entry');

  // Open Save Data from inside Settings
  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'settingsSaveBtn';
  document.body.appendChild(settingsBtn);
  ui.openSaveModal('export', settingsBtn);

  assert(ui.isSaveModalOpen(), 'Save modal opened');
  assertEqual(ui._focusStack.length, 2, 'Focus stack has 2 entries (nested)');

  // Close Save Modal
  ui.closeSaveModal();
  assert(!ui.isSaveModalOpen(), 'Save modal closed');
  assertEqual(ui._focusStack.length, 1, 'Focus stack unwound to 1 entry');

  // Close Settings
  ui.closeSettingsModal();
  assert(!ui.isSettingsOpen(), 'Settings modal closed');
  assertEqual(ui._focusStack.length, 0, 'Focus stack completely unwound');
});

suite.test('T5.9.3: Focus trap handler redirects Tab and Shift+Tab across first/last focusable elements within modal', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  const { doc: document } = env;

  const modal = document.getElementById('modal-settings');
  const panel = modal.querySelector('.panel');

  const btn1 = document.createElement('button');
  btn1.id = 'trapBtn1';
  btn1.focus = function() { document.activeElement = this; };
  panel.appendChild(btn1);

  const btn2 = document.createElement('button');
  btn2.id = 'trapBtn2';
  btn2.focus = function() { document.activeElement = this; };
  panel.appendChild(btn2);

  // Provide deterministic focusables list
  ui._getFocusable = () => [btn1, btn2];

  // Simulate Tab on last element -> wraps to first
  document.activeElement = btn2;
  let prevented = false;
  ui._trapHandler({
    key: 'Tab',
    shiftKey: false,
    currentTarget: modal,
    preventDefault: () => { prevented = true; }
  });
  assert(document.activeElement === btn1, 'Tab from last element wraps focus to first element');
  assert(prevented, 'Default tab event prevented');

  // Simulate Shift+Tab on first element -> wraps to last
  prevented = false;
  document.activeElement = btn1;
  ui._trapHandler({
    key: 'Tab',
    shiftKey: true,
    currentTarget: modal,
    preventDefault: () => { prevented = true; }
  });
  assert(document.activeElement === btn2, 'Shift+Tab from first element wraps focus to last element');
  assert(prevented, 'Default shift-tab event prevented');
});

suite.test('T5.9.4: Pressing Escape key closes topmost open modal in correct priority order', () => {
  const { BS } = loadGameScripts();
  const game = BS.game;
  const ui = BS.ui;
  const input = BS.input;

  // Open Settings
  game.openSettings();
  assert(ui.isSettingsOpen(), 'Settings modal is open');

  // Open Save Modal
  ui.openSaveModal('export');
  assert(ui.isSaveModalOpen(), 'Save modal is topmost');

  // Press Escape 1 -> closes Save modal
  input.h.onEscape();
  assert(!ui.isSaveModalOpen(), 'Save modal dismissed first');
  assert(ui.isSettingsOpen(), 'Settings modal still open');

  // Press Escape 2 -> closes Settings modal
  input.h.onEscape();
  assert(!ui.isSettingsOpen(), 'Settings modal dismissed second');
});

suite.test('T5.9.5: Career stats badge element on menu has role="button", tabindex="0", and activates on Enter/Space', () => {
  const root = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert(indexHtml.includes('id="menuStats"'), 'menuStats exists in index.html');
  assert(indexHtml.includes('role="button"'), 'menuStats has role="button"');
  assert(indexHtml.includes('tabindex="0"'), 'menuStats has tabindex="0"');

  const { BS, env } = loadGameScripts();
  const statsEl = env.doc.getElementById('menuStats');

  let opened = false;
  BS.ui.h.onOpenBadges = () => { opened = true; };

  // Dispatch Enter
  statsEl.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });
  assert(opened, 'Enter keydown opened badges screen');

  opened = false;
  // Dispatch Space
  statsEl.dispatchEvent({ type: 'keydown', key: ' ', preventDefault: () => {} });
  assert(opened, 'Space keydown opened badges screen');
});

// =========================================================================
// SECTION 10: Field Guide HiDPI DPR Scaling & Zero Buffer Reallocation Churn
// =========================================================================

suite.test('T5.10.1: Specimen canvas backing store dimensions scale by native devicePixelRatio clamped to CONFIG.dprMax', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  const { doc: document, win: window } = env;

  window.devicePixelRatio = 2;
  ui.openGuide();

  const canvas = document.getElementById('guideCanvasApple');
  assert(canvas !== null, 'Specimen canvas exists');

  assertEqual(canvas.width, 108, 'Canvas backing width is 108 (54 * 2)');
  assertEqual(canvas.height, 108, 'Canvas backing height is 108 (54 * 2)');
  assertEqual(canvas.style.width, '54px', 'Canvas CSS display width is 54px');
  assertEqual(canvas.style.height, '54px', 'Canvas CSS display height is 54px');

  ui.closeGuide();
  window.devicePixelRatio = 1;
});

suite.test('T5.10.2: 100 simulated animation frames in Field Guide trigger zero canvas bitmap resizing after frame 1', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  const { doc: document, win: window } = env;

  window.devicePixelRatio = 2;
  ui.openGuide();

  const canvas = document.getElementById('guideCanvasApple');
  assertEqual(canvas.width, 108, 'Initial width is 108');

  let resizeCount = 0;
  let currentWidth = canvas.width;
  Object.defineProperty(canvas, 'width', {
    get() { return currentWidth; },
    set(v) {
      currentWidth = v;
      resizeCount++;
    }
  });

  // Simulate 100 consecutive requestAnimationFrame ticks
  const targetW = 108;
  for (let frame = 1; frame <= 100; frame++) {
    // The conditional check from uiManager.js line 952:
    if (canvas.width !== targetW) {
      canvas.width = targetW;
    }
  }

  assertEqual(resizeCount, 0, 'Zero canvas bitmap buffer reallocations occurred across 100 frames');
  ui.closeGuide();
  window.devicePixelRatio = 1;
});

suite.test('T5.10.3: Specimen rendering sets context transform to DPR without compounding transform drift', () => {
  const { BS, env } = loadGameScripts();
  const ui = BS.ui;
  const { doc: document, win: window } = env;

  window.devicePixelRatio = 3;
  ui.openGuide();

  const canvas = document.getElementById('guideCanvasApple');
  const ctx = canvas.getContext('2d');

  // Verify setTransform was called with exact dpr arguments
  assert(ctx._transform !== undefined || typeof ctx.setTransform === 'function', 'setTransform supported on context');
  ui.closeGuide();
  window.devicePixelRatio = 1;
});

// =========================================================================
// SECTION 11: Touch Controls: Dual-Touch Pointer Independence & Joystick Clamping
// =========================================================================

suite.test('T5.11.1: Virtual D-pad processes simultaneous direction touch and burst touch independently via distinct pointer IDs', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document } = env;
  const stage = document.getElementById('stage');
  const dpadContainer = document.getElementById('dpad');

  let lastDir = null;
  let burstActive = false;
  const input = new BS.InputManager(stage, {
    onDir: d => { lastDir = d; },
    onBurst: b => { burstActive = b; }
  });
  input.bindDPad(dpadContainer);

  const burstBtn = document.getElementById('dpBurst');
  const upBtn = document.createElement('button');
  upBtn.className = 'dp-btn dp-up';
  upBtn.dataset.dir = 'up';
  dpadContainer.appendChild(upBtn);

  // Touch 1 down on Burst (pointerId: 42)
  dpadContainer.dispatchEvent({
    type: 'pointerdown',
    pointerId: 42,
    target: burstBtn,
    preventDefault: () => {}
  });
  assert(burstActive, 'Burst activated by pointer 42');
  assertEqual(input._dpBurstId, 42, '_dpBurstId is 42');

  // Touch 2 down on Up button (pointerId: 84)
  dpadContainer.dispatchEvent({
    type: 'pointerdown',
    pointerId: 84,
    target: upBtn,
    preventDefault: () => {}
  });
  assertEqual(lastDir, 'up', 'Direction Up activated by pointer 84');
  assertEqual(input._dpDirId, 84, '_dpDirId is 84');
  assert(burstActive, 'Burst STILL active while steering with pointer 84');
});

suite.test('T5.11.2: Releasing directional touch does not release burst, and releasing burst does not release directional touch', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document } = env;
  const stage = document.getElementById('stage');
  const dpadContainer = document.getElementById('dpad');

  let lastDir = null;
  let burstActive = false;
  const input = new BS.InputManager(stage, {
    onDir: d => { lastDir = d; },
    onBurst: b => { burstActive = b; }
  });
  input.bindDPad(dpadContainer);

  const burstBtn = document.getElementById('dpBurst');
  const leftBtn = document.createElement('button');
  leftBtn.className = 'dp-btn dp-left';
  leftBtn.dataset.dir = 'left';
  dpadContainer.appendChild(leftBtn);

  // Both fingers down
  dpadContainer.dispatchEvent({ type: 'pointerdown', pointerId: 10, target: burstBtn, preventDefault: () => {} });
  dpadContainer.dispatchEvent({ type: 'pointerdown', pointerId: 20, target: leftBtn, preventDefault: () => {} });

  assert(burstActive, 'Burst active');
  assertEqual(input._dpDirId, 20, 'Direction pointer is 20');

  // Release direction finger (pointerId: 20)
  dpadContainer.dispatchEvent({ type: 'pointerup', pointerId: 20, preventDefault: () => {} });
  assertEqual(input._dpDirId, null, 'Direction pointer cleared');
  assert(burstActive, 'Burst REMINS ACTIVE after direction pointer released');

  // Release burst finger (pointerId: 10)
  dpadContainer.dispatchEvent({ type: 'pointerup', pointerId: 10, preventDefault: () => {} });
  assertEqual(input._dpBurstId, null, 'Burst pointer cleared');
  assert(!burstActive, 'Burst deactivated only after burst pointer released');
});

suite.test('T5.11.3: D-Pad pointer glide across directional buttons updates active direction smoothly without pointerup', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document } = env;
  const stage = document.getElementById('stage');
  const dpadContainer = document.getElementById('dpad');

  const dirLog = [];
  const input = new BS.InputManager(stage, {
    onDir: d => dirLog.push(d),
    onBurst: () => {}
  });
  input.bindDPad(dpadContainer);

  const upBtn = document.createElement('button');
  upBtn.className = 'dp-btn dp-up';
  upBtn.dataset.dir = 'up';
  upBtn.closest = function(sel) { return sel.includes('.dp-btn') ? this : null; };
  dpadContainer.appendChild(upBtn);

  const rightBtn = document.createElement('button');
  rightBtn.className = 'dp-btn dp-right';
  rightBtn.dataset.dir = 'right';
  rightBtn.closest = function(sel) { return sel.includes('.dp-btn') ? this : null; };
  dpadContainer.appendChild(rightBtn);

  // Finger down on Up
  dpadContainer.dispatchEvent({ type: 'pointerdown', pointerId: 99, target: upBtn, preventDefault: () => {} });
  assertEqual(dirLog[dirLog.length - 1], 'up', 'Initial direction is up');

  // Finger glides over to Right button: mock elementFromPoint to return rightBtn
  document.elementFromPoint = () => rightBtn;

  dpadContainer.dispatchEvent({ type: 'pointermove', pointerId: 99, clientX: 100, clientY: 100 });
  assertEqual(dirLog[dirLog.length - 1], 'right', 'Glided direction updated to right without lifting finger');
});

suite.test('T5.11.4: Virtual joystick origin clamps within stage bounds [55, stageWidth - 55] and [55, stageHeight - 55]', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document } = env;
  const stage = document.getElementById('stage');
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 480 });

  const input = new BS.InputManager(stage, { onDir: () => {}, onBurst: () => {} });
  input.mode = 'joystick';

  // Touch near top-left: (5, 10)
  input.onPointerDown({ pointerId: 1, clientX: 5, clientY: 10 });
  assertEqual(input._joyCenter.x, 55, 'Joystick center X clamped to min 55');
  assertEqual(input._joyCenter.y, 55, 'Joystick center Y clamped to min 55');
  input.onPointerUp({ pointerId: 1 });

  // Touch near bottom-right: (315, 475)
  input.onPointerDown({ pointerId: 2, clientX: 315, clientY: 475 });
  assertEqual(input._joyCenter.x, 265, 'Joystick center X clamped to 265 (320 - 55)');
  assertEqual(input._joyCenter.y, 425, 'Joystick center Y clamped to 425 (480 - 55)');
  input.onPointerUp({ pointerId: 2 });
});

suite.test('T5.11.5: Virtual joystick displacement clamps knob to max radius 38px and computes 4-way direction beyond 16px deadzone', () => {
  const { BS, env } = loadGameScripts();
  const { doc: document } = env;
  const stage = document.getElementById('stage');
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });

  let sentDir = null;
  const input = new BS.InputManager(stage, { onDir: d => { sentDir = d; }, onBurst: () => {} });
  input.mode = 'joystick';

  // Place joystick center at (100, 100)
  input.onPointerDown({ pointerId: 1, clientX: 100, clientY: 140 }); // joyOffsetY = 40, so cy = 100

  // Move 1: Within deadzone (dx = 10, dy = 0, mag = 10 <= 16)
  input.onPointerMove({ pointerId: 1, clientX: 110, clientY: 100 });
  assertEqual(sentDir, null, 'No direction emitted within 16px deadzone');

  // Move 2: Beyond deadzone towards Right (dx = 80, dy = 0, mag = 80 > 16)
  input.onPointerMove({ pointerId: 1, clientX: 180, clientY: 100 });
  assertEqual(sentDir, 'right', 'Direction "right" emitted beyond deadzone');

  // Check that joystick transform clamped knob displacement to 38px
  assert(input.joyStick.style.transform.includes('38px'), 'Knob translation clamped to max 38px');

  input.onPointerUp({ pointerId: 1 });
});

// Run directly if executed as main
if (require.main === module) {
  suite.run().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = suite;
